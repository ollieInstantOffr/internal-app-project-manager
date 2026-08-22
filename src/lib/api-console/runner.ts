import "server-only";
import { db } from "../db";
import { HttpError } from "../auth";
import { evaluateAssertions, type AssertionResult } from "./assertions";
import type { HttpMethod } from "@/generated/prisma/enums";
import { decryptSecret } from "../crypto";

const TIMEOUT_MS = 20_000;
const MAX_BODY_CHARS = 200_000;

export type EnvironmentAuth = {
  authType: "NONE" | "BEARER" | "BASIC" | "HEADER" | "QUERY";
  authToken: string | null;
  authUsername: string | null;
  authName: string | null;
};

export type ExecutedRequest = {
  name: string;
  method: HttpMethod;
  url: string;
  requestBody: string | null;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  sizeBytes: number;
  responseBody: string | null;
  responseHeaders: Record<string, string>;
  error: string | null;
  assertions: AssertionResult[];
  passedCount: number;
  failedCount: number;
};

/** `$env.NAME` and `{{NAME}}` both resolve from the environment's variables. */
export function interpolate(input: string, vars: Record<string, string>): string {
  return input
    .replace(/\$env\.([A-Za-z_][A-Za-z0-9_]*)/g, (whole, key) => vars[key] ?? whole)
    .replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, key) => vars[key] ?? whole);
}

export function buildUrl(baseUrl: string, path: string, vars: Record<string, string>) {
  const base = interpolate(baseUrl, vars).replace(/\/+$/, "");
  const suffix = interpolate(path, vars);
  if (/^https?:\/\//i.test(suffix)) return suffix;
  return `${base}${suffix.startsWith("/") ? "" : "/"}${suffix}`;
}

export async function executeRequest(opts: {
  name: string;
  method: HttpMethod;
  path: string;
  body?: string | null;
  headers?: Record<string, string> | null;
  params?: Record<string, string> | null;
  assertions?: string | null;
  baseUrl: string;
  variables: Record<string, string>;
  auth?: EnvironmentAuth | null;
  skipAuth?: boolean;
}): Promise<ExecutedRequest> {
  const vars = opts.variables;
  let url = buildUrl(opts.baseUrl, opts.path, vars);

  const query = Object.entries(opts.params ?? {}).filter(([k]) => k);
  if (query.length) {
    const search = new URLSearchParams(
      query.map(([k, v]) => [k, interpolate(String(v), vars)]),
    ).toString();
    url += (url.includes("?") ? "&" : "?") + search;
  }

  const authApplied =
    !opts.skipAuth && opts.auth ? authFor(opts.auth, vars) : { headers: {}, query: {} };
  for (const [key, value] of Object.entries(authApplied.query)) {
    url += (url.includes("?") ? "&" : "?") + `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }

  // Only ever speak HTTP. Anything else is a mistake or an attempt at something worse.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return failed(opts, url, `"${url}" is not a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failed(opts, url, `${parsed.protocol} is not supported — use http or https`);
  }

  // Environment auth goes on first so an explicit header on the request still
  // wins — a login endpoint can override it, or opt out entirely.
  const headers: Record<string, string> = { ...authApplied.headers };

  for (const [key, value] of Object.entries(opts.headers ?? {})) {
    if (key) headers[key] = interpolate(String(value), vars);
  }

  const hasBody = !["GET", "HEAD"].includes(opts.method);
  const body = hasBody && opts.body ? interpolate(opts.body, vars) : undefined;
  if (body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method,
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `timed out after ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : "request failed";
    return failed(opts, url, message, durationMs);
  }

  const durationMs = Date.now() - started;
  const text = (await response.text().catch(() => "")).slice(0, MAX_BODY_CHARS);

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });

  const assertions = evaluateAssertions(opts.assertions ?? null, {
    status: response.status,
    durationMs,
    body: text,
    headers: responseHeaders,
  });

  return {
    name: opts.name,
    method: opts.method,
    url,
    requestBody: body ?? null,
    status: response.status,
    statusText: response.statusText,
    durationMs,
    sizeBytes: new TextEncoder().encode(text).length,
    responseBody: text,
    responseHeaders,
    error: null,
    assertions,
    passedCount: assertions.filter((a) => a.ok).length,
    failedCount: assertions.filter((a) => !a.ok).length,
  };
}

function failed(
  opts: { name: string; method: HttpMethod; assertions?: string | null },
  url: string,
  error: string,
  durationMs = 0,
): ExecutedRequest {
  // A transport failure fails every assertion — nothing was proven.
  const assertions = evaluateAssertions(opts.assertions ?? null, {
    status: null,
    durationMs,
    body: null,
    headers: {},
  });
  return {
    name: opts.name,
    method: opts.method,
    url,
    requestBody: null,
    status: null,
    statusText: null,
    durationMs,
    sizeBytes: 0,
    responseBody: null,
    responseHeaders: {},
    error,
    assertions,
    passedCount: assertions.filter((a) => a.ok).length,
    failedCount: assertions.filter((a) => !a.ok).length,
  };
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/** Runs a whole collection (or the whole project) and records the run. */
export async function runCollection(opts: {
  orgId: string;
  projectId: string;
  collectionId: string | null;
  environmentId: string;
  userId: string;
}) {
  const environment = await db.apiEnvironment.findFirst({
    where: { id: opts.environmentId, projectId: opts.projectId },
  });
  if (!environment) throw new HttpError(404, "Environment not found");

  const requests = await db.apiRequest.findMany({
    where: {
      collection: {
        projectId: opts.projectId,
        ...(opts.collectionId ? { id: opts.collectionId } : {}),
      },
    },
    orderBy: [{ collection: { position: "asc" } }, { position: "asc" }],
  });
  if (!requests.length) throw new HttpError(400, "There are no requests to run");

  const variables = (environment.variables as Record<string, string> | null) ?? {};
  const auth = authOf(environment);
  const executed: ExecutedRequest[] = [];

  for (const request of requests) {
    executed.push(
      await executeRequest({
        name: request.name,
        method: request.method,
        path: request.path,
        body: request.body,
        headers: request.headers as Record<string, string> | null,
        params: request.params as Record<string, string> | null,
        assertions: request.assertions,
        baseUrl: environment.baseUrl,
        variables,
        auth,
        skipAuth: request.skipAuth,
      }),
    );
  }

  // A request with no assertions still counts: reaching a 2xx is the assertion.
  const passed = executed.filter((r) => r.failedCount === 0 && !r.error).length;
  const failed_ = executed.length - passed;

  const run = await db.apiRun.create({
    data: {
      projectId: opts.projectId,
      environmentId: environment.id,
      collectionId: opts.collectionId,
      triggeredById: opts.userId,
      passed,
      failed: failed_,
      requestCount: executed.length,
      p95Ms: percentile(
        executed.map((r) => r.durationMs),
        95,
      ),
      results: {
        create: executed.map((result, index) => ({
          requestId: requests[index].id,
          name: result.name,
          method: result.method,
          url: result.url,
          requestBody: result.requestBody,
          status: result.status,
          statusText: result.statusText,
          durationMs: result.durationMs,
          sizeBytes: result.sizeBytes,
          responseBody: result.responseBody,
          responseHeaders: result.responseHeaders as never,
          error: result.error,
          assertions: result.assertions as never,
          passedCount: result.passedCount,
          failedCount: result.failedCount,
        })),
      },
    },
    include: { results: { orderBy: { createdAt: "asc" } } },
  });

  return run;
}


/** Narrows an environment row to just its auth settings. */
export function authOf(environment: {
  authType: string;
  authToken: string | null;
  authUsername: string | null;
  authName: string | null;
}): EnvironmentAuth {
  return {
    authType: environment.authType as EnvironmentAuth["authType"],
    authToken: decryptSecret(environment.authToken),
    authUsername: environment.authUsername,
    authName: environment.authName,
  };
}

/** Turns an environment's auth settings into headers or query parameters. */
export function authFor(
  auth: EnvironmentAuth,
  vars: Record<string, string>,
): { headers: Record<string, string>; query: Record<string, string> } {
  const token = auth.authToken ? interpolate(auth.authToken, vars) : "";
  if (auth.authType === "NONE" || !token) return { headers: {}, query: {} };

  switch (auth.authType) {
    case "BEARER":
      return { headers: { Authorization: `Bearer ${token}` }, query: {} };
    case "BASIC": {
      const user = auth.authUsername ? interpolate(auth.authUsername, vars) : "";
      const encoded = Buffer.from(`${user}:${token}`).toString("base64");
      return { headers: { Authorization: `Basic ${encoded}` }, query: {} };
    }
    case "HEADER":
      return { headers: { [auth.authName || "Authorization"]: token }, query: {} };
    case "QUERY":
      return { headers: {}, query: { [auth.authName || "api_key"]: token } };
    default:
      return { headers: {}, query: {} };
  }
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type ConsoleRequest = {
  id: string;
  name: string;
  method: Method;
  path: string;
  body: string | null;
  headers: Record<string, string> | null;
  params: Record<string, string> | null;
  assertions: string | null;
  skipAuth: boolean;
  failing: boolean;
};

export type ConsoleCollection = {
  id: string;
  name: string;
  source: "REPO" | "MANUAL";
  repoPath: string | null;
  requests: ConsoleRequest[];
};

export type AuthType = "NONE" | "BEARER" | "BASIC" | "HEADER" | "QUERY";

export type ConsoleEnvironment = {
  id: string;
  name: string;
  baseUrl: string;
  kind: "STATIC" | "PR_PREVIEW";
  prNumber: number | null;
  color: string;
  variables: Record<string, string> | null;
  authType: AuthType;
  authUsername: string | null;
  authName: string | null;
  /** The token itself never reaches the browser. */
  authTokenSet: boolean;
  authTokenHint: string | null;
};

export const AUTH_LABEL: Record<AuthType, string> = {
  NONE: "No auth",
  BEARER: "Bearer token",
  BASIC: "Basic auth",
  HEADER: "Custom header",
  QUERY: "Query parameter",
};

export function describeAuth(env: ConsoleEnvironment | null): string {
  if (!env || env.authType === "NONE") return "No auth";
  if (!env.authTokenSet) return `${AUTH_LABEL[env.authType]} · not set`;
  if (env.authType === "BASIC") return `Basic · ${env.authUsername ?? "user"}`;
  if (env.authType === "HEADER") return `${env.authName ?? "Authorization"} · ${env.authTokenHint}`;
  if (env.authType === "QUERY") return `?${env.authName ?? "api_key"}=${env.authTokenHint}`;
  return `Bearer ${env.authTokenHint}`;
}

export type AssertionResult = { source: string; ok: boolean; detail: string };

export type SendResult = {
  name: string;
  method: Method;
  url: string;
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

export type ConsoleState = {
  project: { id: string; key: string; name: string; repoFullName: string | null };
  collections: ConsoleCollection[];
  environments: ConsoleEnvironment[];
  latestRun: {
    id: string;
    passed: number;
    failed: number;
    p95Ms: number;
    requestCount: number;
    createdAt: string;
    environmentName: string | null;
    collectionId: string | null;
  } | null;
};

export function statusClass(status: number | null, error: string | null) {
  if (error || status === null) return "status-err";
  if (status < 300) return "status-2xx";
  if (status < 400) return "status-3xx";
  if (status < 500) return "status-4xx";
  return "status-5xx";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function prettyJson(value: string | null) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

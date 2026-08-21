import "server-only";
import type { HttpMethod } from "@/generated/prisma/enums";
import { listRepoTree, readRepoFile, type RepoTreeEntry } from "../github";
import { inferShape } from "./infer";

export type DiscoveredRequest = {
  name: string;
  method: HttpMethod;
  path: string;
  sourceFile: string;
  assertions: string;
  body: string | null;
  headers: Record<string, string> | null;
  params: Record<string, string> | null;
};

export type DiscoveredCollection = {
  name: string;
  repoPath: string;
  requests: DiscoveredRequest[];
};

export type Discovery = {
  found: boolean;
  ref: string;
  apiRoots: string[];
  style: "next-app-router" | "next-pages-router" | "files" | "none";
  collections: DiscoveredCollection[];
  truncated: boolean;
};

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORED = /(^|\/)(node_modules|\.next|dist|build|coverage|\.git)(\/|$)/;
const ALL_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/**
 * Looks for an `api` folder anywhere in the repo and turns what it finds into
 * collections. Next.js route handlers are understood properly — the exported
 * verbs become separate requests — and anything else degrades to one GET per file.
 */
export async function discoverApi(token: string, repoFullName: string): Promise<Discovery> {
  const { entries, truncated, ref } = await listRepoTree(token, repoFullName);
  const files = entries.filter((e) => e.type === "blob" && !IGNORED.test(e.path));
  const paths = files.map((f) => f.path);

  // Schema modules are shared across many routes; read each at most once.
  const cache = new Map<string, Promise<string | null>>();
  const read = (path: string) => {
    if (!cache.has(path)) cache.set(path, readRepoFile(token, repoFullName, path, ref).catch(() => null));
    return cache.get(path)!;
  };

  const apiRoots = findApiRoots(files);
  if (!apiRoots.length) {
    return { found: false, ref, apiRoots: [], style: "none", collections: [], truncated };
  }

  const inApi = files.filter((f) => apiRoots.some((root) => f.path.startsWith(`${root}/`)));

  const routeHandlers = inApi.filter((f) => /(^|\/)route\.(ts|tsx|js|mjs)$/.test(f.path));
  if (routeHandlers.length) {
    return {
      found: true,
      ref,
      apiRoots,
      style: "next-app-router",
      truncated,
      collections: group(
        (await mapWithConcurrency(routeHandlers, 8, (file) =>
          fromRouteHandler(file, apiRoots, paths, read),
        )).flat(),
        apiRoots,
      ),
    };
  }

  const pagesStyle = apiRoots.some((r) => /(^|\/)pages\/api$/.test(r));
  const codeFiles = inApi.filter((f) => CODE.test(f.path));

  return {
    found: codeFiles.length > 0,
    ref,
    apiRoots,
    style: pagesStyle ? "next-pages-router" : "files",
    truncated,
    collections: group(
      codeFiles.map((file) => fromPlainFile(file, apiRoots)),
      apiRoots,
    ),
  };
}

/** Every distinct directory literally named `api`. */
function findApiRoots(files: RepoTreeEntry[]): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    const segments = file.path.split("/");
    const index = segments.lastIndexOf("api");
    if (index === -1 || index === segments.length - 1) continue;
    roots.add(segments.slice(0, index + 1).join("/"));
  }

  // Drop nested roots — `src/app/api` wins over `src/app/api/v2/api`.
  return [...roots]
    .sort()
    .filter((root, _, all) => !all.some((other) => other !== root && root.startsWith(`${other}/`)));
}

async function fromRouteHandler(
  file: RepoTreeEntry,
  roots: string[],
  paths: string[],
  read: (path: string) => Promise<string | null>,
): Promise<DiscoveredRequest[]> {
  const endpoint = endpointFor(file.path.replace(/\/route\.(ts|tsx|js|mjs)$/, ""), roots);
  const source = await read(file.path);
  const methods = source ? exportedMethods(source) : ["GET" as HttpMethod];
  const list = methods.length ? methods : (["GET"] as HttpMethod[]);

  return Promise.all(
    list.map(async (method) => {
      // Read the handler's own schema so the request arrives ready to send.
      const shape = source
        ? await inferShape({ source, filePath: file.path, method, files: paths, read })
        : { body: null, headers: null, params: null };

      return {
        method,
        path: endpoint,
        name: nameFor(method, endpoint),
        sourceFile: file.path,
        assertions: defaultAssertions(method),
        body: shape.body ?? bodyFor(method),
        headers: shape.headers,
        params: shape.params,
      };
    }),
  );
}

/** Keeps the GitHub API happy while still reading dozens of files quickly. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        out[index] = await fn(items[index]);
      }
    }),
  );

  return out;
}

function fromPlainFile(file: RepoTreeEntry, roots: string[]): DiscoveredRequest {
  const withoutExt = file.path.replace(CODE, "").replace(/\/index$/, "");
  const endpoint = endpointFor(withoutExt, roots);
  return {
    method: "GET",
    path: endpoint,
    name: nameFor("GET", endpoint),
    sourceFile: file.path,
    assertions: defaultAssertions("GET"),
    body: null,
    headers: null,
    params: null,
  };
}

/** `src/app/api/issues/[key]` → `/api/issues/:key` */
function endpointFor(dir: string, roots: string[]): string {
  const root = roots.find((r) => dir.startsWith(r)) ?? "";
  const rest = dir.slice(root.length).replace(/^\/+/, "");
  const segments = rest
    .split("/")
    .filter(Boolean)
    // Route groups like (app) aren't part of the URL.
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) =>
      /^\[\[?\.\.\.(.+?)\]?\]$/.test(segment)
        ? `:${segment.replace(/^\[\[?\.\.\./, "").replace(/\]?\]$/, "")}`
        : /^\[(.+)\]$/.test(segment)
          ? `:${segment.slice(1, -1)}`
          : segment,
    );

  return `/api${segments.length ? `/${segments.join("/")}` : ""}`;
}

function exportedMethods(source: string): HttpMethod[] {
  const found = new Set<HttpMethod>();
  for (const method of ALL_METHODS) {
    const patterns = [
      // export async function GET(…)  /  export function GET(…)
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
      // export const GET = …
      new RegExp(`export\\s+(?:const|let|var)\\s+${method}\\b`),
      // export { GET } / export { handler as GET }
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`),
    ];
    if (patterns.some((p) => p.test(source))) found.add(method);
  }
  return [...found];
}

function nameFor(method: HttpMethod, endpoint: string) {
  const segments = endpoint.split("/").filter((s) => s && s !== "api");
  if (!segments.length) return `${method} /api`;

  const last = segments[segments.length - 1];
  const resource = segments
    .map((s) => (s.startsWith(":") ? `by ${s.slice(1)}` : s))
    .join(" ")
    .replace(/[-_]/g, " ");

  const verb =
    method === "GET"
      ? last.startsWith(":")
        ? "Get"
        : "List"
      : method === "POST"
        ? "Create"
        : method === "PUT" || method === "PATCH"
          ? "Update"
          : method === "DELETE"
            ? "Delete"
            : method;

  return `${verb} ${resource}`.replace(/\s+/g, " ").trim();
}

function defaultAssertions(method: HttpMethod) {
  const lines = [
    method === "POST" ? "status < 300" : method === "DELETE" ? "status < 400" : "status == 200",
    "duration < 2000ms",
  ];
  return lines.join("\n");
}

function bodyFor(method: HttpMethod) {
  return method === "POST" || method === "PUT" || method === "PATCH" ? "{\n  \n}" : null;
}

/** One collection per first path segment — Auth, Issues, Webhooks, and so on. */
function group(requests: DiscoveredRequest[], roots: string[]): DiscoveredCollection[] {
  const byGroup = new Map<string, DiscoveredRequest[]>();

  for (const request of requests) {
    const segments = request.path.split("/").filter((s) => s && s !== "api");
    const key = segments[0] ?? "root";
    const list = byGroup.get(key) ?? [];
    list.push(request);
    byGroup.set(key, list);
  }

  return [...byGroup.entries()]
    .map(([key, list]) => ({
      name: key === "root" ? "Root" : titleize(key),
      repoPath: `${roots[0] ?? "api"}/${key === "root" ? "" : key}`.replace(/\/$/, ""),
      requests: list.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function titleize(value: string) {
  return value
    .replace(/^:/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

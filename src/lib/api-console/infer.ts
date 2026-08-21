import type { HttpMethod } from "@/generated/prisma/enums";
import { exampleFromSchema, findSchemaExpression } from "./zod-example";

export type InferredShape = {
  body: string | null;
  headers: Record<string, string> | null;
  params: Record<string, string> | null;
};

export type FileReader = (path: string) => Promise<string | null>;

const ALL_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/**
 * Works out what a route handler actually expects, so an imported request can
 * be sent without being filled in by hand: the body from its Zod schema, query
 * params from `searchParams.get(...)`, and an auth header if it reads one.
 */
export async function inferShape(opts: {
  source: string;
  filePath: string;
  method: HttpMethod;
  files: string[];
  read: FileReader;
}): Promise<InferredShape> {
  const scope = scopeFor(opts.source, opts.method);

  const [body, params, headers] = await Promise.all([
    inferBody(scope, opts),
    Promise.resolve(inferParams(scope)),
    Promise.resolve(inferHeaders(scope, opts.source)),
  ]);

  return { body, params, headers };
}

/**
 * Everything between one exported method and the next. Crude, but a route file
 * is small and this keeps GET's `searchParams` out of POST's shape.
 */
function scopeFor(source: string, method: HttpMethod): string {
  const positions = ALL_METHODS.map((m) => {
    const match = new RegExp(
      `export\\s+(?:async\\s+)?(?:function\\s+${m}\\b|const\\s+${m}\\b)`,
    ).exec(source);
    return match ? { method: m, at: match.index } : null;
  })
    .filter(Boolean)
    .sort((a, b) => a!.at - b!.at) as { method: HttpMethod; at: number }[];

  const index = positions.findIndex((p) => p.method === method);
  if (index === -1) return source;

  const start = positions[index].at;
  const end = index + 1 < positions.length ? positions[index + 1].at : source.length;
  return source.slice(start, end);
}

async function inferBody(
  scope: string,
  opts: { source: string; filePath: string; files: string[]; read: FileReader },
): Promise<string | null> {
  const schemaName =
    // parseBody(req, someSchema)
    /parseBody\s*\(\s*[\w.]+\s*,\s*([A-Za-z_$][\w$]*)/.exec(scope)?.[1] ??
    // anything.parse(body) / .safeParse(...) — the name needn't end in "Schema";
    // it only counts if it resolves to a zod expression below.
    /\b([A-Za-z_$][\w$]*)\s*\.\s*(?:safeParse|parse)\s*\(/.exec(scope)?.[1] ??
    null;

  if (schemaName) {
    const resolved = await resolveSchema(schemaName, opts);
    if (resolved) {
      const { expression, moduleSource } = resolved;
      // Sibling schemas usually live beside the one we resolved, so search that
      // module first and fall back to the route file.
      const lookup = (name: string) =>
        findSchemaExpression(moduleSource, name) ?? findSchemaExpression(opts.source, name);
      const { value } = exampleFromSchema(expression, lookup);
      if (value && typeof value === "object" && Object.keys(value).length) {
        return JSON.stringify(value, null, 2);
      }
      if (value !== null) return JSON.stringify(value, null, 2);
    }
  }

  // An inline schema literal, defined right in the call.
  const inline = /parseBody\s*\(\s*[\w.]+\s*,\s*(z\.object\([\s\S]*?\))\s*\)/.exec(scope);
  if (inline) {
    const { value } = exampleFromSchema(inline[1], () => null);
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  }

  // No schema at all — read the fields straight off how the handler uses the
  // parsed JSON. Plenty of routes validate by hand and never declare a shape.
  const fromUsage = inferFromJsonUsage(scope);
  if (fromUsage) return fromUsage;

  return null;
}

/**
 * Handles the common hand-rolled shape:
 *
 *   const body = await req.json().catch(() => null);
 *   const name = typeof body?.name === "string" ? body.name.trim() : "";
 *
 * Finds the variable bound to `req.json()`, collects every field read off it,
 * and takes the type from the `typeof` guard where there is one.
 */
function inferFromJsonUsage(scope: string): string | null {
  const vars = new Set<string>();

  for (const match of scope.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:await\s+)?(?:req|request)\s*\.\s*json\s*\(/g,
  )) {
    vars.add(match[1]);
  }

  // `const { a, b } = await req.json()` — destructured straight away.
  const fields = new Map<string, unknown>();
  for (const match of scope.matchAll(
    /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req|request)\s*\.\s*json\s*\(/g,
  )) {
    for (const key of splitKeys(match[1])) fields.set(key, "");
  }

  for (const name of vars) {
    const ident = escape(name);

    // body.field / body?.field — but not body.json(), which is a call.
    for (const match of scope.matchAll(
      new RegExp(`\\b${ident}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)\\s*(?!\\()`, "g"),
    )) {
      fields.set(match[1], "");
    }
    // body["field"]
    for (const match of scope.matchAll(
      new RegExp(`\\b${ident}\\s*\\??\\[\\s*["'\`]([^"'\`]+)["'\`]\\s*\\]`, "g"),
    )) {
      fields.set(match[1], "");
    }
    // const { a, b } = body
    for (const match of scope.matchAll(
      new RegExp(`(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*${ident}\\b`, "g"),
    )) {
      for (const key of splitKeys(match[1])) fields.set(key, "");
    }

    // typeof body?.field === "string" tells us the type outright.
    for (const match of scope.matchAll(
      new RegExp(
        `typeof\\s+${ident}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)\\s*===\\s*["'\`](\\w+)["'\`]`,
        "g",
      ),
    )) {
      fields.set(match[1], match[2] === "number" ? 0 : match[2] === "boolean" ? false : "");
    }
    // Array.isArray(body?.field)
    for (const match of scope.matchAll(
      new RegExp(`Array\\.isArray\\(\\s*${ident}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, "g"),
    )) {
      fields.set(match[1], []);
    }
  }

  if (fields.size === 0) return null;

  const shaped = Object.fromEntries(
    [...fields.entries()].map(([key, value]) => [key, value === "" ? hintFor(key) : value]),
  );
  return JSON.stringify(shaped, null, 2);
}

function splitKeys(source: string) {
  return source
    .split(",")
    .map((k) => k.split(":")[0].replace(/\.\.\./, "").trim())
    .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
}

function hintFor(key: string): unknown {
  const k = key.toLowerCase();
  if (k.includes("email")) return "user@example.com";
  if (k.endsWith("url") || k.includes("link")) return "https://example.com";
  if (k.includes("count") || k.includes("qty") || k.includes("limit")) return 0;
  if (k.startsWith("is") || k.startsWith("has") || k.includes("enabled")) return false;
  return "";
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Follows the import that a schema name came from, if it isn't local. */
async function resolveSchema(
  name: string,
  opts: { source: string; filePath: string; files: string[]; read: FileReader },
): Promise<{ expression: string; moduleSource: string } | null> {
  const local = findSchemaExpression(opts.source, name);
  if (local) return { expression: local, moduleSource: opts.source };

  const importMatch = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`,
  ).exec(opts.source);
  if (!importMatch) return null;

  const target = resolveModulePath(importMatch[1], opts.filePath, opts.files);
  if (!target) return null;

  const source = await opts.read(target);
  if (!source) return null;

  const expression = findSchemaExpression(source, name);
  if (!expression) return null;

  return { expression, moduleSource: source };
}

/** Maps `@/lib/validators` or `../../lib/x` onto a real file in the tree. */
export function resolveModulePath(
  specifier: string,
  fromFile: string,
  files: string[],
): string | null {
  const candidates: string[] = [];

  if (specifier.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1);
    for (const part of specifier.split("/")) {
      if (part === ".") continue;
      else if (part === "..") dir.pop();
      else dir.push(part);
    }
    candidates.push(dir.join("/"));
  } else if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    candidates.push(`src/${rest}`, rest, `app/${rest}`);
  } else if (specifier.startsWith("~/")) {
    candidates.push(`src/${specifier.slice(2)}`, specifier.slice(2));
  } else {
    return null; // a package, not a file in this repo
  }

  const extensions = [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
  for (const base of candidates) {
    if (files.includes(base)) return base;
    for (const ext of extensions) {
      if (files.includes(base + ext)) return base + ext;
    }
  }
  return null;
}

function inferParams(scope: string): Record<string, string> | null {
  const params: Record<string, string> = {};

  for (const match of scope.matchAll(
    /searchParams\s*\.\s*(?:get|getAll)\s*\(\s*["'`]([^"'`]+)["'`]/g,
  )) {
    params[match[1]] = "";
  }
  for (const match of scope.matchAll(/\bquery\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
    params[match[1]] = "";
  }

  return Object.keys(params).length ? params : null;
}

function inferHeaders(scope: string, source: string): Record<string, string> | null {
  const headers: Record<string, string> = {};

  const readsAuth =
    /headers\s*\.\s*get\s*\(\s*["'`]authorization["'`]/i.test(scope) ||
    /requireApiContext|Bearer\s/i.test(scope) ||
    /requireApiContext/.test(source);
  if (readsAuth) headers.Authorization = "Bearer $env.API_TOKEN";

  const signature = /x-hub-signature|x-signature|webhook.*secret/i.test(scope);
  if (signature) headers["X-Hub-Signature-256"] = "$env.WEBHOOK_SIGNATURE";

  return Object.keys(headers).length ? headers : null;
}

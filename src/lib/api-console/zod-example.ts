/**
 * Turns a Zod schema — as source text, not at runtime — into an example JSON
 * value. Route handlers already declare exactly what they accept; this reads
 * that declaration so an imported request arrives ready to send.
 *
 * Only the required fields are emitted. That's the smallest body that should
 * succeed, and it's what you'd type by hand.
 */

export type SchemaLookup = (name: string) => string | null;

export function exampleFromSchema(
  expression: string,
  lookup: SchemaLookup,
  depth = 0,
): { value: unknown; optional: boolean } {
  // Chains are often broken across lines (`z\n  .string()\n  .min(2)`); join them
  // back up so the base call can be recognised.
  const expr = expression.replace(/\s*\n\s*\./g, ".").trim();
  if (depth > 6) return { value: null, optional: false };

  const base = splitChain(expr);
  if (!base) return { value: null, optional: false };

  // Modifiers only count when they hang off the end of the top-level chain —
  // a `.default()` nested inside z.object({…}) belongs to a field, not to this.
  const optional = /\.(optional|nullish)\(\s*\)/.test(base.chain);

  const defaulted = matchCall(base.chain, ".default");
  if (defaulted) return { value: literal(defaulted.args) ?? null, optional: true };

  const head = base.head;

  // A named schema referenced from elsewhere, possibly reshaped. Its chain runs
  // from the end of the identifier, not from the first bracket.
  if (!head.startsWith("z.")) {
    const name = /^([A-Za-z_$][\w$]*)/.exec(expr)?.[1];
    if (!name) return { value: null, optional };

    const chain = expr.slice(name.length);
    const optionalHere = /\.(optional|nullish)\(\s*\)/.test(chain) || /\.default\(/.test(chain);

    const source = lookup(name);
    if (!source) return { value: null, optional: optionalHere };

    const resolved = exampleFromSchema(source, lookup, depth + 1);
    return {
      value: applyOps(resolved.value, chain, lookup, depth),
      optional: optionalHere || resolved.optional,
    };
  }

  const object = matchCall(head, "z.object");
  if (object) {
    const value = fieldsOf(object.args, lookup, depth);
    return { value: applyOps(value, base.chain, lookup, depth), optional };
  }

  const array = matchCall(head, "z.array");
  if (array) {
    const inner = exampleFromSchema(array.args, lookup, depth + 1);
    return { value: [inner.value === null ? "string" : inner.value], optional };
  }

  const enumeration = matchCall(head, "z.enum");
  if (enumeration) {
    const first = /["\'`]([^"\'`]+)["\'`]/.exec(enumeration.args);
    return { value: first ? first[1] : "", optional };
  }

  const union = matchCall(head, "z.union");
  if (union) {
    const first = splitTopLevel(union.args.replace(/^\s*\[/, "").replace(/\]\s*$/, ""))[0];
    return first ? exampleFromSchema(first, lookup, depth + 1) : { value: null, optional };
  }

  if (matchCall(head, "z.record") || matchCall(head, "z.map")) return { value: {}, optional };
  if (matchCall(head, "z.nativeEnum")) return { value: null, optional };
  if (/^z\.(coerce\.)?date\(/.test(head)) {
    return { value: "2026-01-01T00:00:00.000Z", optional };
  }
  if (/^z\.(coerce\.)?(number|bigint)\(/.test(head)) {
    const min = /\.min\((\d+)/.exec(base.chain);
    return { value: min ? Number(min[1]) : /\.positive\(\)/.test(base.chain) ? 1 : 0, optional };
  }
  if (/^z\.(coerce\.)?boolean\(/.test(head)) return { value: false, optional };
  if (/^z\.literal\(/.test(head)) {
    const lit = matchCall(head, "z.literal");
    return { value: lit ? (literal(lit.args) ?? null) : null, optional };
  }
  if (/^z\.(any|unknown)\(/.test(head)) return { value: null, optional };
  if (/^z\.(coerce\.)?string\(/.test(head) || /^z\.email\(/.test(head)) {
    return { value: stringExample(base.chain), optional };
  }

  return { value: null, optional };
}

/**
 * Splits `z.string().min(2).optional()` into its base call and the chain of
 * modifiers that follow it, so nested calls can't be mistaken for modifiers.
 */
function splitChain(expr: string): { head: string; chain: string } | null {
  const open = expr.indexOf("(");
  if (open === -1) return { head: expr.trim(), chain: "" };

  const close = matchBracket(expr, open);
  if (close === -1) return { head: expr.trim(), chain: "" };

  return { head: expr.slice(0, close + 1), chain: expr.slice(close + 1) };
}

/** `.partial()`, `.omit({…})`, `.pick({…})`, `.extend({…})` on an object schema. */
function applyOps(value: unknown, ops: string, lookup: SchemaLookup, depth: number): unknown {
  if (!ops || typeof value !== "object" || value === null || Array.isArray(value)) return value;
  let out = { ...(value as Record<string, unknown>) };

  const omit = matchCall(ops, ".omit");
  if (omit) for (const key of keysOf(omit.args)) delete out[key];

  const pick = matchCall(ops, ".pick");
  if (pick) {
    const keep = new Set(keysOf(pick.args));
    out = Object.fromEntries(Object.entries(out).filter(([k]) => keep.has(k)));
  }

  const extend = matchCall(ops, ".extend");
  if (extend) out = { ...out, ...(fieldsOf(extend.args, lookup, depth) as Record<string, unknown>) };

  // `.partial()` makes everything optional, so the minimal body is empty.
  if (/\.partial\(\s*\)/.test(ops)) return {};

  return out;
}

function fieldsOf(objectLiteral: string, lookup: SchemaLookup, depth: number) {
  const inner = objectLiteral.trim().replace(/^\{/, "").replace(/\}$/, "");
  const out: Record<string, unknown> = {};

  for (const entry of splitTopLevel(inner)) {
    const colon = indexOfTopLevel(entry, ":");

    // Shorthand `{ email }` names a schema declared elsewhere in the module.
    const key = (colon === -1 ? entry : entry.slice(0, colon))
      .trim()
      .replace(/^["'`]|["'`]$/g, "");
    if (!/^[A-Za-z_$][\w$]*$/.test(key)) continue;

    const valueExpr = colon === -1 ? key : entry.slice(colon + 1);
    const { value, optional } = exampleFromSchema(valueExpr, lookup, depth + 1);

    // Only required fields — the smallest body that should succeed.
    if (optional) continue;
    out[key] = value === null ? nameHint(key) : value;
  }

  return out;
}

function stringExample(expr: string) {
  if (/\.email\(/.test(expr)) return "user@example.com";
  if (/\.url\(/.test(expr)) return "https://example.com";
  if (/\.uuid\(/.test(expr)) return "00000000-0000-4000-8000-000000000000";
  if (/\.datetime\(/.test(expr)) return "2026-01-01T00:00:00.000Z";
  const min = /\.min\((\d+)/.exec(expr);
  const length = min ? Number(min[1]) : 0;
  return length > 6 ? "x".repeat(length) : "string";
}

/** When a field's type gives nothing away, the name usually does. */
function nameHint(key: string): unknown {
  const k = key.toLowerCase();
  if (k.includes("email")) return "user@example.com";
  if (k.endsWith("url") || k.includes("link")) return "https://example.com";
  if (k.endsWith("id") || k.endsWith("ids")) return k.endsWith("ids") ? [] : "";
  if (k.includes("count") || k.includes("number") || k.includes("qty")) return 0;
  if (k.startsWith("is") || k.startsWith("has") || k.includes("enabled")) return false;
  if (k.includes("date") || k.endsWith("at")) return "2026-01-01T00:00:00.000Z";
  return "";
}

/* ── tiny balanced-source helpers ──────────────────────────── */

function matchCall(source: string, callee: string) {
  const at = source.indexOf(`${callee}(`);
  if (at === -1) return null;
  const open = at + callee.length;
  const close = matchBracket(source, open);
  if (close === -1) return null;
  return {
    args: source.slice(open + 1, close),
    rest: source.slice(close + 1),
  };
}

function matchBracket(source: string, openIndex: number) {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack: string[] = [];
  let quote: string | null = null;

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return -1;
}

function splitTopLevel(source: string) {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("({[".includes(char)) depth++;
    else if (")}]".includes(char)) depth--;
    else if (char === "," && depth === 0) {
      out.push(source.slice(start, i));
      start = i + 1;
    }
  }
  out.push(source.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

function indexOfTopLevel(source: string, needle: string) {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("({[".includes(char)) depth++;
    else if (")}]".includes(char)) depth--;
    else if (char === needle && depth === 0) return i;
  }
  return -1;
}

function keysOf(objectLiteral: string) {
  return splitTopLevel(objectLiteral.replace(/^\{/, "").replace(/\}$/, ""))
    .map((entry) => entry.split(":")[0].trim().replace(/^["'`]|["'`]$/g, ""))
    .filter(Boolean);
}

function literal(source: string): unknown {
  const text = source.trim();
  if (/^["'`]/.test(text)) return text.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  return undefined;
}

/** Finds `export const NAME = …` (or `const NAME = …`) and returns the expression. */
export function findSchemaExpression(source: string, name: string): string | null {
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*`, "g");
  const match = pattern.exec(source);
  if (!match) return null;

  const start = match.index + match[0].length;
  let depth = 0;
  let quote: string | null = null;

  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("({[".includes(char)) depth++;
    else if (")}]".includes(char)) depth--;
    else if ((char === ";" || char === "\n") && depth === 0) {
      const text = source.slice(start, i).trim();
      if (text) return text;
    }
  }
  return source.slice(start).trim() || null;
}

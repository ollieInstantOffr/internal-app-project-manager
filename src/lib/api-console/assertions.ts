/**
 * The little assertion language shown in the design:
 *
 *   status == 200
 *   body.token exists
 *   duration < 500ms
 *   headers["set-cookie"] contains "Secure"
 *
 * Deliberately small — comparisons and existence against four subjects. Anything
 * it can't parse is reported as a failing assertion rather than silently passing,
 * so a typo can never look green.
 */

export type AssertionResult = {
  source: string;
  ok: boolean;
  detail: string;
};

export type ResponseFacts = {
  status: number | null;
  durationMs: number;
  body: string | null;
  headers: Record<string, string>;
};

type Subject =
  | { kind: "status" }
  | { kind: "duration" }
  | { kind: "body"; path: string[] }
  | { kind: "header"; name: string };

const OPERATORS = ["==", "!=", ">=", "<=", ">", "<", "contains", "matches", "exists"] as const;
type Operator = (typeof OPERATORS)[number];

export function evaluateAssertions(source: string | null, facts: ResponseFacts): AssertionResult[] {
  if (!source?.trim()) return [];
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => evaluateOne(line, facts));
}

function evaluateOne(line: string, facts: ResponseFacts): AssertionResult {
  const parsed = parse(line);
  if (!parsed) {
    return { source: line, ok: false, detail: "could not be parsed" };
  }

  const { subject, operator, expected } = parsed;
  const actual = resolve(subject, facts);

  if (operator === "exists") {
    const ok = actual !== undefined && actual !== null;
    return { source: line, ok, detail: ok ? describe(actual) : "missing" };
  }

  if (actual === undefined || actual === null) {
    return { source: line, ok: false, detail: "missing" };
  }

  switch (operator) {
    case "==":
      return result(line, looseEquals(actual, expected), actual);
    case "!=":
      return result(line, !looseEquals(actual, expected), actual);
    case ">":
    case "<":
    case ">=":
    case "<=": {
      const a = Number(actual);
      const b = Number(expected);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        return { source: line, ok: false, detail: `${describe(actual)} is not a number` };
      }
      const ok =
        operator === ">" ? a > b : operator === "<" ? a < b : operator === ">=" ? a >= b : a <= b;
      return result(line, ok, actual);
    }
    case "contains":
      return result(line, String(actual).includes(String(expected)), actual);
    case "matches": {
      try {
        return result(line, new RegExp(String(expected)).test(String(actual)), actual);
      } catch {
        return { source: line, ok: false, detail: "invalid regular expression" };
      }
    }
    default:
      return { source: line, ok: false, detail: "unknown operator" };
  }
}

function result(source: string, ok: boolean, actual: unknown): AssertionResult {
  return { source, ok, detail: ok ? describe(actual) : `got ${describe(actual)}` };
}

function parse(line: string): { subject: Subject; operator: Operator; expected: string } | null {
  // `exists` has no right-hand side.
  const existsMatch = /^(.+?)\s+exists$/i.exec(line);
  if (existsMatch) {
    const subject = parseSubject(existsMatch[1].trim());
    return subject ? { subject, operator: "exists", expected: "" } : null;
  }

  const match = /^(.+?)\s*(==|!=|>=|<=|>|<|contains|matches)\s*(.+)$/i.exec(line);
  if (!match) return null;

  const subject = parseSubject(match[1].trim());
  if (!subject) return null;

  return {
    subject,
    operator: match[2].toLowerCase() as Operator,
    expected: unquote(match[3].trim()),
  };
}

function parseSubject(raw: string): Subject | null {
  const text = raw.toLowerCase();
  if (text === "status" || text === "status_code" || text === "statuscode") return { kind: "status" };
  if (text === "duration" || text === "time" || text === "elapsed") return { kind: "duration" };

  const header = /^headers?\s*\[\s*['"]?(.+?)['"]?\s*\]$/i.exec(raw) ?? /^headers?\.(.+)$/i.exec(raw);
  if (header) return { kind: "header", name: header[1].trim().toLowerCase() };

  if (/^body(\.|\[|$)/i.test(raw)) {
    const path = raw
      .slice(4)
      .replace(/\[(\d+)\]/g, ".$1")
      .replace(/\[['"](.+?)['"]\]/g, ".$1")
      .split(".")
      .filter(Boolean);
    return { kind: "body", path };
  }

  return null;
}

function resolve(subject: Subject, facts: ResponseFacts): unknown {
  switch (subject.kind) {
    case "status":
      return facts.status;
    case "duration":
      return facts.durationMs;
    case "header":
      return facts.headers[subject.name];
    case "body": {
      if (facts.body === null) return undefined;
      let value: unknown;
      try {
        value = JSON.parse(facts.body);
      } catch {
        // Not JSON — `body contains "…"` should still work against the raw text.
        return subject.path.length === 0 ? facts.body : undefined;
      }
      if (subject.path.length === 0) return facts.body;
      for (const key of subject.path) {
        if (value === null || typeof value !== "object") return undefined;
        value = (value as Record<string, unknown>)[key];
      }
      return value;
    }
  }
}

/** `200` should match the string "200"; `true` should match the boolean. */
function looseEquals(actual: unknown, expected: string) {
  if (typeof actual === "number") return actual === Number(expected);
  if (typeof actual === "boolean") return actual === (expected === "true");
  if (actual === null) return expected === "null";
  if (typeof actual === "object") return JSON.stringify(actual) === expected;
  return String(actual) === expected;
}

function unquote(value: string) {
  // `duration < 500ms` — the unit is decoration.
  const stripped = value.replace(/^(\d+(?:\.\d+)?)\s*(ms|s|kb|b)$/i, (_, n, unit) =>
    unit.toLowerCase() === "s" ? String(Number(n) * 1000) : n,
  );
  if (
    (stripped.startsWith('"') && stripped.endsWith('"')) ||
    (stripped.startsWith("'") && stripped.endsWith("'"))
  ) {
    return stripped.slice(1, -1);
  }
  return stripped;
}

function describe(value: unknown) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

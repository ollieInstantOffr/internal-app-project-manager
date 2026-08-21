import type { ReactNode } from "react";

/**
 * A small multi-language tokenizer. Not a parser — it colours comments,
 * strings, keywords, numbers and call sites, which is what a reader needs.
 * The palette is the design's.
 */

const KEYWORDS = new Set([
  "import", "from", "export", "default", "const", "let", "var", "function", "return", "async",
  "await", "class", "extends", "implements", "interface", "type", "enum", "new", "if", "else",
  "for", "while", "do", "switch", "case", "break", "continue", "try", "catch", "finally",
  "throw", "typeof", "instanceof", "in", "of", "delete", "void", "yield", "public", "private",
  "protected", "readonly", "static", "abstract", "declare", "namespace", "as", "satisfies",
  "def", "elif", "lambda", "pass", "raise", "with", "self", "None", "True", "False",
  "func", "package", "struct", "impl", "fn", "let", "mut", "pub", "use", "match", "where",
  "select", "insert", "update", "from", "join", "and", "or", "not", "null", "true", "false",
]);

type Rule = { pattern: RegExp; className: string };

const RULES: Rule[] = [
  { pattern: /^\/\/.*/, className: "hl-comment" },
  { pattern: /^#(?!\[).*/, className: "hl-comment" },
  { pattern: /^--.*/, className: "hl-comment" },
  { pattern: /^\/\*[\s\S]*?\*\//, className: "hl-comment" },
  { pattern: /^(["'`])(?:\\.|(?!\1)[\s\S])*\1?/, className: "hl-string" },
  { pattern: /^-?\b\d[\d_]*(\.\d+)?([eE][+-]?\d+)?\b/, className: "hl-number" },
  { pattern: /^[A-Za-z_$][\w$]*(?=\s*\()/, className: "hl-fn" },
  { pattern: /^[A-Za-z_$][\w$]*/, className: "hl-word" },
];

export function highlightLine(line: string, keyPrefix: string): ReactNode {
  if (!line) return null;

  const out: ReactNode[] = [];
  let rest = line;
  let index = 0;
  let guard = 0;

  while (rest && guard++ < 2000) {
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) {
      out.push(whitespace[0]);
      rest = rest.slice(whitespace[0].length);
      continue;
    }

    let matched = false;
    for (const rule of RULES) {
      const match = rule.pattern.exec(rest);
      if (!match) continue;

      const text = match[0];
      const className =
        rule.className === "hl-word"
          ? KEYWORDS.has(text)
            ? "hl-keyword"
            : /^[A-Z]/.test(text)
              ? "hl-type"
              : ""
          : rule.className;

      out.push(
        className ? (
          <span key={`${keyPrefix}-${index++}`} className={className}>
            {text}
          </span>
        ) : (
          text
        ),
      );
      rest = rest.slice(text.length);
      matched = true;
      break;
    }

    if (!matched) {
      out.push(rest[0]);
      rest = rest.slice(1);
    }
  }

  return out;
}

/** Markdown gets a lighter treatment — headings, emphasis, code and links. */
export function highlightMarkdown(line: string, keyPrefix: string): ReactNode {
  if (/^\s*#{1,6}\s/.test(line)) {
    return (
      <span key={`${keyPrefix}-h`} className="hl-keyword">
        {line}
      </span>
    );
  }
  if (/^\s*(>|[-*+]\s|\d+\.\s)/.test(line)) {
    return (
      <span key={`${keyPrefix}-l`} className="hl-fn">
        {line}
      </span>
    );
  }
  const parts = line.split(/(`[^`]*`)/g);
  return parts.map((part, i) =>
    part.startsWith("`") ? (
      <span key={`${keyPrefix}-${i}`} className="hl-string">
        {part}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  );
}

export function fileBadge(path: string): { label: string; tone: string } {
  const name = path.split("/").pop() ?? "";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (["ts", "tsx"].includes(ext)) return { label: "TS", tone: "blue" };
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return { label: "JS", tone: "amber" };
  if (ext === "json") return { label: "{}", tone: "slate" };
  if (["md", "mdx"].includes(ext)) return { label: "MD", tone: "amber" };
  if (["css", "scss"].includes(ext)) return { label: "CSS", tone: "violet" };
  if (["yml", "yaml"].includes(ext)) return { label: "YML", tone: "slate" };
  if (ext === "prisma") return { label: "DB", tone: "green" };
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext))
    return { label: "IMG", tone: "violet" };
  if (["sh", "bash", "zsh"].includes(ext)) return { label: "SH", tone: "green" };
  if (/^dockerfile$/i.test(name)) return { label: "DK", tone: "blue" };
  if (/^\.env/i.test(name)) return { label: "ENV", tone: "slate" };
  return { label: ext.slice(0, 3).toUpperCase() || "•", tone: "slate" };
}

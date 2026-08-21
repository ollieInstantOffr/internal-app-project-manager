"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A textarea with a syntax-highlighted layer behind it. Real editing, real
 * selection, real undo — no editor dependency, and it keeps the design's exact
 * type and colours.
 */
export function CodeEditor({
  value,
  onChange,
  readOnly,
  lineNumbers = true,
  placeholder,
  minHeight = 120,
}: {
  value: string;
  onChange?: (next: string) => void;
  readOnly?: boolean;
  lineNumbers?: boolean;
  placeholder?: string;
  minHeight?: number;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const highlight = useRef<HTMLPreElement>(null);

  // The two layers must scroll as one or the text drifts apart.
  const sync = () => {
    if (!textarea.current || !highlight.current) return;
    highlight.current.scrollTop = textarea.current.scrollTop;
    highlight.current.scrollLeft = textarea.current.scrollLeft;
  };

  useLayoutEffect(sync, [value]);

  const lines = value.split("\n");

  return (
    <div className="code-wrap" style={{ minHeight }}>
      {lineNumbers && (
        <div className="code-gutter" aria-hidden>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      )}

      <div className="code-area">
        <pre ref={highlight} className="code-highlight" aria-hidden>
          {tokenize(value)}
          {"\n"}
        </pre>

        <textarea
          ref={textarea}
          className="code-input"
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          placeholder={placeholder}
          onScroll={sync}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={(e) => {
            // Tab indents rather than escaping the field.
            if (e.key === "Tab" && !readOnly) {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: start, selectionEnd: end } = el;
              const next = `${value.slice(0, start)}  ${value.slice(end)}`;
              onChange?.(next);
              requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
            }
          }}
        />
      </div>
    </div>
  );
}

/** Minimal JSON-ish tokenizer — keys, strings, numbers, literals, punctuation. */
function tokenize(source: string) {
  const pattern =
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],])/gi;

  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(source))) {
    if (match.index > last) out.push(source.slice(last, match.index));

    const [text, propKey, string, number, literal, punct] = match;
    const className = propKey
      ? "tok-key"
      : string
        ? "tok-string"
        : number
          ? "tok-number"
          : literal
            ? "tok-literal"
            : punct
              ? "tok-punct"
              : "";

    out.push(
      <span key={key++} className={className}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }

  if (last < source.length) out.push(source.slice(last));
  return out;
}

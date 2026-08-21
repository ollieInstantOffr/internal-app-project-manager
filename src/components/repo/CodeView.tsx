"use client";

import { useMemo } from "react";
import { highlightLine, highlightMarkdown } from "./highlight";

/**
 * Read-only file reader with selectable line ranges: click a gutter number to
 * anchor, shift-click to extend. That range is what an issue gets opened against.
 */
export type Range = { start: number; end: number };

export function CodeView({
  content,
  language,
  selection,
  onSelect,
}: {
  content: string;
  language: string;
  selection: Range | null;
  onSelect: (update: (prev: Range | null) => Range | null) => void;
}) {
  const lines = useMemo(() => content.replace(/\n$/, "").split("\n"), [content]);
  const isMarkdown = language === "Markdown";

  const inRange = (line: number) =>
    !!selection && line >= Math.min(selection.start, selection.end) && line <= Math.max(selection.start, selection.end);

  // Read the previous range from the updater, not from the render closure —
  // two clicks in the same tick would otherwise see a stale selection.
  function pick(line: number, extend: boolean) {
    onSelect((prev) => {
      if (extend && prev) return { start: prev.start, end: line };
      // Clicking the only selected line clears it.
      if (prev && prev.start === line && prev.end === line) return null;
      return { start: line, end: line };
    });
  }

  return (
    <div className="code-view">
      {lines.map((text, index) => {
        const number = index + 1;
        const selected = inRange(number);
        return (
          <div key={number} className="code-line" data-selected={selected}>
            <button
              className="code-gutter-no"
              onClick={(e) => pick(number, e.shiftKey)}
              title={selection ? "Shift-click to extend" : "Click to select this line"}
              aria-label={`Line ${number}`}
            >
              {number}
            </button>
            <code className="code-text">
              {isMarkdown ? highlightMarkdown(text, `l${number}`) : highlightLine(text, `l${number}`)}
            </code>
          </div>
        );
      })}
    </div>
  );
}

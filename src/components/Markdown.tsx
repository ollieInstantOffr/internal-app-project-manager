"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const MENTION = /(@[a-zA-Z0-9._-]{2,40})/g;

/**
 * Splits plain text on @handles so they read as one thing. Applied per block
 * element rather than globally, which keeps mentions out of code — an `@` inside
 * a snippet or a stack trace stays exactly as written.
 */
function withMentions(children: ReactNode): ReactNode {
  if (typeof children === "string") {
    const parts = children.split(MENTION);
    if (parts.length === 1) return children;
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="md-mention">
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => <Fragment key={i}>{withMentions(child)}</Fragment>);
  }
  return children;
}

const components: Components = {
  p: ({ children }) => <p>{withMentions(children)}</p>,
  li: ({ children }) => <li>{withMentions(children)}</li>,
  td: ({ children }) => <td>{withMentions(children)}</td>,
  th: ({ children }) => <th>{withMentions(children)}</th>,
  h1: ({ children }) => <h3>{withMentions(children)}</h3>,
  h2: ({ children }) => <h3>{withMentions(children)}</h3>,
  h3: ({ children }) => <h3>{withMentions(children)}</h3>,
  h4: ({ children }) => <h4>{withMentions(children)}</h4>,
  h5: ({ children }) => <h4>{withMentions(children)}</h4>,
  h6: ({ children }) => <h4>{withMentions(children)}</h4>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  // Links out of the app are opened detached — noreferrer also stops the target
  // learning which issue it was linked from.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  // Task lists from GFM come through as checkboxes; they describe the text
  // rather than edit it, so they stay read-only.
  input: ({ checked, type }) =>
    type === "checkbox" ? <input type="checkbox" checked={!!checked} readOnly /> : null,
};

/**
 * Renders a comment or description body.
 *
 * Raw HTML in the source is ignored rather than rendered — react-markdown skips
 * it unless rehype-raw is added, and it deliberately isn't. So a comment can't
 * inject markup, which matters because anyone in the org (and any connected
 * assistant) can write one.
 */
export function Markdown({ body, className }: { body: string; className?: string }) {
  return (
    <div className={className ? `md ${className}` : "md"}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

/**
 * A description that reads as rendered markdown and edits as its source.
 *
 * The plain Editable is contenteditable at all times, which can't show
 * formatting — you'd be looking at your own asterisks forever. This shows the
 * rendered body, swaps to a textarea of the raw source on click, and commits on
 * blur or ⌘⏎. Escape abandons the edit.
 */
export function MarkdownEditable({
  value,
  onCommit,
  placeholder = "Click to add a description",
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // A change from elsewhere (another tab, the agent) shouldn't be clobbered by
  // a stale draft sitting in state.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value.trim()) onCommit(next);
  }

  if (editing) {
    return (
      <textarea
        className="md-editor"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        placeholder="Markdown works here — **bold**, `code`, lists, links"
        aria-label="Description"
      />
    );
  }

  return (
    <div
      className="md-view"
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {value.trim() ? (
        <Markdown body={value} />
      ) : (
        <span className="md-placeholder">{placeholder}</span>
      )}
    </div>
  );
}

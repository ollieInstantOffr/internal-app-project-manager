"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { initials } from "@/lib/format";
import { accent } from "@/lib/constants";

/* ── avatar ───────────────────────────────────────────────── */

export function Avatar({
  name,
  hue,
  size = 24,
  title,
}: {
  name?: string | null;
  hue?: number | null;
  size?: number;
  title?: string;
}) {
  if (!name) {
    return (
      <span
        className="avatar avatar-empty"
        style={{ width: size, height: size }}
        title={title ?? "Unassigned"}
        aria-label="Unassigned"
      />
    );
  }
  const h = hue ?? 285;
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `oklch(0.5 0.05 ${h})`,
        fontSize: Math.max(8, size * 0.38),
      }}
      title={title ?? name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 3,
  size = 22,
  ring = "var(--raised)",
}: {
  people: { id: string; name: string; avatarHue?: number | null }[];
  max?: number;
  size?: number;
  ring?: string;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="avatar-stack">
      {shown.map((p) => (
        <span key={p.id} style={{ border: `2px solid ${ring}`, borderRadius: "50%", display: "flex" }}>
          <Avatar name={p.name} hue={p.avatarHue} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="avatar"
          style={{
            width: size,
            height: size,
            background: "var(--hover-strong)",
            border: `2px solid ${ring}`,
            fontSize: 9,
            color: "var(--text-2)",
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ── small primitives ─────────────────────────────────────── */

export function Bar({
  value,
  color = "var(--accent)",
  size = "md",
}: {
  value: number;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={`bar${size === "sm" ? " bar-sm" : size === "lg" ? " bar-lg" : ""}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

export function ProjectDot({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <span
      className="rail-dot"
      style={{ background: accent(color).base, width: size, height: size }}
    />
  );
}

export function Check({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
}) {
  return (
    <span
      className="checkbox"
      data-on={on}
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      tabIndex={onChange ? 0 : -1}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!on);
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          onChange?.(!on);
        }
      }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
}) {
  return (
    <span
      className="toggle"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      onClick={() => onChange?.(!on)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange?.(!on);
        }
      }}
    >
      <i />
    </span>
  );
}

export function Radio({ on }: { on: boolean }) {
  return <span className="radio" data-on={on} aria-hidden />;
}

/* ── popover menu ─────────────────────────────────────────── */

export function Popover({
  trigger,
  children,
  align = "left",
  placement = "bottom",
  width,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  placement?: "bottom" | "top";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrap} style={{ position: "relative", display: "inline-flex" }}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className="menu"
          style={{
            ...(placement === "top"
              ? { bottom: "calc(100% + 8px)" }
              : { top: "calc(100% + 6px)" }),
            [align]: 0,
            width,
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/* ── modal ────────────────────────────────────────────────── */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal aria-label={title}>
        <div className="row-flex">
          <div className="modal-title grow">{title}</div>
          <button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Close">
            esc
          </button>
        </div>
        {children}
        {footer && <div style={{ display: "flex", gap: 9, marginTop: 4 }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ── inline editable text ─────────────────────────────────── */

export function Editable({
  value,
  onCommit,
  as = "div",
  className,
  style,
  placeholder,
  multiline = false,
}: {
  value: string;
  onCommit: (next: string) => void;
  as?: "div" | "h1";
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const Tag = as as "div";

  return (
    <Tag
      ref={ref}
      className={`editable ${className ?? ""}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={placeholder}
      data-placeholder={placeholder}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? "").trim();
        if (next !== value) {
          if (!next && !multiline) {
            e.currentTarget.textContent = value;
            return;
          }
          onCommit(next);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.textContent = value;
          e.currentTarget.blur();
        }
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Enter" && multiline && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value}
    </Tag>
  );
}

/* ── empty state ──────────────────────────────────────────── */

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div style={{ font: "600 13px var(--display)", color: "var(--text-2)" }}>{title}</div>
      {hint && <div style={{ maxWidth: 340, lineHeight: 1.6 }}>{hint}</div>}
    </div>
  );
}

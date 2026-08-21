"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  panelClass,
  stretch,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  placement?: "bottom" | "top";
  width?: number;
  /** Extra class on the floating panel, for contents that aren't a menu. */
  panelClass?: string;
  /** Let the trigger fill its container instead of shrinking to its content. */
  stretch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  /**
   * Menus are portalled to <body> and positioned in viewport coordinates. Several
   * of the places they open from — the issue sidebar, the board columns — are
   * scroll containers, which would otherwise clip an absolutely-positioned menu
   * or push it outside its panel.
   */
  const position = useCallback(() => {
    const trigger = anchor.current?.getBoundingClientRect();
    if (!trigger) return;

    const gap = 6;
    const margin = 8;
    // offsetWidth/Height are layout values, unaffected by the entry animation's
    // transform — a getBoundingClientRect() here measures the menu mid-slide.
    const w = menu.current?.offsetWidth ?? width ?? 200;
    const h = menu.current?.offsetHeight ?? 0;

    let left = align === "right" ? trigger.right - w : trigger.left;
    // Keep it on screen whichever edge it would have run past.
    left = Math.min(left, window.innerWidth - w - margin);
    left = Math.max(margin, left);

    const below = trigger.bottom + gap;
    const above = trigger.top - gap - h;
    const fitsBelow = below + h <= window.innerHeight - margin;
    let top = placement === "top" || !fitsBelow ? above : below;
    top = Math.max(margin, Math.min(top, window.innerHeight - h - margin));

    setCoords({ top, left });
  }, [align, placement, width]);

  useLayoutEffect(() => {
    if (!open) return;
    position();

    // The first pass runs before the menu has been measured, so its height is 0
    // and an upward-opening menu lands wrong. Re-position once it has real
    // dimensions, and again whenever its contents change size.
    const el = menu.current;
    if (!el) return;
    const observer = new ResizeObserver(() => position());
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!anchor.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    // Any scroll or resize invalidates the anchor position.
    const reflow = () => position();

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open, position]);

  return (
    <div
      ref={anchor}
      style={{
        position: "relative",
        display: stretch ? "flex" : "inline-flex",
        ...(stretch ? { width: "100%" } : null),
      }}
    >
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <div
            ref={menu}
            className={panelClass ? `menu ${panelClass}` : "menu"}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              width,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
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

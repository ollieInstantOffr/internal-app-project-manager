"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "./ui";

/** Weeks start on Monday, matching how the rest of the app reads dates. */
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `YYYY-MM-DD` in local time — `toISOString` would shift the day west of UTC. */
export function toISODate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromISODate(value: string | null | undefined) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  // Clamp so 31 Jan + 1 month lands on 28/29 Feb rather than spilling into March.
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), last));
  return next;
}

/** The six-week grid for a month, including the days either side that fill it. */
function gridFor(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * A date input in the app's own palette. The native `<input type="date">` opens
 * the browser's picker, which is light-themed and can't be styled — badly out of
 * place against Warm Slate.
 */
export function DateField({
  value,
  onChange,
  id,
  placeholder = "Pick a date",
  className = "input",
  align = "left",
  min,
  max,
  ariaLabel,
  clearable = true,
  stretch = true,
}: {
  /** `YYYY-MM-DD`, or empty. Same contract as the native input it replaces. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  min?: string;
  max?: string;
  ariaLabel?: string;
  clearable?: boolean;
  /** Off for the compact inline variant, which sets its own width. */
  stretch?: boolean;
}) {
  const selected = fromISODate(value);

  return (
    <Popover
      align={align}
      width={288}
      panelClass="menu-plain"
      stretch={stretch}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          id={id}
          className={`${className} date-trigger`}
          data-open={open}
          data-empty={!selected}
          aria-label={ariaLabel ?? placeholder}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
        >
          <span className="grow truncate">
            {selected
              ? selected.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : placeholder}
          </span>
          <CalendarGlyph />
        </button>
      )}
    >
      {(close) => (
        <Calendar
          selected={selected}
          min={fromISODate(min)}
          max={fromISODate(max)}
          clearable={clearable}
          onPick={(date) => {
            onChange(date ? toISODate(date) : "");
            close();
          }}
        />
      )}
    </Popover>
  );
}

function CalendarGlyph() {
  return (
    <svg className="date-glyph" viewBox="0 0 14 14" width="13" height="13" aria-hidden focusable="false">
      <rect x="1" y="2.5" width="12" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 6h12" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 1v2.5M9.5 1v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function Calendar({
  selected,
  min,
  max,
  clearable,
  onPick,
}: {
  selected: Date | null;
  min: Date | null;
  max: Date | null;
  clearable: boolean;
  onPick: (date: Date | null) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => selected ?? today);
  const [cursor, setCursor] = useState(() => selected ?? today);
  const [picking, setPicking] = useState<"day" | "month">("day");
  const grid = useRef<HTMLDivElement>(null);

  // The grid takes focus on open so the arrow keys work without a click first.
  useEffect(() => {
    grid.current?.focus();
  }, [picking]);

  const days = useMemo(() => gridFor(month), [month]);

  const blocked = (date: Date) => {
    if (min && date < new Date(min.getFullYear(), min.getMonth(), min.getDate())) return true;
    if (max && date > new Date(max.getFullYear(), max.getMonth(), max.getDate())) return true;
    return false;
  };

  const moveTo = (date: Date) => {
    setCursor(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(date);
    }
  };

  function onKeyDown(e: React.KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };

    if (e.key in step) {
      e.preventDefault();
      moveTo(addDays(cursor, step[e.key]));
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      moveTo(addMonths(cursor, e.key === "PageUp" ? -1 : 1));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const offset = (cursor.getDay() + 6) % 7;
      moveTo(addDays(cursor, e.key === "Home" ? -offset : 6 - offset));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!blocked(cursor)) onPick(cursor);
    }
  }

  return (
    <div className="cal" role="dialog" aria-label="Choose a date">
      <div className="cal-head">
        <button
          type="button"
          className="cal-month"
          aria-expanded={picking === "month"}
          onClick={() => setPicking((p) => (p === "day" ? "month" : "day"))}
        >
          {MONTHS[month.getMonth()]} {month.getFullYear()}
          <span className="cal-caret" aria-hidden>
            ⌄
          </span>
        </button>
        <span className="grow" />
        <button
          type="button"
          className="cal-nav"
          aria-label={picking === "month" ? "Previous year" : "Previous month"}
          onClick={() =>
            setMonth((m) =>
              picking === "month"
                ? new Date(m.getFullYear() - 1, m.getMonth(), 1)
                : addMonths(m, -1),
            )
          }
        >
          ‹
        </button>
        <button
          type="button"
          className="cal-nav"
          aria-label={picking === "month" ? "Next year" : "Next month"}
          onClick={() =>
            setMonth((m) =>
              picking === "month"
                ? new Date(m.getFullYear() + 1, m.getMonth(), 1)
                : addMonths(m, 1),
            )
          }
        >
          ›
        </button>
      </div>

      {picking === "month" ? (
        <div className="cal-months" ref={grid} tabIndex={-1}>
          {MONTHS.map((name, index) => (
            <button
              type="button"
              key={name}
              className="cal-month-cell"
              data-active={index === month.getMonth()}
              onClick={() => {
                setMonth(new Date(month.getFullYear(), index, 1));
                setPicking("day");
              }}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="cal-weekdays" aria-hidden>
            {WEEKDAYS.map((day, i) => (
              <span key={i}>{day}</span>
            ))}
          </div>

          <div
            className="cal-grid"
            role="grid"
            tabIndex={0}
            ref={grid}
            onKeyDown={onKeyDown}
            aria-label={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
          >
            {days.map((day) => {
              const outside = day.getMonth() !== month.getMonth();
              const isBlocked = blocked(day);
              return (
                <button
                  type="button"
                  key={day.getTime()}
                  className="cal-day"
                  role="gridcell"
                  tabIndex={-1}
                  disabled={isBlocked}
                  data-outside={outside}
                  data-today={sameDay(day, today)}
                  data-selected={!!selected && sameDay(day, selected)}
                  data-cursor={sameDay(day, cursor)}
                  aria-selected={!!selected && sameDay(day, selected)}
                  aria-label={day.toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  onClick={() => onPick(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="cal-foot">
        {clearable ? (
          <button type="button" className="cal-action" onClick={() => onPick(null)}>
            Clear
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="cal-action cal-action-accent"
          onClick={() => onPick(today)}
        >
          Today
        </button>
      </div>
    </div>
  );
}

"use client";

import { humanMinutes, useFocus } from "./context";

/** The rail tile from 8a — five segments, one per session, up to five. */
const SEGMENTS = 5;

export function FocusToday() {
  const { today, state } = useFocus();
  if (today.count === 0 && state === "IDLE") return null;

  return (
    <div className="focus-today">
      <div className="eyebrow">Focus today</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <div className="focus-today-total">{humanMinutes(today.minutes)}</div>
        <div className="focus-today-count">
          / {today.count} session{today.count === 1 ? "" : "s"}
        </div>
      </div>
      <div className="focus-today-bars">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} data-filled={i < today.count} />
        ))}
      </div>
    </div>
  );
}

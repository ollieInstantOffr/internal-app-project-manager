"use client";

import { BREAK_MINUTES } from "./constants";
import { humanMinutes, targetOf, useFocus } from "./context";

/** The card that follows a finished session — 8b, lower left. */
export function SessionComplete() {
  const { finished, today, prefs, act, start, dismissSummary } = useFocus();
  if (!finished) return null;

  const target = targetOf(finished);
  const logged = !!finished.loggedAt;
  const wasBreak = finished.kind === "BREAK";

  return (
    <div className="focus-summary" role="dialog" aria-label="Session complete">
      <div className="row-flex">
        <div className="focus-panel-title grow">{wasBreak ? "Break over" : "Session complete"}</div>
        <button className="focus-close" onClick={dismissSummary} aria-label="Close">
          ✕
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div className="focus-summary-count">
          {finished.minutes}
          <span>min</span>
        </div>
        <div className="focus-summary-meta">
          {ordinal(today.count)} session today · {humanMinutes(today.minutes)} total
        </div>
      </div>

      {target && !wasBreak && (
        <div className="focus-summary-target">
          <span className="focus-target-dot" style={{ background: target.color }} aria-hidden />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="focus-target-title truncate">{target.label}</div>
            {target.sub && <div className="focus-target-sub mono">{target.sub}</div>}
          </div>
        </div>
      )}

      {target && !wasBreak && (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="focus-log grow"
            onClick={() => act("log")}
            disabled={logged}
          >
            {logged
              ? `Logged ${finished.minutes}m`
              : `Log ${finished.minutes}m to ${target.sub ?? "this"}`}
          </button>
          <button className="focus-skip" onClick={dismissSummary}>
            {logged ? "Done" : "Skip"}
          </button>
        </div>
      )}

      {!target && !wasBreak && (
        <div className="focus-hint">
          Untracked session — it still counts toward your own focus total.
        </div>
      )}

      {prefs.suggestBreak && !wasBreak && (
        <>
          <div className="focus-rule" />
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div className="grow">
              <div style={{ font: "500 12px var(--sans)" }}>
                Take a {BREAK_MINUTES} min break?
              </div>
              <div style={{ font: "400 10px var(--sans)", color: "var(--muted)" }}>
                Notifications stay paused
              </div>
            </div>
            <button
              className="focus-break"
              onClick={() => {
                dismissSummary();
                start({ plannedMinutes: BREAK_MINUTES, kind: "BREAK", replace: true });
              }}
            >
              Start break
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ordinal(n: number) {
  const value = Math.max(1, n);
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

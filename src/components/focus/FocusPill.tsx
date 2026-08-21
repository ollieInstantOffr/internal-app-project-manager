"use client";

import { useEffect, useRef } from "react";
import { clock, useFocus } from "./context";

/**
 * The four states from 8b. Rendered twice — once in the mobile top bar, once
 * fixed at the top-right on desktop — both reading the same session.
 *
 * Idle is a split control: the label starts your last length straight away on
 * whatever you're looking at, and the caret opens setup instead.
 */
export function FocusPill({ variant }: { variant: "fixed" | "inline" }) {
  const { state, session, finished, remaining, elapsed, open, setOpen, start, prefs, suggest, showSummary } =
    useFocus();
  const ref = useRef<HTMLDivElement>(null);

  // Page headers reserve room for the pill, whatever its label happens to be.
  useEffect(() => {
    if (variant !== "fixed") return;
    const width = ref.current?.offsetWidth ?? 0;
    document.documentElement.style.setProperty("--focus-pill-w", `${width}px`);
  }, [variant, state, remaining]);

  const isBreak = session?.kind === "BREAK";
  const label =
    state === "RUNNING" || state === "PAUSED"
      ? clock(remaining)
      : state === "DONE" && finished
        ? `✓ ${finished.minutes}m done`
        : "Focus";

  const progress =
    session && session.plannedMinutes
      ? Math.min(100, (elapsed / (session.plannedMinutes * 60)) * 100)
      : 0;

  return (
    <>
      <div className="focus-pill" data-state={state} data-variant={variant} ref={ref}>
        <button
          className="focus-pill-main"
          aria-label={
            state === "IDLE"
              ? suggest
                ? `Start a ${prefs.lastLengthMinutes} minute session on ${suggest.label}`
                : `Start a ${prefs.lastLengthMinutes} minute focus session`
              : `${isBreak ? "Break" : "Focus"} — ${label} ${
                  state === "PAUSED" ? "paused" : "left"
                }`
          }
          onClick={() => {
            // Idle: no dialog. Running or paused: the panel has the controls.
            if (state === "IDLE") start({ plannedMinutes: prefs.lastLengthMinutes, target: suggest });
            else if (state === "DONE") showSummary();
            else setOpen(!open);
          }}
        >
          <span className="focus-glyph" aria-hidden />
          <span className="focus-time">{label}</span>
          {(state === "RUNNING" || state === "PAUSED") && (
            <span className="focus-word">
              {state === "PAUSED" ? "paused" : isBreak ? "break" : "focus"}
            </span>
          )}
        </button>

        {state === "IDLE" && (
          <button
            className="focus-pill-caret"
            aria-label="Focus session settings"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            ⌄
          </button>
        )}
      </div>

      {variant === "fixed" && state === "RUNNING" && (
        <div className="focus-hairline" aria-hidden>
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
    </>
  );
}

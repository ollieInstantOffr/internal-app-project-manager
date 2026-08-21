"use client";

import { useEffect, useRef } from "react";
import { FocusPill } from "./FocusPill";
import { FocusPanel } from "./FocusPanel";
import { SessionComplete } from "./SessionComplete";
import { useFocus } from "./context";

function isTyping(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName) || node.isContentEditable;
}

/** Everything the timer owns outside the page: the pill, its panel, the summary. */
export function FocusChrome() {
  const { open, setOpen, session, prefs, start, act, suggest, finished, summaryOpen } = useFocus();
  const anchor = useRef<HTMLDivElement>(null);

  // Click-outside closes the panel, but never the pill that opened it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchor.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(".focus-pill")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      if (!e.altKey || isTyping(e.target)) return;
      const key = e.code === "KeyT" || e.key.toLowerCase() === "t";
      if (!key) return;
      e.preventDefault();

      // ⌥⇧T ends; ⌥T starts, pauses, or resumes.
      if (e.shiftKey) {
        if (session) act("end");
        return;
      }
      if (!session) {
        start({ plannedMinutes: prefs.lastLengthMinutes, target: suggest });
        return;
      }
      act(session.pausedAt ? "resume" : "pause");
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen, session, prefs.lastLengthMinutes, start, act, suggest]);

  return (
    <>
      <FocusPill variant="fixed" />

      {(open || (finished && summaryOpen)) && (
        <div className="focus-anchor" ref={anchor}>
          {open ? <FocusPanel /> : <SessionComplete />}
        </div>
      )}
    </>
  );
}

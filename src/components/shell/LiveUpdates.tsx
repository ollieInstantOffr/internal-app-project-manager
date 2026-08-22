"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Coalesce a burst of changes into one refresh. */
const DEBOUNCE_MS = 400;

/**
 * Keeps the page current without a navigation. The stream carries no data of
 * its own — it just says "something moved", and the page re-fetches through the
 * normal routes, so nothing bypasses the permissions those already enforce.
 *
 * Renders nothing.
 */
export function LiveUpdates() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A hidden tab doesn't need refreshing, and reconnecting a sleeping tab
    // every few seconds is a good way to annoy a laptop battery.
    let source: EventSource | null = null;
    let stopped = false;

    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, DEBOUNCE_MS);
    };

    const open = () => {
      if (stopped || source) return;
      source = new EventSource("/api/events");
      // EventSource retries on its own; `retry:` from the server sets the delay.
      for (const kind of ["activity", "notification", "approval", "comment"]) {
        source.addEventListener(kind, refresh);
      }
    };

    const close = () => {
      source?.close();
      source = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        open();
        // Catch up on whatever was missed while the tab was in the background.
        refresh();
      } else {
        close();
      }
    };

    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
      close();
    };
  }, [router]);

  return null;
}

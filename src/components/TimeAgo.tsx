"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/format";

/**
 * Renders an absolute timestamp until mount, then the relative one. Keeps the
 * server and client markup identical — the clock only ticks in the browser.
 */
export function TimeAgo({ at }: { at: string | Date }) {
  const iso = typeof at === "string" ? at : at.toISOString();
  const [label, setLabel] = useState(() =>
    new Date(iso).toISOString().slice(0, 16).replace("T", " "),
  );

  useEffect(() => {
    const tick = () => setLabel(relativeTime(iso));
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}

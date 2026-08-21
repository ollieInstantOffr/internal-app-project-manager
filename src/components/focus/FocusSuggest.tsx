"use client";

import { useEffect } from "react";
import { useFocus, type FocusTarget } from "./context";

/**
 * Tells the timer what this page is about, so the idle pill can start on the
 * issue you're looking at without asking. Renders nothing.
 */
export function FocusSuggest({ target }: { target: FocusTarget }) {
  const { setSuggest } = useFocus();
  const { kind, id, label, sub, color } = target;

  useEffect(() => {
    setSuggest({ kind, id, label, sub, color });
    return () => setSuggest(null);
  }, [setSuggest, kind, id, label, sub, color]);

  return null;
}

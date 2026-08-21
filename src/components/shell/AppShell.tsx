"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Rail } from "./Rail";
import { CommandPalette } from "./CommandPalette";
import { ShellProvider, type ShellData } from "./context";

function isTypingTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const goPending = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (paletteOpen || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      // "g" then a letter — the two-key jump used across the app.
      if (goPending.current) {
        goPending.current = false;
        if (goTimer.current) clearTimeout(goTimer.current);
        const dest: Record<string, string> = {
          h: "/home",
          w: "/my-work",
          i: "/my-work",
          r: "/roadmap",
          n: "/insights",
          s: "/settings/general",
        };
        const target = dest[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          router.push(target);
        }
        if (e.key.toLowerCase() === "b" && data.projects[0]) {
          e.preventDefault();
          router.push(`/projects/${data.projects[0].key}/board`);
        }
        return;
      }

      if (e.key.toLowerCase() === "g") {
        goPending.current = true;
        goTimer.current = setTimeout(() => (goPending.current = false), 1200);
      }

      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, paletteOpen, data.projects]);

  return (
    <ShellProvider value={data}>
      <div className="shell">
        <Rail onOpenPalette={openPalette} />
        {children}
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </ShellProvider>
  );
}

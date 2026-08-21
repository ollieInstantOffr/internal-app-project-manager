"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const goPending = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPalette = useCallback(() => {
    setNavOpen(false);
    setPaletteOpen(true);
  }, []);

  // Navigating should always dismiss the drawer, however it was triggered.
  useEffect(() => setNavOpen(false), [pathname]);

  // The drawer is an overlay on small screens; the page behind it must not scroll.
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && navOpen) {
        setNavOpen(false);
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
          t: "/tasks",
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
  }, [router, paletteOpen, navOpen, data.projects]);

  return (
    <ShellProvider value={data}>
      <div className="shell" data-nav-open={navOpen}>
        <header className="topbar">
          <button
            className="topbar-btn"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <span className="burger" aria-hidden />
          </button>
          <span className="rail-mark" style={{ width: 24, height: 24, fontSize: 11 }}>
            {data.org.name[0]?.toUpperCase() ?? "A"}
          </span>
          <span className="grow truncate" style={{ font: "600 13px var(--display)" }}>
            {data.org.name}
          </span>
          <button className="topbar-btn" aria-label="Search" onClick={openPalette}>
            <span style={{ fontSize: 15 }}>⌕</span>
          </button>
        </header>

        <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />

        <Rail onOpenPalette={openPalette} />

        {children}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </ShellProvider>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";

export type FocusTarget = {
  kind: "issue" | "task";
  id: string;
  label: string;
  sub: string | null;
  color: string;
};

export type FocusSession = {
  id: string;
  kind: "FOCUS" | "BREAK";
  plannedMinutes: number;
  minutes: number;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
  loggedAt: string | null;
  issue: {
    id: string;
    key: string;
    title: string;
    status: string;
    project: { color: string };
  } | null;
  task: { id: string; title: string; list: { color: string } | null } | null;
};

export type FocusPrefs = {
  lastLengthMinutes: number;
  pauseNotifications: boolean;
  suggestBreak: boolean;
  shareBadge: boolean;
};

export type FocusState = "IDLE" | "RUNNING" | "PAUSED" | "DONE";

type Api = {
  session: FocusSession | null;
  prefs: FocusPrefs;
  today: { minutes: number; count: number };
  state: FocusState;
  /** Seconds left in the current session — drives the pill and the dial. */
  remaining: number;
  elapsed: number;
  /** The just-finished session, while its summary card is up. */
  finished: FocusSession | null;
  /** The summary waits out the pill's solid-white moment before appearing. */
  summaryOpen: boolean;
  showSummary: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  start: (opts: {
    plannedMinutes?: number;
    target?: FocusTarget | null;
    kind?: "FOCUS" | "BREAK";
    replace?: boolean;
  }) => Promise<void>;
  act: (action: "pause" | "resume" | "end" | "log" | "skip") => Promise<void>;
  extend: (step: number) => Promise<void>;
  savePrefs: (patch: Partial<FocusPrefs>) => Promise<void>;
  dismissSummary: () => void;
  /** Set by whichever page knows what you're looking at, so one click can start. */
  suggest: FocusTarget | null;
  setSuggest: (target: FocusTarget | null) => void;
};

const Ctx = createContext<Api | null>(null);

export function useFocus() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useFocus must be used inside <FocusProvider>");
  return value;
}

export function targetOf(session: FocusSession | null): FocusTarget | null {
  if (!session) return null;
  if (session.issue) {
    return {
      kind: "issue",
      id: session.issue.id,
      label: session.issue.title,
      sub: session.issue.key,
      color: session.issue.project.color,
    };
  }
  if (session.task) {
    return {
      kind: "task",
      id: session.task.id,
      label: session.task.title,
      sub: "Task",
      color: session.task.list ? `var(--list-${session.task.list.color})` : "var(--accent)",
    };
  }
  return null;
}

/** Seconds of real running time, pauses removed. Mirrors the server's maths. */
function elapsedOf(session: FocusSession, nowMs: number) {
  const stop = session.endedAt
    ? new Date(session.endedAt).getTime()
    : session.pausedAt
      ? new Date(session.pausedAt).getTime()
      : nowMs;
  const gross = Math.floor((stop - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, gross - session.pausedSeconds);
}

export function FocusProvider({
  initial,
  children,
}: {
  initial: { session: FocusSession | null; prefs: FocusPrefs; today: { minutes: number; count: number } };
  children: React.ReactNode;
}) {
  const { toast, error } = useToast();
  const [session, setSession] = useState(initial.session);
  const [prefs, setPrefs] = useState(initial.prefs);
  const [today, setToday] = useState(initial.today);
  const [finished, setFinished] = useState<FocusSession | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggest, setSuggest] = useState<FocusTarget | null>(null);

  // The clock ticks here rather than in the pill, so every reader agrees.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!session || session.endedAt || session.pausedAt) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  // Mount reconciles with the server: the session outlives this tab.
  useEffect(() => {
    let alive = true;
    api
      .get<{ session: FocusSession | null; prefs: FocusPrefs; today: typeof today }>("/api/focus")
      .then((data) => {
        if (!alive) return;
        setSession(data.session);
        setPrefs(data.prefs);
        setToday(data.today);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const elapsed = session ? elapsedOf(session, nowMs) : 0;
  const remaining = session ? Math.max(0, session.plannedMinutes * 60 - elapsed) : 0;

  const state: FocusState = !session
    ? finished
      ? "DONE"
      : "IDLE"
    : session.endedAt
      ? "DONE"
      : session.pausedAt
        ? "PAUSED"
        : "RUNNING";

  const settle = useCallback(
    (next: FocusSession | null, stats?: { minutes: number; count: number }) => {
      if (stats) setToday(stats);
      if (next?.endedAt) {
        setSession(null);
        setFinished(next);
        setSummaryOpen(false);
        setOpen(false);
        return;
      }
      setSession(next);
    },
    [],
  );

  /** A session that runs out while the tab is open should close itself. */
  const ending = useRef(false);
  useEffect(() => {
    if (!session || session.endedAt || session.pausedAt || remaining > 0 || ending.current) return;
    ending.current = true;
    api
      .post<{ session: FocusSession; today: typeof today }>(`/api/focus/${session.id}`, {
        action: "end",
      })
      .then((data) => settle(data.session, data.today))
      .catch(() => {})
      .finally(() => {
        ending.current = false;
      });
  }, [session, remaining, settle]);

  // "Inverts to solid for 10 seconds, then opens the summary card below."
  useEffect(() => {
    if (!finished || summaryOpen) return;
    const timer = setTimeout(() => setSummaryOpen(true), 10_000);
    return () => clearTimeout(timer);
  }, [finished, summaryOpen]);

  // A pause left alone is ended by the server; ask often enough to notice.
  useEffect(() => {
    if (!session?.pausedAt) return;
    const timer = setInterval(() => {
      api
        .get<{ session: FocusSession | null; today: typeof today }>("/api/focus")
        .then((data) => settle(data.session, data.today))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, [session?.pausedAt, settle]);

  const start = useCallback<Api["start"]>(
    async (opts) => {
      const target = opts.target ?? null;
      try {
        const data = await api.post<{ session: FocusSession; today: typeof today }>("/api/focus", {
          plannedMinutes: opts.plannedMinutes ?? prefs.lastLengthMinutes,
          kind: opts.kind ?? "FOCUS",
          issueId: target?.kind === "issue" ? target.id : null,
          taskId: target?.kind === "task" ? target.id : null,
          replace: opts.replace ?? false,
        });
        setFinished(null);
        settle(data.session, data.today);
        if ((opts.kind ?? "FOCUS") === "FOCUS") {
          setPrefs((p) => ({ ...p, lastLengthMinutes: data.session.plannedMinutes }));
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) throw err;
        error(err instanceof ApiError ? err.message : "Could not start the timer");
      }
    },
    [prefs.lastLengthMinutes, settle, error],
  );

  const act = useCallback<Api["act"]>(
    async (action) => {
      const id = session?.id ?? finished?.id;
      if (!id) return;
      try {
        const data = await api.post<{ session: FocusSession; today: typeof today }>(
          `/api/focus/${id}`,
          { action },
        );
        if (action === "log") {
          setFinished(data.session);
          const target = targetOf(data.session);
          toast(target ? `Logged to ${target.sub ?? target.label}` : "Logged");
          return;
        }
        if (action === "skip") {
          setFinished(null);
          setSummaryOpen(false);
          return;
        }
        settle(data.session, data.today);
      } catch (err) {
        error(err instanceof ApiError ? err.message : "That didn't work");
      }
    },
    [session, finished, settle, toast, error],
  );

  const extend = useCallback(
    async (step: number) => {
      if (!session) return;
      // Optimistic: the dial should move the moment you press ±.
      setSession((s) =>
        s
          ? { ...s, plannedMinutes: Math.min(240, Math.max(5, s.plannedMinutes + step)) }
          : s,
      );
      try {
        const data = await api.post<{ session: FocusSession }>(`/api/focus/${session.id}`, {
          action: "extend",
          step,
        });
        setSession(data.session);
      } catch {
        // The next poll or reload will straighten it out.
      }
    },
    [session],
  );

  const savePrefs = useCallback(
    async (patch: Partial<FocusPrefs>) => {
      setPrefs((p) => ({ ...p, ...patch }));
      try {
        await api.patch("/api/focus/prefs", patch);
      } catch (err) {
        error(err instanceof ApiError ? err.message : "Could not save that setting");
      }
    },
    [error],
  );

  const value = useMemo<Api>(
    () => ({
      session,
      prefs,
      today,
      state,
      remaining,
      elapsed,
      finished,
      summaryOpen,
      showSummary: () => setSummaryOpen(true),
      open,
      setOpen,
      start,
      act,
      extend,
      savePrefs,
      dismissSummary: () => {
        setFinished(null);
        setSummaryOpen(false);
      },
      suggest,
      setSuggest,
    }),
    [
      session,
      prefs,
      today,
      state,
      remaining,
      elapsed,
      finished,
      summaryOpen,
      open,
      start,
      act,
      extend,
      savePrefs,
      suggest,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function humanMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

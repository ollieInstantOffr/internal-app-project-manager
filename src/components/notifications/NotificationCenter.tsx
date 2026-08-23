"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { TimeAgo } from "@/components/TimeAgo";
import { api, ApiError } from "@/lib/client";

type Approval = {
  id: string;
  assistantId: string;
  assistantName: string;
  tool: string;
  summary: string;
  createdAt: string;
  expiresAt: string;
};

type Item = {
  id: string;
  kind: string;
  urgency: string;
  title: string;
  detail: string | null;
  read: boolean;
  createdAt: string;
  issueKey: string | null;
  actor: { name: string; isAgent: boolean } | null;
};

type Feed = {
  approvals: Approval[];
  notifications: Item[];
  counts: { unread: number; approvals: number };
};

const EMPTY: Feed = { approvals: [], notifications: [], counts: { unread: 0, approvals: 0 } };

/**
 * One place for anything waiting on the person, reachable from every screen.
 *
 * Approvals sit above notifications because an assistant is blocked polling for
 * one: an unread notification is an inconvenience, an unanswered approval is a
 * stopped agent.
 */
export function NotificationCenter() {
  const router = useRouter();
  const { toast, error } = useToast();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setFeed(await api.get<Feed>("/api/notifications/center"));
    } catch {
      // A failed poll shouldn't clear what's already on screen.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The SSE stream already announces both kinds; this just listens for them.
  useEffect(() => {
    const source = new EventSource("/api/events");
    const refresh = () => load();
    source.addEventListener("notification", refresh);
    source.addEventListener("approval", refresh);
    return () => source.close();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panel.current?.contains(target)) return;
      if (target.closest?.(".bell")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function decide(approval: Approval, decision: "approve" | "deny") {
    setBusy(approval.id);
    try {
      const result = await api.post<{ text?: string }>(
        `/api/assistants/${approval.assistantId}/approvals/${approval.id}`,
        { decision },
      );
      toast(decision === "approve" ? (result.text ?? "Approved") : "Sent back a no");
      await load();
      router.refresh();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't record that");
    } finally {
      setBusy(null);
    }
  }

  async function markRead(item: Item) {
    setFeed((f) => ({
      ...f,
      notifications: f.notifications.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
      counts: { ...f.counts, unread: Math.max(0, f.counts.unread - (item.read ? 0 : 1)) },
    }));
    await api.patch(`/api/notifications/${item.id}`, { read: true }).catch(() => load());
  }

  async function readAll() {
    setFeed((f) => ({
      ...f,
      notifications: f.notifications.map((n) => ({ ...n, read: true })),
      counts: { ...f.counts, unread: 0 },
    }));
    await api.post("/api/notifications/read-all").catch(() => load());
    router.refresh();
  }

  const waiting = feed.counts.approvals;
  const unread = feed.counts.unread;
  const badge = waiting + unread;

  return (
    <>
      <button
        className="bell"
        data-waiting={waiting > 0 || undefined}
        aria-label={
          badge
            ? `Notifications — ${waiting} waiting on you, ${unread} unread`
            : "Notifications"
        }
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>◔</span>
        {badge > 0 && <span className="bell-badge">{badge > 99 ? "99+" : badge}</span>}
      </button>

      {open && (
        <div className="notif-panel" ref={panel} role="dialog" aria-label="Notifications">
          <header className="notif-head">
            <div className="notif-title">Notifications</div>
            {unread > 0 && (
              <button className="notif-action" onClick={readAll}>
                Mark all read
              </button>
            )}
          </header>

          <div className="notif-body">
            {waiting > 0 && (
              <section>
                <div className="eyebrow notif-section">Waiting on you</div>
                {feed.approvals.map((approval) => (
                  <div key={approval.id} className="notif-approval">
                    <div className="notif-approval-who">
                      {approval.assistantName} wants to
                    </div>
                    <div className="notif-approval-what">{approval.summary}</div>
                    <div className="notif-meta">
                      <TimeAgo at={approval.createdAt} /> · <Expiry at={approval.expiresAt} />
                    </div>
                    <div className="notif-approval-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy === approval.id}
                        onClick={() => decide(approval, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy === approval.id}
                        onClick={() => decide(approval, "deny")}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section>
              {waiting > 0 && <div className="eyebrow notif-section">Everything else</div>}

              {feed.notifications.length === 0 && waiting === 0 && (
                <div className="notif-empty">Nothing needs you. Nothing has happened.</div>
              )}

              {feed.notifications.map((item) =>
                item.issueKey ? (
                  <Link
                    key={item.id}
                    href={`/issues/${item.issueKey}`}
                    className="notif-item"
                    data-unread={!item.read || undefined}
                    onClick={() => {
                      markRead(item);
                      setOpen(false);
                    }}
                  >
                    <NotificationBody item={item} />
                  </Link>
                ) : (
                  <button
                    key={item.id}
                    className="notif-item"
                    data-unread={!item.read || undefined}
                    onClick={() => markRead(item)}
                  >
                    <NotificationBody item={item} />
                  </button>
                ),
              )}
            </section>
          </div>

          <footer className="notif-foot">
            <Link href="/my-work" onClick={() => setOpen(false)}>
              Open My work
            </Link>
          </footer>
        </div>
      )}
    </>
  );
}

/** TimeAgo reads a future date as "just now", which is the wrong way round. */
function Expiry({ at }: { at: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const tick = () => {
      const minutes = Math.round((new Date(at).getTime() - Date.now()) / 60000);
      setText(minutes <= 0 ? "expired" : minutes < 60 ? `expires in ${minutes}m` : "expires in an hour");
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [at]);
  return <>{text}</>;
}

function NotificationBody({ item }: { item: Item }) {
  return (
    <>
      <span className="notif-dot" data-urgency={item.urgency} aria-hidden />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="notif-item-title">{item.title}</span>
        {item.detail && <span className="notif-item-detail">{item.detail}</span>}
        <span className="notif-meta">
          {item.actor && (
            <>
              {item.actor.name}
              {item.actor.isAgent && <span className="notif-agent">assistant</span>}
              {" · "}
            </>
          )}
          <TimeAgo at={item.createdAt} />
          {item.issueKey && ` · ${item.issueKey}`}
        </span>
      </span>
    </>
  );
}

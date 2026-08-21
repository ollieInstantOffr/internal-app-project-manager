"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Avatar, Popover, Empty } from "@/components/ui";
import { TimeAgo } from "@/components/TimeAgo";
import { shortAge } from "@/lib/format";
import { IssueStatus, NotificationKind, Urgency } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/constants";

export type QueueItem = {
  id: string;
  kind: NotificationKind;
  urgency: Urgency;
  title: string;
  detail: string | null;
  createdAt: string;
  read: boolean;
  issue: {
    id: string;
    key: string;
    title: string;
    description: string | null;
    status: IssueStatus;
    estimate: number | null;
    sprintName: string | null;
    projectName: string;
    assignee: { id: string; name: string; avatarHue: number } | null;
    branch: { name: string; repo: string } | null;
    pr: { number: number; state: string; checksFailed: number } | null;
    lastComment: { body: string; author: string; hue: number } | null;
  } | null;
};

type Scope = "needs-me" | "assigned" | "watching" | "done";

const SCOPE_LABEL: Record<Scope, string> = {
  "needs-me": "Needs me",
  assigned: "Assigned",
  watching: "Watching",
  done: "Done",
};

const URGENCY_LABEL: Record<Urgency, string> = {
  BLOCKING: "Blocking others",
  TODAY: "Today",
  LATER: "Later",
};

const URGENCY_ORDER: Urgency[] = [Urgency.BLOCKING, Urgency.TODAY, Urgency.LATER];

export function MyWork({
  items,
  counts,
}: {
  items: Record<Scope, QueueItem[]>;
  counts: Record<Scope, number>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { members } = useShell();

  const [scope, setScope] = useState<Scope>("needs-me");
  const [cursor, setCursor] = useState(0);
  const [reply, setReply] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const queue = items[scope];
  const active = queue[Math.min(cursor, queue.length - 1)] ?? null;

  useEffect(() => setCursor(0), [scope]);

  const groups = useMemo(() => {
    return URGENCY_ORDER.map((urgency) => ({
      urgency,
      rows: queue.filter((i) => i.urgency === urgency),
    })).filter((g) => g.rows.length > 0);
  }, [queue]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const archive = useCallback(
    async (item: QueueItem) => {
      await api.patch(`/api/notifications/${item.id}`, { archived: true }).catch(() => {});
      toast("Archived", {
        label: "Undo",
        run: async () => {
          await api.patch(`/api/notifications/${item.id}`, { archived: false }).catch(() => {});
          router.refresh();
        },
      });
      router.refresh();
    },
    [router, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const current = flat[cursor];

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, flat.length - 1));
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter" && current?.issue) {
        e.preventDefault();
        router.push(`/issues/${current.issue.key}`);
      }
      if (e.key === "e" && current) {
        e.preventDefault();
        archive(current);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flat, cursor, router, archive]);

  useEffect(() => {
    listRef.current?.querySelector('[data-focused="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const focused = flat[cursor] ?? null;

  async function sendReply() {
    if (!reply.trim() || !focused?.issue) return;
    const body = reply.trim();
    setReply("");
    try {
      await api.post(`/api/issues/${focused.issue.key}/comments`, { body });
      router.refresh();
      toast("Reply sent");
    } catch {
      toast("Couldn't send that");
    }
  }

  return (
    <main className="panel">
      <div className="split split-queue">
        <div className="queue-pane">
          <header className="panel-head panel-head-sm" style={{ padding: "0 20px" }}>
            <div>
              <h1 className="panel-title panel-title-sm">My work</h1>
              <div className="panel-sub">
                {counts["needs-me"]} need you today
              </div>
            </div>
            <div className="grow" />
            <span style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>Urgency ⌄</span>
          </header>

          <div style={{ display: "flex", gap: 6, padding: "0 20px 12px", flexWrap: "wrap" }}>
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
              <button
                key={s}
                className="pill"
                style={
                  scope === s
                    ? { background: "var(--white)", color: "var(--white-fg)", fontWeight: 600, padding: "5px 12px" }
                    : { background: "var(--raised)", color: "var(--text-3)", padding: "5px 12px" }
                }
                onClick={() => setScope(s)}
              >
                {SCOPE_LABEL[s]} {counts[s] > 0 ? counts[s] : ""}
              </button>
            ))}
          </div>

          <div className="scroll-y" style={{ flex: 1 }} ref={listRef}>
            {flat.length === 0 && (
              <Empty
                title={scope === "needs-me" ? "Inbox zero" : "Nothing here"}
                hint={
                  scope === "needs-me"
                    ? "Nothing is waiting on you. The badge in the rail is clear."
                    : "Switch tabs to see other work."
                }
              />
            )}

            {groups.map((group) => (
              <div key={group.urgency}>
                <div className="eyebrow" style={{ padding: "7px 20px" }}>
                  {URGENCY_LABEL[group.urgency]} · {group.rows.length}
                </div>

                {group.rows.map((item) => {
                  const index = flat.indexOf(item);
                  const isFocused = index === cursor;
                  const isBlocking = item.urgency === Urgency.BLOCKING;
                  const isFailure = item.kind === NotificationKind.CI_FAILED;

                  return (
                    <button
                      key={item.id}
                      data-focused={isFocused}
                      onClick={() => {
                        setCursor(index);
                        // Below the breakpoint the detail pane is hidden, so a
                        // tap has to take you to the issue itself.
                        if (
                          item.issue &&
                          window.matchMedia("(max-width: 767px)").matches
                        ) {
                          router.push(`/issues/${item.issue.key}`);
                        }
                      }}
                      onDoubleClick={() => item.issue && router.push(`/issues/${item.issue.key}`)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 7,
                        width: "calc(100% - 28px)",
                        margin: "0 14px 8px",
                        padding: 13,
                        borderRadius: 14,
                        textAlign: "left",
                        background: isFocused
                          ? "oklch(0.31 0.03 128)"
                          : item.read
                            ? "var(--surface)"
                            : "var(--card)",
                        boxShadow: isFocused
                          ? "0 0 0 1.5px var(--accent)"
                          : isFailure
                            ? "inset 3px 0 0 var(--danger-solid)"
                            : "none",
                      }}
                    >
                      <div className="row-flex" style={{ gap: 8 }}>
                        {item.issue && (
                          <span
                            className="mono"
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              color: isFocused ? "var(--accent-mono)" : "var(--muted-2)",
                            }}
                          >
                            {item.issue.key}
                          </span>
                        )}
                        {item.issue && (
                          <span
                            className="pill"
                            style={{
                              fontSize: 9.5,
                              padding: "1px 8px",
                              background:
                                item.issue.status === IssueStatus.IN_PROGRESS
                                  ? "var(--accent)"
                                  : "var(--hover-strong)",
                              color:
                                item.issue.status === IssueStatus.IN_PROGRESS
                                  ? "var(--accent-fg)"
                                  : "var(--text-2)",
                              fontWeight: item.issue.status === IssueStatus.IN_PROGRESS ? 600 : 500,
                            }}
                          >
                            {STATUS_LABEL[item.issue.status]}
                          </span>
                        )}
                        <span className="grow" />
                        <span
                          className="mono"
                          style={{ fontSize: 9.5, color: isFocused ? "var(--accent-mono)" : "var(--muted-2)" }}
                        >
                          {shortAge(item.createdAt)}
                        </span>
                      </div>

                      <div style={{ font: "400 13px/1.4 var(--sans)" }}>{item.title}</div>

                      {item.detail && (
                        <div
                          style={{
                            font: "400 10.5px var(--sans)",
                            color: isFailure
                              ? "var(--danger)"
                              : isBlocking
                                ? "var(--accent-text)"
                                : "var(--muted)",
                          }}
                        >
                          {item.detail}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "14px 20px",
              font: "400 10.5px var(--mono)",
              color: "var(--faint)",
            }}
          >
            inbox zero clears the badge
          </div>
        </div>

        <div className="queue-detail">
          {focused?.issue ? (
            <>
              <header className="panel-head panel-head-sm">
                <span className="mono" style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
                  {focused.issue.key}
                </span>
                <div className="grow" />
                <button
                  className="btn btn-white"
                  onClick={() => router.push(`/issues/${focused.issue!.key}`)}
                >
                  Open full ⏎
                </button>

                <Popover
                  align="right"
                  width={220}
                  trigger={({ toggle }) => (
                    <button className="btn btn-ghost" onClick={toggle}>
                      Assign a
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      {members.map((m) => (
                        <button
                          key={m.id}
                          className="menu-item"
                          onClick={async () => {
                            await api
                              .patch(`/api/issues/${focused.issue!.key}`, { assigneeId: m.id })
                              .catch(() => {});
                            close();
                            router.refresh();
                          }}
                        >
                          <Avatar name={m.name} hue={m.avatarHue} size={18} />
                          {m.name}
                        </button>
                      ))}
                    </>
                  )}
                </Popover>

                <button className="btn btn-ghost" onClick={() => archive(focused)}>
                  Archive e
                </button>
              </header>

              <div
                className="scroll-y"
                style={{ flex: 1, padding: "6px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}
              >
                <h2 style={{ font: "600 20px/1.35 var(--display)", letterSpacing: "-0.02em" }}>
                  {focused.issue.title}
                </h2>

                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <span
                    className="pill"
                    style={{
                      background:
                        focused.issue.status === IssueStatus.IN_PROGRESS
                          ? "var(--accent)"
                          : "var(--hover)",
                      color:
                        focused.issue.status === IssueStatus.IN_PROGRESS
                          ? "var(--accent-fg)"
                          : "var(--text-2)",
                      fontWeight: 600,
                      padding: "4px 12px",
                    }}
                  >
                    {STATUS_LABEL[focused.issue.status]}
                  </span>
                  {focused.issue.estimate != null && (
                    <span className="pill" style={{ padding: "4px 12px" }}>
                      {focused.issue.estimate} pts
                    </span>
                  )}
                  {focused.issue.sprintName && (
                    <span className="pill" style={{ padding: "4px 12px" }}>
                      {focused.issue.sprintName}
                    </span>
                  )}
                  <span className="pill" style={{ padding: "4px 12px" }}>
                    {focused.issue.projectName}
                  </span>
                </div>

                {focused.issue.description && (
                  <p style={{ font: "400 12.5px/1.75 var(--sans)", color: "var(--text-3)", margin: 0 }}>
                    {focused.issue.description}
                  </p>
                )}

                {(focused.issue.branch || focused.issue.pr) && (
                  <div className="card" style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 9 }}>
                    <div className="eyebrow">Git</div>
                    <div className="row-flex mono" style={{ fontSize: 11, gap: 8 }}>
                      <span
                        className="dot"
                        style={{
                          background:
                            focused.issue.pr && focused.issue.pr.checksFailed > 0
                              ? "var(--danger-solid)"
                              : "var(--success)",
                        }}
                      />
                      {focused.issue.branch?.name ?? "—"}
                      {focused.issue.pr &&
                        ` · PR #${focused.issue.pr.number} ${focused.issue.pr.state.toLowerCase()}`}
                    </div>
                    {focused.issue.pr && focused.issue.pr.checksFailed > 0 && (
                      <div style={{ font: "400 10.5px var(--sans)", color: "var(--danger)" }}>
                        {focused.issue.pr.checksFailed} check
                        {focused.issue.pr.checksFailed === 1 ? "" : "s"} failing
                      </div>
                    )}
                  </div>
                )}

                {focused.issue.lastComment && (
                  <div
                    style={{
                      borderRadius: 14,
                      background: "var(--card-alt)",
                      padding: 13,
                      display: "flex",
                      gap: 10,
                    }}
                  >
                    <Avatar
                      name={focused.issue.lastComment.author}
                      hue={focused.issue.lastComment.hue}
                      size={24}
                    />
                    <div style={{ font: "400 12px/1.6 var(--sans)", color: "var(--text-2)" }}>
                      <b>{focused.issue.lastComment.author.split(" ")[0]}</b> —{" "}
                      {focused.issue.lastComment.body}
                    </div>
                  </div>
                )}

                <div
                  style={{
                    borderRadius: 13,
                    background: "var(--card)",
                    border: "1px solid var(--hover)",
                    padding: "11px 13px",
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 10,
                  }}
                >
                  <textarea
                    rows={1}
                    placeholder="Reply…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    style={{
                      flex: 1,
                      background: "none",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      font: "400 12px/1.6 var(--sans)",
                      color: "var(--text)",
                      minHeight: 20,
                      maxHeight: 120,
                    }}
                  />
                  {reply.trim() ? (
                    <button className="btn btn-primary btn-sm" onClick={sendReply}>
                      Send
                    </button>
                  ) : (
                    <span className="mono" style={{ fontSize: 10, color: "var(--faint)" }}>
                      ⌘⏎
                    </span>
                  )}
                </div>

                <div style={{ marginTop: "auto", font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
                  Triage the whole queue without leaving this screen. Opened{" "}
                  <TimeAgo at={focused.createdAt} />.
                </div>
              </div>
            </>
          ) : (
            <Empty
              title="Nothing selected"
              hint="Pick something on the left, or press j to walk the queue."
            />
          )}
        </div>
      </div>
    </main>
  );
}

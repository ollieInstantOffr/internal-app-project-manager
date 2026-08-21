"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Empty, Modal, Popover } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/client";
import { describeDue, formatEstimate } from "@/lib/tasks/parse";
import { LIST_COLORS } from "@/lib/validators";
import { Composer } from "./Composer";
import { TaskRow, type RowActions } from "./TaskRow";
import { ConvertNote, DelegatedPanel, FocusChart, ReceivedCard } from "./Aside";
import { SnoozeMenu } from "./menus";
import type { TaskItem, TasksData } from "./types";

const VIEWS = [
  { key: "mine", label: "Mine" },
  { key: "delegated", label: "Delegated" },
  { key: "received", label: "Received" },
  { key: "done", label: "Done" },
] as const;

type View = (typeof VIEWS)[number]["key"];

/** A task waiting on my answer isn't mine to work on yet. */
function isPendingForMe(task: TaskItem) {
  return task.delegationStatus === "PENDING" && task.delegatedBy !== null;
}

function isSnoozed(task: TaskItem, now: Date) {
  return !!task.snoozedUntil && new Date(task.snoozedUntil) > now;
}

/** Overdue first, then today, then the soonest — nulls last. */
function byUrgency(a: TaskItem, b: TaskItem) {
  const at = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const bt = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  return at - bt;
}

export function TasksPage({ data }: { data: TasksData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, error } = useToast();

  const now = useMemo(() => new Date(data.now), [data.now]);
  const [view, setView] = useState<View>("mine");
  const [tasks, setTasks] = useState(data.mine);
  const [delegated, setDelegated] = useState(data.delegated);
  const [session, setSession] = useState(data.activeSession);
  const [composeOpen, setComposeOpen] = useState(0);
  const listId = params.get("list");
  const wantsNewList = params.get("new-list") === "1";

  // Server data is the source of truth; local state only bridges a refresh.
  useEffect(() => {
    setTasks(data.mine);
    setDelegated(data.delegated);
    setSession(data.activeSession);
  }, [data.mine, data.delegated, data.activeSession]);

  const refresh = useCallback(() => router.refresh(), [router]);

  const activeList = data.lists.find((l) => l.id === listId) ?? null;

  const visible = useMemo(() => {
    const scoped = listId ? tasks.filter((t) => t.list?.id === listId) : tasks;
    if (view === "received") return scoped.filter((t) => t.delegatedBy);
    if (view === "delegated") return delegated;
    if (view === "done") return data.done;
    return scoped.filter((t) => !isPendingForMe(t));
  }, [view, tasks, delegated, data.done, listId]);

  const pendingForMe = useMemo(
    () => tasks.filter(isPendingForMe).sort(byUrgency),
    [tasks],
  );

  const nextUp = useMemo(() => {
    if (view !== "mine") return null;
    return (
      visible
        .filter((t) => t.status === "OPEN" && !isSnoozed(t, now))
        .sort(byUrgency)[0] ?? null
    );
  }, [visible, view, now]);

  const dueToday = useMemo(
    () => tasks.filter((t) => describeDue(t.dueDate, now)?.tone === "today").length,
    [tasks, now],
  );

  const doneToday = useMemo(
    () =>
      data.done.filter(
        (t) => t.completedAt && new Date(t.completedAt).toDateString() === now.toDateString(),
      ).length,
    [data.done, now],
  );

  /* ── mutations ─────────────────────────────────────────── */

  const call = useCallback(
    async (run: () => Promise<unknown>, message?: string) => {
      try {
        await run();
        if (message) toast(message);
        refresh();
      } catch (err) {
        error(err instanceof ApiError ? err.message : "That didn't work");
        refresh();
      }
    },
    [toast, error, refresh],
  );

  /** Rows are drawn from two lists, so an optimistic edit has to touch both. */
  const editLocal = useCallback((id: string, change: (task: TaskItem) => TaskItem) => {
    const apply = (prev: TaskItem[]) => prev.map((t) => (t.id === id ? change(t) : t));
    setTasks(apply);
    setDelegated(apply);
  }, []);

  const actions: RowActions = useMemo(
    () => ({
      toggle: (task) => {
        const status = task.status === "DONE" ? "OPEN" : "DONE";
        // Optimistic, because ticking a box should feel instant.
        editLocal(task.id, (t) => ({ ...t, status }));
        call(() => api.patch(`/api/tasks/${task.id}`, { status }));
      },
      patch: (id, body) => {
        call(() => api.patch(`/api/tasks/${id}`, body));
      },
      remove: (task) => {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        setDelegated((prev) => prev.filter((t) => t.id !== task.id));
        api
          .del(`/api/tasks/${task.id}`)
          .then(() => {
            toast(`Deleted "${task.title}"`, {
              label: "Undo",
              run: () =>
                call(
                  () =>
                    api.post("/api/tasks", {
                      input: task.title,
                      listId: task.list?.id ?? null,
                      note: task.note,
                      dueDate: task.dueDate,
                      estimateMinutes: task.estimateMinutes,
                      issueKey: task.issue?.key ?? null,
                    }),
                  "Task restored",
                ),
            });
            refresh();
          })
          .catch((err) => {
            error(err instanceof ApiError ? err.message : "Could not delete that task");
            refresh();
          });
      },
      convert: (task) => {
        const project = data.projects[0];
        if (!project) {
          error("Create a project first");
          return;
        }
        call(
          () => api.post(`/api/tasks/${task.id}/convert`, { projectId: project.id }),
          `Moved onto the ${project.key} board`,
        );
      },
      addSubtask: (id, title) => call(() => api.post(`/api/tasks/${id}/subtasks`, { title })),
      toggleSubtask: (taskId, subtaskId, done) => {
        editLocal(taskId, (t) => ({
          ...t,
          subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, done } : s)),
        }));
        call(() => api.patch(`/api/tasks/subtasks/${subtaskId}`, { done }));
      },
      removeSubtask: (taskId, subtaskId) => {
        editLocal(taskId, (t) => ({
          ...t,
          subtasks: t.subtasks.filter((s) => s.id !== subtaskId),
        }));
        call(() => api.del(`/api/tasks/subtasks/${subtaskId}`));
      },
    }),
    [call, editLocal, toast, error, refresh, data.projects],
  );

  async function respond(
    task: TaskItem,
    action: "accept" | "decline" | "propose",
    extra?: Record<string, unknown>,
  ) {
    await call(
      () => api.post(`/api/tasks/${task.id}/respond`, { action, ...extra }),
      action === "accept"
        ? "Accepted — it's on your list"
        : action === "decline"
          ? "Sent back with your reason"
          : "New date proposed",
    );
  }

  function startFocus(task: TaskItem | null) {
    if (session) {
      const id = session.id;
      setSession(null);
      call(() => api.post(`/api/focus/${id}`, { minutes: elapsedMinutes(session.startedAt) }), "Focus logged");
      return;
    }
    call(
      () => api.post("/api/focus", { taskId: task?.id ?? null, plannedMinutes: 45 }),
      "Focus started — 45 minutes",
    );
  }

  /* ── grouping ──────────────────────────────────────────── */

  const groups = useMemo(() => {
    if (view === "done") {
      return [{ label: "COMPLETED", tasks: data.done }];
    }

    const open = visible.filter((t) => t.status === "OPEN" && !isSnoozed(t, now)).sort(byUrgency);
    const snoozed = visible.filter((t) => t.status === "OPEN" && isSnoozed(t, now));
    const rest = view === "mine" && nextUp ? open.filter((t) => t.id !== nextUp.id) : open;

    const today: TaskItem[] = [];
    const week: TaskItem[] = [];
    const later: TaskItem[] = [];
    const undated: TaskItem[] = [];

    for (const task of rest) {
      const due = describeDue(task.dueDate, now);
      if (!due) undated.push(task);
      else if (due.tone === "overdue" || due.tone === "today") today.push(task);
      else if (due.tone === "soon") week.push(task);
      else later.push(task);
    }

    return [
      { label: "TODAY", tasks: today },
      { label: "THIS WEEK", tasks: week },
      { label: "LATER", tasks: later },
      { label: "NO DATE", tasks: undated },
      { label: "SNOOZED", tasks: snoozed },
    ].filter((group) => group.tasks.length > 0);
  }, [visible, view, now, nextUp, data.done]);

  const nextDue = nextUp ? describeDue(nextUp.dueDate, now) : null;

  return (
    <main className="panel">
      <div className="tasks-split">
        <div className="tasks-main">
          <header className="tasks-head">
            <div>
              <h1 className="tasks-title">{activeList ? activeList.name : "Tasks"}</h1>
              <div className="tasks-date">
                {now.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                {dueToday > 0 ? ` · ${dueToday} due today` : " · nothing due today"}
              </div>
            </div>
            <div className="grow" />
            <div className="tasks-seg" role="tablist" aria-label="Task views">
              {VIEWS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={view === tab.key}
                  data-active={view === tab.key}
                  onClick={() => setView(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </header>

          {nextUp && (
            <div style={{ flex: "none", padding: "18px 26px 0" }}>
              <div className="next-up">
                <button
                  className="task-check"
                  style={{ width: 20, height: 20, borderColor: "var(--accent)", borderWidth: 2 }}
                  onClick={() => actions.toggle(nextUp)}
                  aria-label={`Complete ${nextUp.title}`}
                >
                  ✓
                </button>
                <div className="grow">
                  <div className="next-up-eyebrow">NEXT UP</div>
                  <div className="next-up-title">{nextUp.title}</div>
                  <div className="next-up-meta">
                    {nextUp.list && <span className="next-up-chip">{nextUp.list.name}</span>}
                    {nextDue && <span className="next-up-due">due {nextDue.label}</span>}
                    {nextUp.estimateMinutes && (
                      <span className="next-up-refs">{formatEstimate(nextUp.estimateMinutes)}</span>
                    )}
                    {nextUp.issue && <span className="next-up-refs">refs {nextUp.issue.key}</span>}
                  </div>
                </div>
                <div className="next-up-actions">
                  <button
                    className="btn-focus"
                    data-running={!!session}
                    onClick={() => startFocus(nextUp)}
                  >
                    <span className="dot" aria-hidden />
                    {session ? "Stop focus" : "Start 45m focus"}
                  </button>
                  <Popover
                    align="right"
                    width={200}
                    trigger={({ toggle }) => (
                      <button className="btn-onaccent" onClick={toggle}>
                        Snooze
                      </button>
                    )}
                  >
                    {(close) => (
                      <SnoozeMenu
                        close={close}
                        onPick={(until) =>
                          actions.patch(nextUp.id, { snoozedUntil: until.toISOString() })
                        }
                      />
                    )}
                  </Popover>
                </div>
              </div>
            </div>
          )}

          {view !== "done" && (
            <div style={{ flex: "none", padding: "14px 26px 0" }}>
              <Composer
                key={composeOpen}
                now={now}
                listId={listId}
                lists={data.lists}
                onCreated={refresh}
              />
            </div>
          )}

          <div className="tasks-list">
            {groups.length === 0 ? (
              <Empty
                title={
                  view === "delegated"
                    ? "Nothing delegated"
                    : view === "received"
                      ? "Nothing sent to you"
                      : view === "done"
                        ? "Nothing finished yet"
                        : "Nothing on your list"
                }
                hint={
                  view === "mine"
                    ? "Add one above — @name delegates it, tue sets a date."
                    : undefined
                }
              />
            ) : (
              groups.map((group) => (
                <Fragment key={group.label}>
                  <div className="task-group">
                    <div className="task-group-label">{group.label}</div>
                    <div className="task-group-count">
                      {group.label === "TODAY" ? `${group.tasks.length} left` : group.tasks.length}
                    </div>
                    <div className="task-group-rule" />
                  </div>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      now={now}
                      lists={data.lists}
                      actions={actions}
                      showOwner={view === "delegated"}
                    />
                  ))}
                </Fragment>
              ))
            )}

            {view !== "done" && (
              <div className="tasks-foot">
                <span className="tick" aria-hidden>
                  ✓
                </span>
                <div style={{ font: "400 11.5px var(--sans)", color: "var(--muted)" }}>
                  {doneToday} completed today
                </div>
                {doneToday > 0 && (
                  <button
                    style={{ font: "500 11px var(--sans)", color: "var(--accent)" }}
                    onClick={() => setView("done")}
                  >
                    Show
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="tasks-aside">
          {pendingForMe.map((task) => (
            <ReceivedCard
              key={task.id}
              task={task}
              now={now}
              onRespond={(action, extra) => respond(task, action, extra)}
            />
          ))}

          <DelegatedPanel
            tasks={delegated}
            now={now}
            onNudge={(task) =>
              call(() => api.post(`/api/tasks/${task.id}/nudge`), `Nudged ${task.owner.name}`)
            }
            onTakeBack={(task) =>
              call(() => api.post(`/api/tasks/${task.id}/take-back`), "Back on your list")
            }
            onNew={() => {
              setView("mine");
              setComposeOpen((n) => n + 1);
            }}
          />

          <FocusChart days={data.focus.days} totalMinutes={data.focus.totalMinutes} />

          <ConvertNote
            projects={data.projects}
            onConvert={(projectId) => {
              if (!nextUp) {
                error("Nothing to convert — pick a task first");
                return;
              }
              call(
                () => api.post(`/api/tasks/${nextUp.id}/convert`, { projectId }),
                "Converted — the task closes and links across",
              );
            }}
          />
        </aside>
      </div>

      {wantsNewList && <NewListDialog onDone={() => router.replace("/tasks")} />}
    </main>
  );
}

function elapsedMinutes(startedAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
}

function NewListDialog({ onDone }: { onDone: () => void }) {
  const { error } = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(LIST_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/task-lists", { name: name.trim(), color });
      router.refresh();
      onDone();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not create that list");
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New list"
      onClose={onDone}
      footer={
        <>
          <button className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>
            Create list
          </button>
          <button className="btn btn-quiet" onClick={onDone}>
            Cancel
          </button>
        </>
      }
    >
      <input
        className="input"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="Follow-ups"
        aria-label="List name"
      />
      <div style={{ display: "flex", gap: 8 }}>
        {LIST_COLORS.map((option) => (
          <button
            key={option}
            onClick={() => setColor(option)}
            aria-label={option}
            aria-pressed={color === option}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: `var(--list-${option})`,
              outline: color === option ? "2px solid var(--text)" : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Popover } from "@/components/ui";
import { describeDue, formatEstimate } from "@/lib/tasks/parse";
import { DueMenu, EstimateMenu, SnoozeMenu } from "./menus";
import type { TaskItem, TaskListRef } from "./types";

export type RowActions = {
  toggle: (task: TaskItem) => void;
  patch: (id: string, data: Record<string, unknown>) => void;
  remove: (task: TaskItem) => void;
  convert: (task: TaskItem) => void;
  addSubtask: (id: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void;
  removeSubtask: (taskId: string, subtaskId: string) => void;
};

export function TaskRow({
  task,
  now,
  lists,
  actions,
  showOwner,
}: {
  task: TaskItem;
  now: Date;
  lists: TaskListRef[];
  actions: RowActions;
  showOwner?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const due = describeDue(task.dueDate, now);
  const done = task.status === "DONE";
  const estimate = formatEstimate(task.estimateMinutes);

  const meta = [
    showOwner ? task.owner.name : null,
    task.list && !showOwner ? task.list.name : null,
    estimate,
    task.issue ? `refs ${task.issue.key}` : null,
    task.delegationStatus === "DECLINED" && task.declineReason
      ? `declined — ${task.declineReason}`
      : null,
    task.snoozedUntil && new Date(task.snoozedUntil) > now ? "snoozed" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="task-row" data-done={done}>
      <button
        className="task-check"
        data-done={done}
        data-overdue={!done && due?.tone === "overdue"}
        onClick={() => actions.toggle(task)}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
      >
        ✓
      </button>

      <span
        className="task-dot"
        style={{ background: task.list ? `var(--list-${task.list.color})` : "var(--line-strong)" }}
        aria-hidden
      />

      <div className="task-row-body">
        {editing ? (
          <input
            className="task-row-title"
            style={{ background: "none", border: 0, outline: 0 }}
            autoFocus
            defaultValue={task.title}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== task.title) actions.patch(task.id, { title });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Task title"
          />
        ) : (
          <button className="task-row-title" onClick={() => setEditing(true)}>
            {task.title}
          </button>
        )}

        {task.note && (
          <div style={{ font: "400 11.5px/1.6 var(--sans)", color: "var(--muted)", marginTop: 5 }}>
            {task.note}
          </div>
        )}

        {(task.subtasks.length > 0 || adding) && (
          <div className="task-subs">
            {task.subtasks.map((sub) => (
              <div key={sub.id} className="task-sub" data-done={sub.done}>
                <button
                  className="task-sub-check"
                  data-done={sub.done}
                  onClick={() => actions.toggleSubtask(task.id, sub.id, !sub.done)}
                  aria-label={sub.done ? `Reopen ${sub.title}` : `Complete ${sub.title}`}
                >
                  ✓
                </button>
                <span className="task-sub-title grow truncate">{sub.title}</span>
                <button
                  className="task-menu"
                  onClick={() => actions.removeSubtask(task.id, sub.id)}
                  aria-label={`Remove ${sub.title}`}
                >
                  ✕
                </button>
              </div>
            ))}
            {adding && (
              <div className="task-sub">
                <span className="task-sub-check" aria-hidden />
                <input
                  autoFocus
                  placeholder="Add a step…"
                  onBlur={() => setAdding(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setAdding(false);
                    if (e.key !== "Enter") return;
                    const el = e.target as HTMLInputElement;
                    const title = el.value.trim();
                    if (title) actions.addSubtask(task.id, title);
                    el.value = "";
                  }}
                  aria-label="New step"
                />
              </div>
            )}
          </div>
        )}

        {meta.length > 0 && (
          <div className="task-meta-row">
            {meta.map((entry) => (
              <span key={entry} className="task-meta">
                {entry}
              </span>
            ))}
          </div>
        )}
      </div>

      {due && (
        <span className="task-row-due" data-tone={due.tone}>
          {due.label}
        </span>
      )}

      <Popover
        align="right"
        width={200}
        trigger={({ toggle }) => (
          <button className="task-menu" onClick={toggle} aria-label={`Actions for ${task.title}`}>
            ⋯
          </button>
        )}
      >
        {(close) => (
          <>
            <button
              className="menu-item"
              onClick={() => {
                setEditing(true);
                close();
              }}
            >
              Rename
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setAdding(true);
                close();
              }}
            >
              Add a step
            </button>

            <div className="menu-sep" />
            <div className="eyebrow menu-label">Due</div>
            <DueMenu
              now={now}
              close={close}
              onPick={(date) => actions.patch(task.id, { dueDate: date ? date.toISOString() : null })}
            />

            <div className="menu-sep" />
            <div className="eyebrow menu-label">Estimate</div>
            <EstimateMenu
              close={close}
              onPick={(minutes) => actions.patch(task.id, { estimateMinutes: minutes })}
            />

            {lists.length > 0 && (
              <>
                <div className="menu-sep" />
                <div className="eyebrow menu-label">List</div>
                {lists.map((list) => (
                  <button
                    key={list.id}
                    className="menu-item"
                    data-active={list.id === task.list?.id}
                    onClick={() => {
                      actions.patch(task.id, { listId: list.id });
                      close();
                    }}
                  >
                    {list.name}
                  </button>
                ))}
                <button
                  className="menu-item"
                  onClick={() => {
                    actions.patch(task.id, { listId: null });
                    close();
                  }}
                >
                  No list
                </button>
              </>
            )}

            <div className="menu-sep" />
            <div className="eyebrow menu-label">Snooze</div>
            <SnoozeMenu
              close={close}
              onPick={(until) => actions.patch(task.id, { snoozedUntil: until.toISOString() })}
            />

            <div className="menu-sep" />
            <button
              className="menu-item"
              onClick={() => {
                actions.convert(task);
                close();
              }}
            >
              Convert to issue
            </button>
            <button
              className="menu-item"
              style={{ color: "var(--danger)" }}
              onClick={() => {
                actions.remove(task);
                close();
              }}
            >
              Delete
            </button>
          </>
        )}
      </Popover>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Avatar, Popover } from "@/components/ui";
import { describeDue, formatEstimate } from "@/lib/tasks/parse";
import { dueChoices } from "./menus";
import type { FocusDay, TaskItem } from "./types";

/**
 * Measured against the server's `now` rather than the clock, so the first
 * client render matches what was sent down.
 */
function ago(iso: string, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The card the recipient sees — 7b, second half. */
export function ReceivedCard({
  task,
  now,
  onRespond,
}: {
  task: TaskItem;
  now: Date;
  onRespond: (action: "accept" | "decline" | "propose", extra?: Record<string, unknown>) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const from = task.delegatedBy;
  const due = describeDue(task.dueDate, now);
  const propose = dueChoices(now)[2]; // "This Friday" — the one-tap counter-offer.

  const when = [
    task.delegatedAt ? ago(task.delegatedAt, now) : null,
    due ? `due ${due.label}` : null,
    formatEstimate(task.estimateMinutes),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="received-card" data-ring="true">
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        {from && <Avatar name={from.name} hue={from.avatarHue} size={26} />}
        <div className="grow">
          <div className="received-from">From {from?.name ?? "someone"}</div>
          <div className="received-when">{when}</div>
        </div>
        <span
          className="status-pill"
          data-status="PENDING"
          style={{ background: "oklch(0.42 0.05 40)", color: "oklch(0.95 0.03 40)", fontWeight: 600 }}
        >
          Needs answer
        </span>
      </div>

      <div style={{ font: "400 13.5px/1.45 var(--sans)" }}>{task.title}</div>

      {task.note && <div className="received-body">{task.note}</div>}

      {task.issue && (
        <div className="received-context">
          Context: <span className="mono" style={{ fontSize: 10.5 }}>{task.issue.key}</span> ·{" "}
          {task.issue.title}
        </div>
      )}

      {declining ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            className="delegate-textarea"
            autoFocus
            placeholder="Why not? They'll see this."
            onKeyDown={(e) => {
              if (e.key === "Escape") setDeclining(false);
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              onRespond("decline", { reason: (e.target as HTMLTextAreaElement).value });
            }}
            aria-label="Reason"
          />
          <div className="received-actions">
            <button
              className="btn-accept"
              onClick={(e) => {
                const box = (e.currentTarget.closest(".received-card") as HTMLElement).querySelector(
                  "textarea",
                );
                onRespond("decline", { reason: (box as HTMLTextAreaElement | null)?.value ?? "" });
              }}
            >
              Send it back
            </button>
            <button className="btn-onaccent btn-onaccent-sm" onClick={() => setDeclining(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="received-actions">
          <button className="btn-accept" onClick={() => onRespond("accept")}>
            Accept
          </button>
          {task.canRenegotiate && (
            <button
              className="btn-onaccent btn-onaccent-sm"
              onClick={() => onRespond("propose", { proposedDate: propose.date.toISOString() })}
            >
              Propose {propose.label.replace("This ", "")}
            </button>
          )}
          <button className="btn-onaccent btn-onaccent-sm" onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      )}

      <div style={{ font: "400 10.5px var(--sans)", color: "oklch(0.85 0.03 128)" }}>
        Declining sends it back with your reason — it never silently disappears.
      </div>
    </div>
  );
}

/** "Delegated by you" — what I've sent, and how it's going. */
export function DelegatedPanel({
  tasks,
  now,
  onNudge,
  onTakeBack,
  onNew,
}: {
  tasks: TaskItem[];
  now: Date;
  onNudge: (task: TaskItem) => void;
  onTakeBack: (task: TaskItem) => void;
  onNew: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px" }}>
        <div className="tasks-aside-title">Delegated by you</div>
        <button className="tasks-aside-link" style={{ marginLeft: "auto", fontSize: 10.5 }} onClick={onNew}>
          + New
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="tasks-aside-note">Nothing out with anyone right now.</div>
      )}

      {tasks.map((task) => {
        const due = describeDue(task.proposedDate ?? task.dueDate, now);
        const sentAgo = task.delegatedAt
          ? Math.floor((now.getTime() - new Date(task.delegatedAt).getTime()) / 864e5)
          : 0;
        const stale = task.delegationStatus === "PENDING" && sentAgo >= 2;

        const line =
          task.delegationStatus === "ACCEPTED"
            ? `accepted${due ? ` · due ${due.label}` : ""}`
            : task.delegationStatus === "DECLINED"
              ? `declined${task.declineReason ? ` · ${task.declineReason}` : ""}`
              : task.proposedDate
                ? `proposed ${describeDue(task.proposedDate, now)?.label}`
                : `sent ${sentAgo > 0 ? `${sentAgo}d ago` : "today"} · no answer`;

        return (
          <div key={task.id} className="delegated-item">
            <div style={{ display: "flex", gap: 9 }}>
              <Avatar name={task.owner.name} hue={task.owner.avatarHue} size={22} />
              <div className="grow">
                <div className="delegated-name truncate">{task.owner.name}</div>
                <div className="delegated-when" data-stale={stale || undefined}>
                  {line}
                </div>
              </div>
              <span className="status-pill" data-status={task.delegationStatus}>
                {task.delegationStatus === "ACCEPTED"
                  ? "Working"
                  : task.delegationStatus === "DECLINED"
                    ? "Declined"
                    : "Pending"}
              </span>
            </div>

            <div className="delegated-body">{task.title}</div>

            {task.proposedDate && task.delegationStatus === "PENDING" && (
              <div className="tasks-aside-note" style={{ padding: 0 }}>
                They asked for {describeDue(task.proposedDate, now)?.label} instead.
              </div>
            )}

            <div className="delegated-actions">
              {task.delegationStatus === "PENDING" && (
                <button className="btn-mini" onClick={() => onNudge(task)}>
                  {task.nudgedAt ? "Nudge again" : "Nudge"}
                </button>
              )}
              <button
                className="btn-mini btn-mini-auto"
                style={task.delegationStatus === "PENDING" ? undefined : { flex: 1 }}
                onClick={() => onTakeBack(task)}
              >
                Take back
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FocusChart({ days, totalMinutes }: { days: FocusDay[]; totalMinutes: number }) {
  const peak = Math.max(60, ...days.map((d) => d.minutes));
  const hours = Math.floor(totalMinutes / 60);
  const rest = totalMinutes % 60;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 11,
        paddingTop: 16,
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 2px" }}>
        <div className="tasks-aside-title">Focus this week</div>
        <div className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted-2)" }}>
          {hours}h {rest}m
        </div>
      </div>

      <div className="focus-chart">
        {days.map((day, index) => (
          <div key={index} className="focus-day" data-today={day.isToday}>
            <div
              className="focus-bar"
              style={{ height: `${Math.round((day.minutes / peak) * 100)}%` }}
              title={`${day.minutes}m`}
            />
            <div className="focus-day-label">{day.label}</div>
          </div>
        ))}
      </div>

      <div className="tasks-aside-note">Never counts toward sprint velocity.</div>
    </div>
  );
}

/** "Belongs on the board?" — the one door out of Tasks. */
export function ConvertNote({
  projects,
  onConvert,
}: {
  projects: { id: string; key: string; name: string }[];
  onConvert: (projectId: string) => void;
}) {
  return (
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 2px" }}>
        <span
          style={{
            width: 13,
            height: 13,
            borderRadius: 4,
            background: "var(--line-strong)",
            flex: "none",
          }}
          aria-hidden
        />
        <div className="tasks-aside-note" style={{ padding: 0 }}>
          Private by default — only delegated tasks are visible to others.
        </div>
      </div>

      <div className="tasks-aside-note">
        Belongs on the board?{" "}
        <Popover
          width={210}
          placement="top"
          trigger={({ toggle }) => (
            <button className="tasks-aside-link" onClick={toggle}>
              Convert to issue
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="eyebrow menu-label">Convert the next-up task into</div>
              {projects.map((project) => (
                <button
                  key={project.id}
                  className="menu-item"
                  onClick={() => {
                    onConvert(project.id);
                    close();
                  }}
                >
                  <span className="mono" style={{ fontSize: 10 }}>
                    {project.key}
                  </span>
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
            </>
          )}
        </Popover>{" "}
        — the task closes and links across.
      </div>
    </div>
  );
}

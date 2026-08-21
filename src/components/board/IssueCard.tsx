"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar } from "@/components/ui";
import { accent } from "@/lib/constants";
import { IssueStatus, PrState } from "@/lib/types";
import type { BoardIssue } from "./types";

export function IssueCard({
  issue,
  selected,
  onOpen,
  onSelect,
  sortable = true,
}: {
  issue: BoardIssue;
  selected: boolean;
  onOpen: () => void;
  onSelect: (e: React.MouseEvent) => void;
  sortable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
    disabled: !sortable,
  });

  const blocked = issue.blockedBy.filter((b) => b.status !== IssueStatus.DONE);
  const branch = issue.branches[0];
  const pr = issue.pullRequests[0];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="issue-card"
      data-selected={selected}
      data-dragging={isDragging}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.preventDefault();
          onSelect(e);
        } else {
          onOpen();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <div className="issue-card-title">{issue.title}</div>

      {branch && (
        <div className="branch-chip">
          <span
            className="dot"
            style={{
              background:
                pr?.checksFailed && pr.checksFailed > 0 ? "var(--danger-solid)" : "var(--success)",
            }}
          />
          <span className="truncate">{branch.name}</span>
        </div>
      )}

      {pr && !branch && (
        <div className="branch-chip">
          <span className="dot" style={{ background: "var(--blue)" }} />
          PR #{pr.number}
          {pr.approvals > 0 ? ` · ${pr.approvals} approval${pr.approvals === 1 ? "" : "s"}` : ""}
          {pr.checksFailed > 0 ? " · checks failing" : ""}
        </div>
      )}

      {blocked.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, font: "400 10.5px var(--sans)" }}>
          <span className="pill pill-danger" style={{ padding: "1px 8px", fontSize: 10 }}>
            blocked
          </span>
          <span style={{ color: "var(--muted)" }}>waiting on {blocked[0].key}</span>
        </div>
      )}

      <div className="issue-card-meta">
        <span className="chip-key">{issue.key}</span>

        {issue.epic && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 2,
              background: accent(issue.epic.color).base,
            }}
            title={issue.epic.name}
          />
        )}

        {issue.subtaskTotal > 0 && (
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>
            {issue.subtaskDone}/{issue.subtaskTotal}
          </span>
        )}

        {issue.commentCount > 0 && (
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>
            💬{issue.commentCount}
          </span>
        )}

        <span className="grow" />

        {issue.estimate != null && (
          <span
            className="pill pill-mono"
            style={{ padding: "1px 8px", background: "var(--hover)" }}
          >
            {issue.estimate}
          </span>
        )}

        <Avatar name={issue.assignee?.name} hue={issue.assignee?.avatarHue} size={22} />
      </div>
    </div>
  );
}

export function prTone(state: PrState) {
  if (state === PrState.MERGED) return "var(--violet)";
  if (state === PrState.DRAFT) return "var(--muted)";
  return "var(--blue)";
}

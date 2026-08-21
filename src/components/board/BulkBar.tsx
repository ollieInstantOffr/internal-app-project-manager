"use client";

import { useState } from "react";
import { Popover } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { IssueStatus, Priority } from "@/lib/types";
import { STATUS_LABEL, STATUS_ORDER, PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/constants";
import type { BoardEpic, BoardSprint, BoardLabel } from "./types";

export type BulkPatch = {
  status?: IssueStatus;
  priority?: Priority;
  estimate?: number | null;
  assigneeId?: string | null;
  epicId?: string | null;
  sprintId?: string | null;
  addLabelId?: string;
};

/**
 * The one action bar. It appears wherever rows or cards are multi-selected and
 * applies a single patch to everything selected.
 */
export function BulkBar({
  count,
  points,
  epics,
  sprints,
  labels,
  onApply,
  onClear,
  onSelectAll,
  hint = "shift-click to extend · esc to clear",
}: {
  count: number;
  points?: number;
  epics: BoardEpic[];
  sprints: BoardSprint[];
  labels: BoardLabel[];
  onApply: (patch: BulkPatch) => void;
  onClear: () => void;
  onSelectAll?: () => void;
  hint?: string;
}) {
  const { members, user } = useShell();
  const [estimateDraft, setEstimateDraft] = useState("");

  if (count === 0) return null;

  return (
    <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
      <span style={{ font: "600 12px var(--display)" }}>
        {count} selected{points !== undefined ? ` · ${points} pts` : ""}
      </span>
      <span className="sep" />

      <Menu label="Assign" width={220}>
        {(close) => (
          <>
            <button
              className="menu-item"
              onClick={() => {
                onApply({ assigneeId: user.id });
                close();
              }}
            >
              Assign to me
            </button>
            <button
              className="menu-item"
              onClick={() => {
                onApply({ assigneeId: null });
                close();
              }}
            >
              Unassign
            </button>
            <div className="menu-sep" />
            {members.map((m) => (
              <button
                key={m.id}
                className="menu-item"
                onClick={() => {
                  onApply({ assigneeId: m.id });
                  close();
                }}
              >
                {m.name}
              </button>
            ))}
          </>
        )}
      </Menu>

      <Menu label="Status">
        {(close) =>
          STATUS_ORDER.map((s) => (
            <button
              key={s}
              className="menu-item"
              onClick={() => {
                onApply({ status: s });
                close();
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          ))
        }
      </Menu>

      <Menu label="Epic">
        {(close) => (
          <>
            <button
              className="menu-item"
              onClick={() => {
                onApply({ epicId: null });
                close();
              }}
            >
              No epic
            </button>
            {epics.map((e) => (
              <button
                key={e.id}
                className="menu-item"
                onClick={() => {
                  onApply({ epicId: e.id });
                  close();
                }}
              >
                {e.name}
              </button>
            ))}
          </>
        )}
      </Menu>

      <Menu label="Sprint">
        {(close) => (
          <>
            <button
              className="menu-item"
              onClick={() => {
                onApply({ sprintId: null });
                close();
              }}
            >
              Backlog
            </button>
            {sprints.map((s) => (
              <button
                key={s.id}
                className="menu-item"
                onClick={() => {
                  onApply({ sprintId: s.id });
                  close();
                }}
              >
                {s.name}
              </button>
            ))}
          </>
        )}
      </Menu>

      <Menu label="Estimate" width={180}>
        {(close) => (
          <>
            {[1, 2, 3, 5, 8, 13].map((n) => (
              <button
                key={n}
                className="menu-item"
                onClick={() => {
                  onApply({ estimate: n });
                  close();
                }}
              >
                {n} pts
              </button>
            ))}
            <button
              className="menu-item"
              onClick={() => {
                onApply({ estimate: null });
                close();
              }}
            >
              No estimate
            </button>
            <div className="menu-sep" />
            <form
              style={{ display: "flex", gap: 6, padding: "4px 6px" }}
              onSubmit={(e) => {
                e.preventDefault();
                if (estimateDraft) onApply({ estimate: Number(estimateDraft) });
                setEstimateDraft("");
                close();
              }}
            >
              <input
                className="input input-sm"
                type="number"
                min={0}
                max={100}
                placeholder="Custom"
                value={estimateDraft}
                onChange={(e) => setEstimateDraft(e.target.value)}
              />
              <button className="btn btn-primary btn-sm">Set</button>
            </form>
          </>
        )}
      </Menu>

      <Menu label="Priority">
        {(close) =>
          PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              className="menu-item"
              onClick={() => {
                onApply({ priority: p });
                close();
              }}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))
        }
      </Menu>

      {labels.length > 0 && (
        <Menu label="Label">
          {(close) =>
            labels.map((l) => (
              <button
                key={l.id}
                className="menu-item"
                onClick={() => {
                  onApply({ addLabelId: l.id });
                  close();
                }}
              >
                {l.name}
              </button>
            ))
          }
        </Menu>
      )}

      <span className="grow" />

      {onSelectAll && (
        <button className="mono" style={{ fontSize: 10, opacity: 0.6 }} onClick={onSelectAll}>
          ⌘A all
        </button>
      )}
      <span className="mono" style={{ fontSize: 10, opacity: 0.55 }}>
        {hint}
      </span>
      <button aria-label="Clear selection" onClick={onClear} style={{ fontWeight: 700 }}>
        ✕
      </button>
    </div>
  );
}

function Menu({
  label,
  width,
  children,
}: {
  label: string;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  return (
    <Popover
      width={width}
      placement="top"
      trigger={({ toggle }) => <button onClick={toggle}>{label}</button>}
    >
      {(close) => <div style={{ color: "var(--text)" }}>{children(close)}</div>}
    </Popover>
  );
}

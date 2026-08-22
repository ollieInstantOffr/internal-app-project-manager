"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, Popover } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { humanMinutes } from "@/components/focus/context";
import { useToast } from "@/components/Toast";
import { IssueStatus, PrState, Priority } from "@/lib/types";
import { PRIORITY_LABEL, PRIORITY_ORDER, accent } from "@/lib/constants";
import type { BoardIssue, BoardEpic, BoardSprint } from "@/components/board/types";

export function IssueSidebar({
  issue,
  epics,
  sprints,
  onPatch,
  onAddBlock,
  onRemoveBlock,
  focusMinutes,
}: {
  issue: BoardIssue;
  epics: BoardEpic[];
  sprints: BoardSprint[];
  /** Minutes this person has logged here. Personal — nobody else sees it. */
  focusMinutes: number;
  onPatch: (patch: Record<string, unknown>) => void;
  onAddBlock: (key: string) => void;
  onRemoveBlock: (key: string) => void;
}) {
  const { members } = useShell();
  const { toast } = useToast();
  const [blockDraft, setBlockDraft] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  const branch = issue.branches[0];
  const pr = issue.pullRequests[0];

  return (
    <aside className="issue-aside">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Assignee">
          <Popover
            align="right"
            width={220}
            trigger={({ toggle }) => (
              <button className="row-flex" style={{ gap: 8 }} onClick={toggle}>
                <Avatar name={issue.assignee?.name} hue={issue.assignee?.avatarHue} size={22} />
                <span style={{ font: "500 12px var(--sans)" }}>
                  {issue.assignee?.name ?? "Unassigned"}
                </span>
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    onPatch({ assigneeId: null });
                    close();
                  }}
                >
                  Unassigned
                </button>
                {members.map((m) => (
                  <button
                    key={m.id}
                    className="menu-item"
                    data-active={issue.assignee?.id === m.id}
                    onClick={() => {
                      onPatch({ assigneeId: m.id });
                      close();
                    }}
                  >
                    <Avatar name={m.name} hue={m.avatarHue} size={18} />
                    {m.name}
                  </button>
                ))}
              </>
            )}
          </Popover>
        </Field>

        <Field label="Epic">
          <Popover
            align="right"
            width={220}
            trigger={({ toggle }) => (
              <button onClick={toggle}>
                {issue.epic ? (
                  <span
                    className="pill"
                    style={{ background: accent(issue.epic.color).soft, color: "var(--text)" }}
                  >
                    {issue.epic.name}
                  </span>
                ) : (
                  <span className="pill pill-outline">+ epic</span>
                )}
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    onPatch({ epicId: null });
                    close();
                  }}
                >
                  No epic
                </button>
                {epics.map((e) => (
                  <button
                    key={e.id}
                    className="menu-item"
                    data-active={issue.epic?.id === e.id}
                    onClick={() => {
                      onPatch({ epicId: e.id });
                      close();
                    }}
                  >
                    {e.name}
                  </button>
                ))}
              </>
            )}
          </Popover>
        </Field>

        <Field label="Sprint">
          <Popover
            align="right"
            width={200}
            trigger={({ toggle }) => (
              <button style={{ font: "500 12px var(--sans)" }} onClick={toggle}>
                {issue.sprint?.name ?? <span style={{ color: "var(--muted-2)" }}>Backlog</span>}
              </button>
            )}
          >
            {(close) => (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    onPatch({ sprintId: null });
                    close();
                  }}
                >
                  Backlog
                </button>
                {sprints.length === 0 && (
                  <div
                    className="menu-label"
                    style={{ color: "var(--muted-2)", fontSize: 11, lineHeight: 1.5 }}
                  >
                    No sprints yet — plan one from the backlog.
                  </div>
                )}
                {sprints.map((s) => (
                  <button
                    key={s.id}
                    className="menu-item"
                    data-active={issue.sprint?.id === s.id}
                    onClick={() => {
                      onPatch({ sprintId: s.id });
                      close();
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </>
            )}
          </Popover>
        </Field>

        <Field label="Estimate">
          <Popover
            align="right"
            width={160}
            trigger={({ toggle }) => (
              <button style={{ font: "500 12px var(--sans)" }} onClick={toggle}>
                {issue.estimate != null ? (
                  `${issue.estimate} pts`
                ) : (
                  <span style={{ color: "var(--muted-2)" }}>—</span>
                )}
              </button>
            )}
          >
            {(close) => (
              <>
                {[1, 2, 3, 5, 8, 13].map((n) => (
                  <button
                    key={n}
                    className="menu-item"
                    data-active={issue.estimate === n}
                    onClick={() => {
                      onPatch({ estimate: n });
                      close();
                    }}
                  >
                    {n} pts
                  </button>
                ))}
                <button
                  className="menu-item"
                  onClick={() => {
                    onPatch({ estimate: null });
                    close();
                  }}
                >
                  No estimate
                </button>
              </>
            )}
          </Popover>
        </Field>

        {focusMinutes > 0 && (
          <Field label="Your focus">
            <span
              className="mono"
              style={{ fontSize: 11.5, color: "var(--accent)" }}
              title="Only you can see this"
            >
              {humanMinutes(focusMinutes)}
              {issue.estimate ? (
                <span style={{ color: "var(--muted-2)" }}>
                  {" "}
                  · {Math.round(focusMinutes / issue.estimate)}m/pt
                </span>
              ) : null}
            </span>
          </Field>
        )}

        <Field label="Priority">
          <Popover
            align="right"
            width={160}
            trigger={({ toggle }) => (
              <button style={{ font: "500 12px var(--sans)" }} onClick={toggle}>
                {issue.priority === Priority.NONE ? (
                  <span style={{ color: "var(--muted-2)" }}>—</span>
                ) : (
                  PRIORITY_LABEL[issue.priority]
                )}
              </button>
            )}
          >
            {(close) =>
              PRIORITY_ORDER.map((p) => (
                <button
                  key={p}
                  className="menu-item"
                  data-active={issue.priority === p}
                  onClick={() => {
                    onPatch({ priority: p });
                    close();
                  }}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))
            }
          </Popover>
        </Field>

        <Field label="Blocks">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {issue.blocks.map((b) => (
              <button
                key={b.key}
                className="mono"
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: b.status === IssueStatus.DONE ? "var(--muted-2)" : "var(--accent)",
                }}
                title="Click to unlink"
                onClick={() => onRemoveBlock(b.key)}
              >
                {b.key}
              </button>
            ))}
            {addingBlock ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (blockDraft.trim()) onAddBlock(blockDraft.trim().toUpperCase());
                  setBlockDraft("");
                  setAddingBlock(false);
                }}
              >
                <input
                  className="input input-sm"
                  autoFocus
                  style={{ width: 100 }}
                  placeholder={`${issue.key.split("-")[0]}-123`}
                  value={blockDraft}
                  onChange={(e) => setBlockDraft(e.target.value)}
                  onBlur={() => setAddingBlock(false)}
                />
              </form>
            ) : (
              <button className="pill pill-outline" onClick={() => setAddingBlock(true)}>
                + blocks
              </button>
            )}
          </div>
        </Field>

        {issue.blockedBy.length > 0 && (
          <Field label="Blocked by">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {issue.blockedBy.map((b) => (
                <Link
                  key={b.key}
                  href={`/issues/${b.key}`}
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: b.status === IssueStatus.DONE ? "var(--muted-2)" : "var(--danger)",
                  }}
                >
                  {b.key}
                </Link>
              ))}
            </div>
          </Field>
        )}
      </div>

      <div className="divider" />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="eyebrow">Git</div>

        {branch ? (
          <div
            style={{
              borderRadius: 13,
              background: "var(--card-alt)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <div className="row-flex" style={{ gap: 8 }}>
              <span className="dot" style={{ background: "var(--success)" }} />
              <span className="mono grow truncate" style={{ fontSize: 11 }}>
                {branch.name}
              </span>
            </div>
            <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
              {branch.repo}
            </div>
          </div>
        ) : (
          <div className="card-dashed" style={{ borderRadius: 13, padding: 11, fontSize: 10.5, lineHeight: 1.6 }}>
            No branch yet. Put <span className="mono">{issue.key.toLowerCase()}</span> anywhere in a
            branch name — e.g.{" "}
            <span className="mono">feat/{issue.key.toLowerCase()}-…</span> — and this issue moves
            itself.
          </div>
        )}

        {pr && (
          <div
            style={{
              borderRadius: 13,
              background: "var(--card-alt)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <div className="mono" style={{ fontSize: 11 }}>
              PR #{pr.number} · {pr.state.toLowerCase()}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {pr.checksPassed > 0 && (
                <span className="pill pill-success pill-mono" style={{ padding: "1px 8px" }}>
                  {pr.checksPassed} passed
                </span>
              )}
              {pr.checksFailed > 0 && (
                <span className="pill pill-danger pill-mono" style={{ padding: "1px 8px" }}>
                  {pr.checksFailed} failed
                </span>
              )}
              {pr.approvals > 0 && (
                <span className="pill pill-mono" style={{ padding: "1px 8px" }}>
                  {pr.approvals} approval{pr.approvals === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        )}

        {pr && pr.state !== PrState.MERGED && (
          <div className="card-dashed" style={{ borderRadius: 13, padding: 11, fontSize: 10.5, lineHeight: 1.6 }}>
            Merging PR #{pr.number} moves this to <b style={{ color: "var(--text-2)" }}>Done</b>.
          </div>
        )}

        <button
          className="btn btn-ghost"
          style={{ borderRadius: 11, height: 34, width: "100%", fontWeight: 600, fontSize: 11 }}
          onClick={() => {
            const name = branch?.name ?? `feat/${issue.key.toLowerCase()}`;
            navigator.clipboard?.writeText(name);
            toast(`Copied ${name}`);
          }}
        >
          Copy branch name
        </button>
      </div>

      <div style={{ marginTop: "auto", font: "400 10.5px/1.6 var(--sans)", color: "var(--faint)" }}>
        Only the title was required to create this issue.
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 74, flex: "none", font: "400 10.5px var(--sans)", color: "var(--muted-2)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

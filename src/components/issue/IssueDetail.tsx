"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Editable, Modal, Popover } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { Role } from "@/lib/types";
import { IssueStatus } from "@/lib/types";
import { STATUS_LABEL, STATUS_ORDER, accent } from "@/lib/constants";
import { Subtasks, type Subtask } from "./Subtasks";
import { Discussion, type Comment, type ActivityRow } from "./Discussion";
import { IssueSidebar } from "./IssueSidebar";
import type { BoardIssue, BoardEpic, BoardSprint, BoardLabel } from "@/components/board/types";

const STATUS_STYLE: Record<IssueStatus, React.CSSProperties> = {
  TRIAGE: { background: "var(--hover)", color: "var(--text-2)" },
  TODO: { background: "var(--hover)", color: "var(--text-2)" },
  IN_PROGRESS: { background: "var(--accent)", color: "var(--accent-fg)" },
  IN_REVIEW: { background: "var(--blue-dim)", color: "oklch(0.92 0.04 230)" },
  DONE: { background: "var(--success-bg)", color: "var(--success-fg)" },
};

export function IssueDetail({
  issue,
  subtasks,
  comments,
  activities,
  epics,
  sprints,
  labels,
  neighbours,
  projectName,
}: {
  issue: BoardIssue;
  subtasks: Subtask[];
  comments: Comment[];
  activities: ActivityRow[];
  epics: BoardEpic[];
  sprints: BoardSprint[];
  labels: BoardLabel[];
  neighbours: { prev: string | null; next: string | null };
  projectName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useShell();
  const [local, setLocal] = useState(issue);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAdmin = role === Role.OWNER || role === Role.ADMIN;

  async function archive() {
    try {
      await api.del(`/api/issues/${issue.key}`);
      toast(`${issue.key} archived`, {
        label: "Undo",
        run: async () => {
          await api.patch(`/api/issues/${issue.key}`, { archived: false }).catch(() => {});
          router.refresh();
        },
      });
      router.push(`/projects/${issue.key.split("-")[0]}/board`);
      router.refresh();
    } catch {
      toast("Couldn't archive that issue");
    }
  }

  async function destroy() {
    try {
      await api.del(`/api/issues/${issue.key}?permanent=1`);
      setConfirmDelete(false);
      toast(`${issue.key} deleted`);
      router.push(`/projects/${issue.key.split("-")[0]}/board`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't delete that issue");
    }
  }

  useEffect(() => setLocal(issue), [issue]);

  // The rail dims while an issue is open — it reads as a panel over the board.
  useEffect(() => {
    document.body.dataset.dimRail = "1";
    return () => {
      delete document.body.dataset.dimRail;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey) return;

      if (e.key === "Escape") router.back();
      if (e.key === "ArrowDown" && neighbours.next) router.push(`/issues/${neighbours.next}`);
      if (e.key === "ArrowUp" && neighbours.prev) router.push(`/issues/${neighbours.prev}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, neighbours]);

  async function patch(body: Record<string, unknown>) {
    const previous = local;
    setLocal((prev) => ({
      ...prev,
      ...(body.title !== undefined ? { title: body.title as string } : {}),
      ...(body.status !== undefined ? { status: body.status as IssueStatus } : {}),
      ...(body.estimate !== undefined ? { estimate: body.estimate as number | null } : {}),
      ...(body.priority !== undefined ? { priority: body.priority as never } : {}),
    }));
    try {
      await api.patch(`/api/issues/${issue.key}`, body);
      router.refresh();
    } catch {
      setLocal(previous);
      toast("Couldn't save that change");
    }
  }

  async function toggleLabel(labelId: string) {
    const has = local.labels.some((l) => l.id === labelId);
    const next = has
      ? local.labels.filter((l) => l.id !== labelId)
      : [...local.labels, labels.find((l) => l.id === labelId)!];
    setLocal((prev) => ({ ...prev, labels: next }));
    await api
      .patch(`/api/issues/${issue.key}`, { labelIds: next.map((l) => l.id) })
      .catch(() => toast("Couldn't update labels"));
    router.refresh();
  }

  return (
    <main className="panel">
      <div className="split split-issue">
        <div className="split-main">
          <header
            style={{
              height: 56,
              flex: "none",
              display: "flex",
              alignItems: "center",
              padding: "0 24px",
              gap: 12,
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <div className="mono truncate" style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
              <Link href={`/projects/${issue.key.split("-")[0]}/board`}>{projectName}</Link>
              {local.epic && (
                <>
                  {" / "}
                  <Link href={`/projects/${issue.key.split("-")[0]}/epics?epic=${local.epic.id}`}>
                    {local.epic.key}
                  </Link>
                </>
              )}
              {" / "}
              <span style={{ color: "var(--text)" }}>{local.key}</span>
            </div>

            <div className="grow" />

            <span
              className="mono kbd-hint"
              style={{ fontSize: 11, color: "var(--muted-2)" }}
            >
              ↑↓ next issue
            </span>

            <Popover
              align="right"
              width={220}
              trigger={({ toggle }) => (
                <button className="btn btn-ghost" onClick={toggle} aria-label="Issue actions">
                  ⋯
                </button>
              )}
            >
              {(close) => (
                <>
                  <button
                    className="menu-item"
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href);
                      toast("Link copied");
                      close();
                    }}
                  >
                    Copy link
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => {
                      const branch =
                        local.branches[0]?.name ?? `feat/${local.key.toLowerCase()}`;
                      navigator.clipboard?.writeText(branch);
                      toast(`Copied ${branch}`);
                      close();
                    }}
                  >
                    Copy branch name
                  </button>

                  <div className="menu-sep" />

                  <button
                    className="menu-item"
                    onClick={() => {
                      close();
                      archive();
                    }}
                  >
                    Archive issue
                  </button>
                  <button
                    className="menu-item"
                    style={{ color: isAdmin ? "var(--danger)" : "var(--faintest)" }}
                    disabled={!isAdmin}
                    title={isAdmin ? undefined : "Only an admin can delete permanently"}
                    onClick={() => {
                      if (!isAdmin) return;
                      close();
                      setConfirmDelete(true);
                    }}
                  >
                    Delete permanently
                  </button>
                </>
              )}
            </Popover>

            <button className="btn btn-ghost" onClick={() => router.back()}>
              Close esc
            </button>
          </header>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: "26px 30px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              overflowY: "auto",
            }}
          >
            <Editable
              value={local.title}
              onCommit={(title) => patch({ title })}
              style={{ font: "600 25px/1.3 var(--display)", letterSpacing: "-0.02em" }}
              placeholder="Give it a title"
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Popover
                trigger={({ toggle }) => (
                  <button
                    className="pill"
                    style={{ ...STATUS_STYLE[local.status], fontWeight: 600, fontSize: 11, padding: "4px 12px" }}
                    onClick={toggle}
                  >
                    {STATUS_LABEL[local.status]}
                  </button>
                )}
              >
                {(close) =>
                  STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      className="menu-item"
                      data-active={local.status === s}
                      onClick={() => {
                        patch({ status: s });
                        close();
                      }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))
                }
              </Popover>

              {local.labels.map((label) => (
                <button
                  key={label.id}
                  className="pill"
                  style={{
                    background: accent(label.color).soft,
                    color: "var(--text)",
                    fontWeight: 500,
                    fontSize: 11,
                    padding: "4px 12px",
                  }}
                  title="Click to remove"
                  onClick={() => toggleLabel(label.id)}
                >
                  {label.name}
                </button>
              ))}

              <Popover
                width={200}
                trigger={({ toggle }) => (
                  <button className="pill pill-outline" style={{ padding: "4px 12px" }} onClick={toggle}>
                    + label
                  </button>
                )}
              >
                {() =>
                  labels.length ? (
                    labels.map((label) => (
                      <button
                        key={label.id}
                        className="menu-item"
                        data-active={local.labels.some((l) => l.id === label.id)}
                        onClick={() => toggleLabel(label.id)}
                      >
                        {label.name}
                      </button>
                    ))
                  ) : (
                    <div className="menu-label" style={{ color: "var(--muted)", fontSize: 12 }}>
                      No labels in this project yet.
                    </div>
                  )
                }
              </Popover>
            </div>

            <Editable
              multiline
              value={local.description ?? ""}
              onCommit={(description) => patch({ description })}
              placeholder="Click to add a description — no modal, no save button."
              style={{
                font: "400 13px/1.75 var(--sans)",
                color: "var(--text-3)",
                maxWidth: 640,
                whiteSpace: "pre-wrap",
              }}
            />

            <Subtasks issueKey={local.key} subtasks={subtasks} />

            <Discussion issueKey={local.key} comments={comments} activities={activities} />
          </div>
        </div>

        <IssueSidebar
          issue={local}
          epics={epics}
          sprints={sprints}
          onPatch={patch}
          onAddBlock={async (key) => {
            try {
              await api.post(`/api/issues/${local.key}/blocks`, { blockedKey: key });
              router.refresh();
              toast(`${local.key} now blocks ${key}`);
            } catch {
              toast(`Couldn't find ${key}`);
            }
          }}
          onRemoveBlock={async (key) => {
            await api.del(`/api/issues/${local.key}/blocks`, { blockedKey: key }).catch(() => {});
            router.refresh();
          }}
        />
      </div>

      {confirmDelete && (
        <Modal title={`Delete ${local.key}?`} onClose={() => setConfirmDelete(false)}>
          <p style={{ font: "400 12.5px/1.7 var(--sans)", color: "var(--muted)", margin: 0 }}>
            This removes the issue and everything attached to it — comments, subtasks, git links
            and history. It cannot be undone.
          </p>
          <p style={{ font: "400 12px/1.7 var(--sans)", color: "var(--text-3)", margin: 0 }}>
            Archiving hides it from every board and list but keeps all of that, and can be undone.
          </p>
          <div style={{ display: "flex", gap: 9 }}>
            <button
              className="btn btn-outline grow"
              onClick={() => {
                setConfirmDelete(false);
                archive();
              }}
            >
              Archive instead
            </button>
            <button className="btn btn-danger grow" onClick={destroy}>
              Delete permanently
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

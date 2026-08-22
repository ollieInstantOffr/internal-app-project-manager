"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { ViewPicker } from "@/components/views/ViewPicker";
import { Avatar, Bar, Check, Empty, Popover } from "@/components/ui";
import { NewIssueModal } from "@/components/NewIssueButton";
import { BulkBar, type BulkPatch } from "@/components/board/BulkBar";
import { IssueStatus, SprintStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/constants";
import type { BoardIssue, BoardProject, BoardEpic, BoardSprint, BoardLabel } from "@/components/board/types";
import { ProjectCrumb } from "@/components/shell/ProjectCrumb";

type GroupBy = "epic" | "status" | "assignee" | "none";

export function Backlog({
  project,
  initialIssues,
  epics,
  sprints,
  labels,
}: {
  project: BoardProject;
  initialIssues: BoardIssue[];
  epics: BoardEpic[];
  sprints: BoardSprint[];
  labels: BoardLabel[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { members } = useShell();

  const [issues, setIssues] = useState(initialIssues);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("epic");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragging, setDragging] = useState<BoardIssue | null>(null);
  const [modalSeed, setModalSeed] = useState<{ epicId: string | null } | null>(null);
  const [hideDone, setHideDone] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<BoardIssue[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const lastClicked = useRef<string | null>(null);

  useEffect(() => setIssues(initialIssues), [initialIssues]);

  // Archived issues live outside the normal query, so they're fetched on demand.
  useEffect(() => {
    if (!showArchived) return;
    let cancelled = false;
    setLoadingArchived(true);
    api
      .get<{ issues: BoardIssue[] }>(`/api/issues?project=${project.key}&archived=1`)
      .then((res) => !cancelled && setArchived(res.issues))
      .catch(() => !cancelled && toast("Couldn't load archived issues"))
      .finally(() => !cancelled && setLoadingArchived(false));
    return () => {
      cancelled = true;
    };
  }, [showArchived, project.key, initialIssues, toast]);

  const planning =
    sprints.find((s) => s.status === SprintStatus.PLANNED) ??
    sprints.find((s) => s.status === SprintStatus.ACTIVE) ??
    null;

  const source = showArchived ? archived : issues;

  const backlog = useMemo(
    () =>
      (showArchived ? archived : issues)
        .filter((i) => !planning || i.sprint?.id !== planning.id)
        .filter((i) => (hideDone ? i.status !== IssueStatus.DONE : true))
        .sort((a, b) => a.rank - b.rank),
    [issues, archived, showArchived, planning, hideDone],
  );

  const inSprint = useMemo(
    () => issues.filter((i) => planning && i.sprint?.id === planning.id).sort((a, b) => a.rank - b.rank),
    [issues, planning],
  );

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ id: "all", label: "All issues", issues: backlog }];

    const map = new Map<string, { id: string; label: string; meta?: string; issues: BoardIssue[] }>();

    for (const issue of backlog) {
      let id = "none";
      let label = "No epic";

      if (groupBy === "epic") {
        id = issue.epic?.id ?? "none";
        label = issue.epic ? `${issue.epic.key} · ${issue.epic.name}` : "No epic";
      } else if (groupBy === "status") {
        id = issue.status;
        label = STATUS_LABEL[issue.status];
      } else {
        id = issue.assignee?.id ?? "none";
        label = issue.assignee?.name ?? "Unassigned";
      }

      const entry = map.get(id) ?? { id, label, issues: [] };
      entry.issues.push(issue);
      map.set(id, entry);
    }

    return [...map.values()];
  }, [backlog, groupBy]);

  const orderedVisible = groups.flatMap((g) => (collapsed.includes(g.id) ? [] : g.issues));

  const selectedIssues = source.filter((i) => selected.includes(i.id));
  const selectedPoints = selectedIssues.reduce((n, i) => n + (i.estimate ?? 0), 0);

  const backlogPoints = backlog.reduce((n, i) => n + (i.estimate ?? 0), 0);
  const unestimated = backlog.filter((i) => i.estimate == null).length;

  const sprintPoints = inSprint.reduce((n, i) => n + (i.estimate ?? 0), 0);

  const toggleSelect = useCallback(
    (id: string, e: React.MouseEvent) => {
      setSelected((prev) => {
        if (e.shiftKey && lastClicked.current) {
          const ids = orderedVisible.map((i) => i.id);
          const from = ids.indexOf(lastClicked.current);
          const to = ids.indexOf(id);
          if (from !== -1 && to !== -1) {
            const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
            return [...new Set([...prev, ...range])];
          }
        }
        lastClicked.current = id;
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      });
    },
    [orderedVisible],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable);
      if (e.key === "Escape" && selected.length) setSelected([]);
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && selected.length) {
        e.preventDefault();
        setSelected(orderedVisible.map((i) => i.id));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.length, orderedVisible]);

  async function applyBulk(patch: BulkPatch) {
    const ids = [...selected];
    const previous = issues;
    setSelected([]);
    try {
      await api.post("/api/issues/bulk", { issueIds: ids, patch });
      if (showArchived) setArchived((prev) => prev.filter((i) => !ids.includes(i.id)));
      router.refresh();
      toast(`${ids.length} issue${ids.length === 1 ? "" : "s"} updated`, {
        label: "Undo",
        run: async () => {
          await Promise.all(
            previous
              .filter((i) => ids.includes(i.id))
              .map((i) =>
                api.patch(`/api/issues/${i.key}`, {
                  status: i.status,
                  estimate: i.estimate,
                  assigneeId: i.assignee?.id ?? null,
                  epicId: i.epic?.id ?? null,
                  sprintId: i.sprint?.id ?? null,
                }),
              ),
          );
          router.refresh();
        },
      });
    } catch {
      toast("Couldn't apply that");
    }
  }

  async function moveToSprint(issueIds: string[], sprintId: string | null) {
    if (!issueIds.length) return;
    try {
      await api.post("/api/issues/bulk", { issueIds, patch: { sprintId } });
      router.refresh();
    } catch {
      toast("Couldn't move that");
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragStart(event: DragStartEvent) {
    setDragging(issues.find((i) => i.id === event.active.id) ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragging(null);
    if (!over) return;

    const dragged = String(active.id);
    // Dragging a selected row carries the whole selection with it.
    const ids = selected.includes(dragged) ? selected : [dragged];

    if (over.id === "sprint-drop" && planning) {
      await moveToSprint(ids, planning.id);
      setSelected([]);
    }
    if (over.id === "backlog-drop") {
      await moveToSprint(ids, null);
      setSelected([]);
    }
  }

  async function startSprint() {
    if (!planning) return;
    try {
      await api.patch(`/api/sprints/${planning.id}`, { action: "start" });
      toast(`${planning.name} started`);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't start the sprint");
    }
  }

  async function completeSprint() {
    if (!planning) return;
    const res = await api
      .patch<{ carriedOver: number; into: string }>(`/api/sprints/${planning.id}`, {
        action: "complete",
      })
      .catch(() => null);
    if (res) toast(`${planning.name} complete — ${res.carriedOver} carried into ${res.into}`);
    router.refresh();
  }

  async function createSprint() {
    const start = new Date();
    const end = new Date(Date.now() + 12 * 864e5);
    await api
      .post("/api/sprints", {
        projectId: project.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      })
      .catch(() => toast("Couldn't create a sprint"));
    router.refresh();
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Backlog</h1>
          <ProjectCrumb color={project.color} name={project.name} />
          <div className="panel-sub">
            {backlog.length} issue{backlog.length === 1 ? "" : "s"} · {backlogPoints} point
            {backlogPoints === 1 ? "" : "s"}
            {unestimated > 0 && (
              <span style={{ color: "var(--muted-2)" }}> · unestimated {unestimated}</span>
            )}
          </div>
        </div>

        <div className="grow" />

        <ViewPicker
          scope="BACKLOG"
          projectId={project.id}
          filters={{ groupBy, hideDone, showArchived }}
          isEmpty={groupBy === "epic" && hideDone && !showArchived}
          describe={(f) =>
            `group by ${f.groupBy}${f.hideDone ? " · hide done" : ""}${f.showArchived ? " · with archived" : ""}`
          }
          onApply={(next) => {
            setGroupBy((next?.groupBy as GroupBy) ?? "epic");
            setHideDone(next?.hideDone ?? true);
            setShowArchived(next?.showArchived ?? false);
          }}
        />

        <Popover
          align="right"
          width={190}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle}>
              Group: {groupBy === "none" ? "None" : groupBy[0].toUpperCase() + groupBy.slice(1)} ⌄
            </button>
          )}
        >
          {(close) =>
            (["epic", "status", "assignee", "none"] as GroupBy[]).map((g) => (
              <button
                key={g}
                className="menu-item"
                data-active={groupBy === g}
                onClick={() => {
                  setGroupBy(g);
                  close();
                }}
              >
                {g === "none" ? "No grouping" : g[0].toUpperCase() + g.slice(1)}
              </button>
            ))
          }
        </Popover>

        <button className="btn btn-ghost" onClick={() => setHideDone((v) => !v)}>
          {hideDone ? "Hide done" : "Showing done"}
        </button>

        <button
          className="btn btn-ghost"
          data-active={showArchived}
          style={
            showArchived
              ? { background: "var(--white)", color: "var(--white-fg)", fontWeight: 600 }
              : undefined
          }
          onClick={() => {
            setShowArchived((v) => !v);
            setSelected([]);
          }}
        >
          {showArchived ? "Viewing archived" : "Archived"}
        </button>

        <button className="btn btn-primary" onClick={() => setModalSeed({ epicId: null })}>
          New issue
        </button>
      </header>

      <DndContext
        id="arc-backlog"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="split split-backlog">
          <BacklogList
            groups={groups}
            collapsed={collapsed}
            onToggleGroup={(id) =>
              setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
            selected={selected}
            onSelect={toggleSelect}
            onOpen={(key) => router.push(`/issues/${key}`)}
            onNewInGroup={(epicId) => setModalSeed({ epicId })}
            groupBy={groupBy}
            totalIssues={source.length}
            emptyTitle={showArchived ? "Nothing archived" : undefined}
            loading={loadingArchived}
            bulk={
              <BulkBar
                count={selected.length}
                points={selectedPoints}
                epics={epics}
                sprints={sprints}
                labels={labels}
                onApply={applyBulk}
                onClear={() => setSelected([])}
                onSelectAll={() => setSelected(orderedVisible.map((i) => i.id))}
                mode={showArchived ? "archived" : "active"}
                hint={
                  showArchived
                    ? "restore puts them back on the board"
                    : planning
                      ? `drag onto ${planning.name} to plan it`
                      : "shift-click to extend"
                }
              />
            }
          />

          <SprintPanel
            sprint={planning}
            issues={inSprint}
            points={sprintPoints}
            selectedCount={selected.length}
            selectedPoints={selectedPoints}
            onStart={startSprint}
            onComplete={completeSprint}
            onCreate={createSprint}
            onOpen={(key) => router.push(`/issues/${key}`)}
            onRemove={(id) => moveToSprint([id], null)}
            onAddSelected={() => {
              if (planning) {
                moveToSprint(selected, planning.id);
                setSelected([]);
              }
            }}
          />
        </div>

        <DragOverlay>
          {dragging && (
            <div
              className="card-tight"
              style={{ background: "var(--raised)", width: 320, display: "flex", gap: 10 }}
            >
              <span className="chip-key">{dragging.key}</span>
              <span className="truncate">{dragging.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {modalSeed && (
        <NewIssueModal
          projectId={project.id}
          epicId={modalSeed.epicId}
          onClose={() => setModalSeed(null)}
        />
      )}
    </main>
  );
}

/* ── list ─────────────────────────────────────────────────── */

function BacklogList({
  groups,
  collapsed,
  onToggleGroup,
  selected,
  onSelect,
  onOpen,
  onNewInGroup,
  groupBy,
  bulk,
  totalIssues,
  emptyTitle,
  loading,
}: {
  emptyTitle?: string;
  loading?: boolean;
  groups: { id: string; label: string; issues: BoardIssue[] }[];
  totalIssues: number;
  collapsed: string[];
  onToggleGroup: (id: string) => void;
  selected: string[];
  onSelect: (id: string, e: React.MouseEvent) => void;
  onOpen: (key: string) => void;
  onNewInGroup: (epicId: string | null) => void;
  groupBy: string;
  bulk: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "backlog-drop" });

  return (
    <div
      ref={setNodeRef}
      className="backlog-list"
      style={{ background: isOver ? "var(--accent-wash)" : undefined }}
    >
      <div className="scroll-y" style={{ flex: 1, paddingRight: 6 }}>
        {groups.map((group) => {
          const points = group.issues.reduce((n, i) => n + (i.estimate ?? 0), 0);
          const done = group.issues.filter((i) => i.status === IssueStatus.DONE).length;
          const isCollapsed = collapsed.includes(group.id);

          return (
            <div key={group.id} style={{ marginBottom: 10 }}>
              <div className="group-head" onClick={() => onToggleGroup(group.id)}>
                <span style={{ font: "400 10px var(--sans)", color: "var(--muted)" }}>
                  {isCollapsed ? "▸" : "▾"}
                </span>
                <span className="group-title">{group.label}</span>
                <span className="group-meta">
                  {group.issues.length} issue{group.issues.length === 1 ? "" : "s"} · {points} pts
                </span>
                <span className="grow" />
                {group.issues.length > 0 && (
                  <div className="bar bar-sm" style={{ width: 70 }}>
                    <i style={{ width: `${Math.round((done / group.issues.length) * 100)}%` }} />
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <>
                  {group.issues.map((issue) => (
                    <BacklogRow
                      key={issue.id}
                      issue={issue}
                      selected={selected.includes(issue.id)}
                      onSelect={(e) => onSelect(issue.id, e)}
                      onOpen={() => onOpen(issue.key)}
                    />
                  ))}
                  <button
                    style={{
                      padding: "10px 14px",
                      font: "400 11.5px var(--sans)",
                      color: "var(--muted-2)",
                    }}
                    onClick={() => onNewInGroup(groupBy === "epic" && group.id !== "none" ? group.id : null)}
                  >
                    + New issue{groupBy === "epic" && group.id !== "none" ? " in this epic" : ""}
                  </button>
                </>
              )}
            </div>
          );
        })}

        {loading && <div className="empty">Loading…</div>}

        {!loading && groups.every((g) => g.issues.length === 0) && (
          <Empty
            title={emptyTitle ?? (totalIssues === 0 ? "No issues yet" : "Backlog is empty")}
            hint={
              totalIssues === 0
                ? "Create one from the board or with New issue — a title is all it needs."
                : "Everything is planned into a sprint."
            }
          />
        )}
      </div>

      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>{bulk}</div>
    </div>
  );
}

function BacklogRow({
  issue,
  selected,
  onSelect,
  onOpen,
}: {
  issue: BoardIssue;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="row"
      data-selected={selected}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) {
          e.preventDefault();
          onSelect(e);
        } else {
          onOpen();
        }
      }}
    >
      <Check on={selected} onChange={() => onSelect({ shiftKey: false } as React.MouseEvent)} />
      <span className="chip-key" style={{ width: 60, color: selected ? "var(--accent-mono)" : undefined }}>
        {issue.key}
      </span>
      <span className="row-title truncate">{issue.title}</span>

      {issue.blockedBy.some((b) => b.status !== IssueStatus.DONE) && (
        <span className="pill pill-danger" style={{ fontSize: 10, padding: "1px 8px" }}>
          blocked
        </span>
      )}

      {issue.estimate != null ? (
        <span className="pill pill-mono" style={{ padding: "1px 8px" }}>
          {issue.estimate}
        </span>
      ) : (
        <span className="pill pill-outline pill-mono" style={{ padding: "1px 8px" }}>
          –
        </span>
      )}

      <Avatar name={issue.assignee?.name} hue={issue.assignee?.avatarHue} size={22} />
    </div>
  );
}

/* ── sprint panel ─────────────────────────────────────────── */

function SprintPanel({
  sprint,
  issues,
  points,
  selectedCount,
  selectedPoints,
  onStart,
  onComplete,
  onCreate,
  onOpen,
  onRemove,
  onAddSelected,
}: {
  sprint: BoardSprint | null;
  issues: BoardIssue[];
  points: number;
  selectedCount: number;
  selectedPoints: number;
  onStart: () => void;
  onComplete: () => void;
  onCreate: () => void;
  onOpen: (key: string) => void;
  onRemove: (id: string) => void;
  onAddSelected: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "sprint-drop" });

  if (!sprint) {
    return (
      <aside className="sprint-panel">
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ font: "600 14px var(--display)" }}>No sprint planned</h2>
          <div style={{ font: "400 11px/1.6 var(--sans)", color: "var(--muted)" }}>
            Create one and drag issues in. Capacity comes from the last three sprints&rsquo; velocity.
          </div>
          <button className="btn btn-primary btn-block" onClick={onCreate}>
            Plan a sprint
          </button>
        </div>
      </aside>
    );
  }

  const capacityPct = sprint.capacity ? Math.round((points / sprint.capacity) * 100) : 0;
  const over = points > sprint.capacity;
  const active = sprint.status === SprintStatus.ACTIVE;

  const range = `${new Date(sprint.startDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${new Date(sprint.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <aside className="sprint-panel">
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h2 style={{ font: "600 14px var(--display)" }}>{sprint.name}</h2>
          {active && <span className="pill pill-accent">Active</span>}
          <span
            style={{ font: "400 10.5px var(--sans)", color: "var(--muted)", marginLeft: "auto" }}
          >
            {range}
          </span>
        </div>

        <div className="row-flex">
          <div className="grow">
            <Bar
              value={Math.min(capacityPct, 100)}
              size="lg"
              color={over ? "var(--danger-solid)" : "var(--accent)"}
            />
          </div>
          <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
            {points}/{sprint.capacity}
          </span>
        </div>

        <div style={{ font: "400 10.5px var(--sans)", color: over ? "var(--danger)" : "var(--muted)" }}>
          {over
            ? `${points - sprint.capacity} point${points - sprint.capacity === 1 ? "" : "s"} over capacity`
            : "Capacity from last 3 sprints' velocity"}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className="scroll-y"
        style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, minHeight: 0 }}
      >
        {issues.map((issue, index) => (
          <div
            key={issue.id}
            className="card-tight"
            style={{
              background: index === 0 ? "var(--raised)" : "var(--card)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
            }}
            onClick={() => onOpen(issue.key)}
          >
            <span className="chip-key">{issue.key}</span>
            <span className="truncate grow" style={{ font: "400 12px var(--sans)" }}>
              {issue.title}
            </span>
            <span className="mono" style={{ fontSize: 11, fontWeight: 500 }}>
              {issue.estimate ?? "–"}
            </span>
            <button
              aria-label="Remove from sprint"
              style={{ color: "var(--muted-2)" }}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(issue.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={onAddSelected}
          style={{
            borderRadius: 13,
            border: `2px dashed ${isOver || selectedCount ? "var(--accent)" : "var(--line-dash)"}`,
            background: isOver || selectedCount ? "var(--accent-wash)" : "transparent",
            padding: 18,
            textAlign: "center",
            font: "500 11.5px var(--sans)",
            color: isOver || selectedCount ? "var(--accent-text)" : "var(--muted-2)",
            transition: "all 0.15s ease",
          }}
        >
          {selectedCount
            ? `Drop ${selectedCount} issue${selectedCount === 1 ? "" : "s"} here · +${selectedPoints} pts`
            : "Drag issues here to plan them"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active ? (
          <button className="btn btn-ghost btn-block" onClick={onComplete}>
            Complete sprint
          </button>
        ) : (
          <button className="btn btn-primary btn-block" onClick={onStart} disabled={!issues.length}>
            Start sprint
          </button>
        )}
        <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted-2)", textAlign: "center" }}>
          Unfinished work carries over automatically
        </div>
      </div>
    </aside>
  );
}

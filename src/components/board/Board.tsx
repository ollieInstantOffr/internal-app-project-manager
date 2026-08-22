"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Avatar, AvatarStack, Popover } from "@/components/ui";
import { ViewPicker } from "@/components/views/ViewPicker";
import { NewIssueModal } from "@/components/NewIssueButton";
import { IssueStatus } from "@/lib/types";
import { STATUS_ORDER, STATUS_SHORT, accent } from "@/lib/constants";
import { IssueCard } from "./IssueCard";
import { BulkBar, type BulkPatch } from "./BulkBar";
import type { BoardIssue, BoardProject, BoardEpic, BoardSprint, BoardLabel } from "./types";

const WIP_LIMITS: Partial<Record<IssueStatus, number>> = { IN_PROGRESS: 5, IN_REVIEW: 6 };

type Filters = {
  assignee: string | null;
  epic: string | null;
  label: string | null;
  sprint: string | null;
  text: string;
};

export function Board({
  project,
  initialIssues,
  epics,
  sprints,
  labels,
  activeSprint,
  composeSeed,
}: {
  project: BoardProject;
  initialIssues: BoardIssue[];
  epics: BoardEpic[];
  sprints: BoardSprint[];
  labels: BoardLabel[];
  activeSprint: BoardSprint | null;
  composeSeed?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { members, user } = useShell();

  const [issues, setIssues] = useState(initialIssues);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragging, setDragging] = useState<BoardIssue | null>(null);
  const [composeIn, setComposeIn] = useState<IssueStatus | null>(null);
  const [composeTitle, setComposeTitle] = useState("");
  const [modalSeed, setModalSeed] = useState<string | null>(composeSeed ?? null);
  const [filters, setFilters] = useState<Filters>({
    assignee: null,
    epic: null,
    label: null,
    sprint: null,
    text: "",
  });
  const lastClicked = useRef<string | null>(null);

  const noFilters = !filters.assignee && !filters.epic && !filters.label && !filters.sprint && !filters.text;

  useEffect(() => setIssues(initialIssues), [initialIssues]);

  const visible = useMemo(() => {
    return issues.filter((i) => {
      if (filters.assignee === "none" && i.assignee) return false;
      if (filters.assignee && filters.assignee !== "none" && i.assignee?.id !== filters.assignee)
        return false;
      if (filters.epic === "none" && i.epic) return false;
      if (filters.epic && filters.epic !== "none" && i.epic?.id !== filters.epic) return false;
      if (filters.label && !i.labels.some((l) => l.id === filters.label)) return false;
      if (filters.sprint === "none" && i.sprint) return false;
      if (filters.sprint && filters.sprint !== "none" && i.sprint?.id !== filters.sprint)
        return false;
      if (
        filters.text &&
        !`${i.key} ${i.title}`.toLowerCase().includes(filters.text.toLowerCase())
      )
        return false;
      return true;
    });
  }, [issues, filters]);

  const columns = useMemo(() => {
    const map = new Map<IssueStatus, BoardIssue[]>();
    for (const status of STATUS_ORDER) map.set(status, []);
    for (const issue of visible) map.get(issue.status)?.push(issue);
    for (const list of map.values()) list.sort((a, b) => a.rank - b.rank);
    return map;
  }, [visible]);

  const orderedVisible = useMemo(
    () => STATUS_ORDER.flatMap((s) => columns.get(s) ?? []),
    [columns],
  );

  const selectedIssues = issues.filter((i) => selected.includes(i.id));
  const selectedPoints = selectedIssues.reduce((n, i) => n + (i.estimate ?? 0), 0);

  /* ── selection ─────────────────────────────────────────── */

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
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      if (e.key === "Escape" && selected.length) {
        setSelected([]);
        return;
      }
      if (typing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && selected.length) {
        e.preventDefault();
        setSelected(orderedVisible.map((i) => i.id));
      }
      if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setModalSeed("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected.length, orderedVisible]);

  /* ── mutations ─────────────────────────────────────────── */

  async function applyBulk(patch: BulkPatch) {
    const ids = [...selected];
    const previous = issues;

    setIssues((prev) =>
      prev.map((i) =>
        ids.includes(i.id)
          ? {
              ...i,
              status: patch.status ?? i.status,
              estimate: patch.estimate !== undefined ? patch.estimate : i.estimate,
              assignee:
                patch.assigneeId === undefined
                  ? i.assignee
                  : patch.assigneeId === null
                    ? null
                    : (members.find((m) => m.id === patch.assigneeId) ?? i.assignee),
              epic:
                patch.epicId === undefined
                  ? i.epic
                  : patch.epicId === null
                    ? null
                    : (epics.find((e) => e.id === patch.epicId) ?? i.epic),
              sprint:
                patch.sprintId === undefined
                  ? i.sprint
                  : patch.sprintId === null
                    ? null
                    : (sprints.find((s) => s.id === patch.sprintId) ?? i.sprint),
            }
          : i,
      ),
    );
    setSelected([]);

    try {
      await api.post("/api/issues/bulk", { issueIds: ids, patch });
      toast(`${ids.length} issue${ids.length === 1 ? "" : "s"} updated`, {
        label: "Undo",
        run: async () => {
          setIssues(previous);
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
      router.refresh();
    } catch {
      setIssues(previous);
      toast("Couldn't apply that — nothing changed");
    }
  }

  async function quickCreate(status: IssueStatus, title: string) {
    if (!title.trim()) return;
    setComposeTitle("");
    try {
      await api.post("/api/issues", {
        projectId: project.id,
        title: title.trim(),
        status,
        sprintId: status === IssueStatus.TRIAGE ? null : (activeSprint?.id ?? null),
      });
      router.refresh();
    } catch {
      toast("Couldn't create that issue");
    }
  }

  /* ── drag and drop ─────────────────────────────────────── */

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function statusOf(id: string): IssueStatus | null {
    if (STATUS_ORDER.includes(id as IssueStatus)) return id as IssueStatus;
    return issues.find((i) => i.id === id)?.status ?? null;
  }

  function onDragStart(event: DragStartEvent) {
    setDragging(issues.find((i) => i.id === event.active.id) ?? null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const from = statusOf(String(active.id));
    const to = statusOf(String(over.id));
    if (!from || !to || from === to) return;
    setIssues((prev) =>
      prev.map((i) => (i.id === active.id ? { ...i, status: to } : i)),
    );
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragging(null);
    if (!over) return;

    const issue = issues.find((i) => i.id === active.id);
    if (!issue) return;

    const target = statusOf(String(over.id));
    if (!target) return;

    const column = (columns.get(target) ?? []).filter((i) => i.id !== issue.id);
    const overIndex = column.findIndex((i) => i.id === over.id);
    const before = overIndex === -1 ? column[column.length - 1] : column[overIndex - 1];
    const after = overIndex === -1 ? undefined : column[overIndex];

    const previous = initialIssues;
    try {
      await api.post("/api/issues/move", {
        issueId: issue.id,
        status: target,
        beforeId: before?.id ?? null,
        afterId: after?.id ?? null,
      });
      router.refresh();
    } catch {
      setIssues(previous);
      toast("Couldn't move that issue");
    }
  }

  const filtersOn =
    !!filters.assignee || !!filters.epic || !!filters.label || !!filters.text || !!filters.sprint;

  const boardPeople = useMemo(() => {
    const ids = [...new Set(visible.map((i) => i.assignee?.id).filter(Boolean))] as string[];
    return ids.map((id) => members.find((m) => m.id === id)!).filter(Boolean);
  }, [visible, members]);

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">{project.name}</h1>
          <div className="panel-sub">
            {activeSprint
              ? `${activeSprint.name} · ${visible.length} shown`
              : `${visible.length} issue${visible.length === 1 ? "" : "s"} · no sprint running`}
          </div>
        </div>

        <div className="seg" style={{ marginLeft: 10 }}>
          <button data-active>Board</button>
          <button onClick={() => router.push(`/projects/${project.key}/backlog`)}>List</button>
          <button onClick={() => router.push("/roadmap")}>Timeline</button>
        </div>

        <div className="grow" />

        <ViewPicker
          scope="BOARD"
          projectId={project.id}
          filters={filters}
          isEmpty={noFilters}
          describe={(f) =>
            [
              f.text ? `text "${f.text}"` : null,
              f.assignee ? "assignee" : null,
              f.epic ? "epic" : null,
              f.label ? "label" : null,
              f.sprint ? "sprint" : null,
            ]
              .filter(Boolean)
              .join(" · ")
          }
          onApply={(next) =>
            setFilters(
              next ?? { assignee: null, epic: null, label: null, sprint: null, text: "" },
            )
          }
        />

        <input
          className="input input-sm"
          style={{ width: 170 }}
          placeholder="Filter on this board"
          value={filters.text}
          onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
        />

        <Popover
          align="right"
          width={230}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle}>
              {filtersOn ? "Filters on" : "Filter"}
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="eyebrow menu-label">Sprint</div>
              <button
                className="menu-item"
                data-active={filters.sprint === null}
                onClick={() => setFilters((f) => ({ ...f, sprint: null }))}
              >
                All sprints
              </button>
              <button
                className="menu-item"
                data-active={filters.sprint === "none"}
                onClick={() => setFilters((f) => ({ ...f, sprint: "none" }))}
              >
                Backlog only
              </button>
              {sprints.map((s) => (
                <button
                  key={s.id}
                  className="menu-item"
                  data-active={filters.sprint === s.id}
                  onClick={() => setFilters((f) => ({ ...f, sprint: s.id }))}
                >
                  {s.name}
                </button>
              ))}

              <div className="menu-sep" />
              <div className="eyebrow menu-label">Assignee</div>
              <button
                className="menu-item"
                data-active={filters.assignee === user.id}
                onClick={() => setFilters((f) => ({ ...f, assignee: user.id }))}
              >
                Assigned to me
              </button>
              <button
                className="menu-item"
                data-active={filters.assignee === "none"}
                onClick={() => setFilters((f) => ({ ...f, assignee: "none" }))}
              >
                Unassigned
              </button>

              {epics.length > 0 && (
                <>
                  <div className="menu-sep" />
                  <div className="eyebrow menu-label">Epic</div>
                  {epics.map((e) => (
                    <button
                      key={e.id}
                      className="menu-item"
                      data-active={filters.epic === e.id}
                      onClick={() => setFilters((f) => ({ ...f, epic: e.id }))}
                    >
                      {e.name}
                    </button>
                  ))}
                </>
              )}

              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => {
                  setFilters({ assignee: null, epic: null, label: null, sprint: null, text: "" });
                  close();
                }}
              >
                Clear all filters
              </button>
            </>
          )}
        </Popover>

        {boardPeople.length > 0 && <AvatarStack people={boardPeople} max={3} ring="var(--panel)" />}

        <button className="btn btn-primary" onClick={() => setModalSeed("")}>
          + Issue
        </button>
      </header>

      <DndContext
        id="arc-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="board">
          {STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              issues={columns.get(status) ?? []}
              selected={selected}
              composing={composeIn === status}
              composeTitle={composeTitle}
              onComposeTitle={setComposeTitle}
              onStartCompose={() => {
                setComposeIn(status);
                setComposeTitle("");
              }}
              onCancelCompose={() => setComposeIn(null)}
              onCommitCompose={() => quickCreate(status, composeTitle)}
              onOpen={(key) => router.push(`/issues/${key}`)}
              onSelect={toggleSelect}
            />
          ))}
        </div>

        <DragOverlay>
          {dragging && (
            <div className="issue-card" style={{ width: 264, cursor: "grabbing", opacity: 0.95 }}>
              <div className="issue-card-title">{dragging.title}</div>
              <div className="issue-card-meta">
                <span className="chip-key">{dragging.key}</span>
                <span className="grow" />
                <Avatar name={dragging.assignee?.name} hue={dragging.assignee?.avatarHue} size={22} />
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        <BulkBar
          count={selected.length}
          points={selectedPoints}
          epics={epics}
          sprints={sprints}
          labels={labels}
          onApply={applyBulk}
          onClear={() => setSelected([])}
          onSelectAll={() => setSelected(orderedVisible.map((i) => i.id))}
        />
      </div>

      {modalSeed !== null && (
        <NewIssueModal
          projectId={project.id}
          initialTitle={modalSeed}
          sprintId={activeSprint?.id ?? null}
          onClose={() => setModalSeed(null)}
        />
      )}
    </main>
  );
}

function Column({
  status,
  issues,
  selected,
  composing,
  composeTitle,
  onComposeTitle,
  onStartCompose,
  onCancelCompose,
  onCommitCompose,
  onOpen,
  onSelect,
}: {
  status: IssueStatus;
  issues: BoardIssue[];
  selected: string[];
  composing: boolean;
  composeTitle: string;
  onComposeTitle: (value: string) => void;
  onStartCompose: () => void;
  onCancelCompose: () => void;
  onCommitCompose: () => void;
  onOpen: (key: string) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(false);
  const wip = WIP_LIMITS[status];
  const collapsible = status === IssueStatus.DONE && issues.length > 3;
  const shown = collapsible && !expanded ? issues.slice(0, 3) : issues;
  const overWip = wip !== undefined && status === IssueStatus.IN_PROGRESS && issues.length > wip;

  return (
    <section className="column" ref={setNodeRef} data-over={isOver} aria-label={STATUS_SHORT[status]}>
      <div className="column-head">
        <span className="column-title">{STATUS_SHORT[status]}</span>
        <span className="column-count">{issues.length}</span>
        <span className="grow" />
        {wip !== undefined && (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: overWip ? "var(--danger)" : "var(--faint)",
            }}
            title="Work-in-progress limit"
          >
            wip {wip}
          </span>
        )}
        <button
          onClick={onStartCompose}
          aria-label={`New issue in ${STATUS_SHORT[status]}`}
          style={{ color: "var(--muted-2)", fontSize: 14, lineHeight: 1 }}
        >
          +
        </button>
      </div>

      <div className="column-scroll">
        <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {shown.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              selected={selected.includes(issue.id)}
              onOpen={() => onOpen(issue.key)}
              onSelect={(e) => onSelect(issue.id, e)}
            />
          ))}
        </SortableContext>

        {collapsible && (
          <button
            className="btn btn-quiet btn-sm"
            style={{ alignSelf: "flex-start", fontSize: 11.5 }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : `Show ${issues.length - 3} more`}
          </button>
        )}

        {status === IssueStatus.DONE ? null : composing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onCommitCompose();
            }}
          >
            <input
              className="input input-sm"
              autoFocus
              placeholder="Type a title, press ⏎"
              value={composeTitle}
              onChange={(e) => onComposeTitle(e.target.value)}
              onBlur={() => !composeTitle && onCancelCompose()}
              onKeyDown={(e) => e.key === "Escape" && onCancelCompose()}
            />
          </form>
        ) : (
          <button className="inline-compose" onClick={onStartCompose}>
            Type a title, press ⏎
          </button>
        )}
      </div>
    </section>
  );
}

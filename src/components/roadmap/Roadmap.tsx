"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Modal, Popover } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { accent } from "@/lib/constants";
import { EpicStatus, MilestoneStatus } from "@/lib/types";

export type RoadmapEpic = {
  id: string;
  key: string;
  name: string;
  color: string;
  status: EpicStatus;
  startDate: string | null;
  targetDate: string | null;
  projectKey: string;
  projectName: string;
  issueCount: number;
  progress: number;
};

export type RoadmapMilestone = {
  id: string;
  name: string;
  date: string;
  derivedStatus: MilestoneStatus;
  lateEpics: number;
};

type Zoom = "month" | "quarter";

const DAY = 864e5;

export function Roadmap({
  epics,
  milestones,
  now,
}: {
  epics: RoadmapEpic[];
  milestones: RoadmapMilestone[];
  /** Server clock, so the today line renders identically on both sides. */
  now: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { projects } = useShell();
  const [zoom, setZoom] = useState<Zoom>("quarter");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | "epic" | "milestone">(null);

  const visible = projectFilter ? epics.filter((e) => e.projectKey === projectFilter) : epics;

  // The window always starts at the top of the current period so "today" lands inside it.
  const { start, end, columns } = useMemo(() => {
    const today = new Date(now);
    if (zoom === "quarter") {
      const q = Math.floor(today.getMonth() / 3);
      const startDate = new Date(today.getFullYear(), q * 3, 1);
      const cols = Array.from({ length: 4 }, (_, i) => {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + i * 3, 1);
        return { label: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`, date: d };
      });
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 12, 1);
      return { start: startDate, end: endDate, columns: cols };
    }
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const cols = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      return { label: d.toLocaleDateString("en-US", { month: "short" }), date: d };
    });
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 6, 1);
    return { start: startDate, end: endDate, columns: cols };
  }, [zoom, now]);

  const span = end.getTime() - start.getTime();
  const positionOf = (date: Date) => ((date.getTime() - start.getTime()) / span) * 100;
  const todayPct = Number(Math.max(0, Math.min(100, positionOf(new Date(now)))).toFixed(4));

  function barFor(epic: RoadmapEpic) {
    // An epic with no dates still gets a slot — a dashed, unscheduled one.
    if (!epic.startDate || !epic.targetDate) return null;
    const left = positionOf(new Date(epic.startDate));
    const right = positionOf(new Date(epic.targetDate));
    const clampedLeft = Math.max(0, Math.min(97, left));
    const width = Math.max(4, Math.min(100 - clampedLeft, right - clampedLeft));
    return { left: clampedLeft, width };
  }

  async function reschedule(epic: RoadmapEpic, deltaDays: number, edge: "start" | "end") {
    const body: Record<string, string> = {};
    if (edge === "start" && epic.startDate) {
      body.startDate = new Date(new Date(epic.startDate).getTime() + deltaDays * DAY).toISOString();
    }
    if (edge === "end" && epic.targetDate) {
      body.targetDate = new Date(new Date(epic.targetDate).getTime() + deltaDays * DAY).toISOString();
    }
    await api.patch(`/api/epics/${epic.id}`, body).catch(() => toast("Couldn't reschedule that"));
    router.refresh();
  }

  const gridLines =
    zoom === "quarter"
      ? "linear-gradient(to right,transparent 0 calc(25% - 1px),var(--line-soft) calc(25% - 1px) 25%,transparent 25% calc(50% - 1px),var(--line-soft) calc(50% - 1px) 50%,transparent 50% calc(75% - 1px),var(--line-soft) calc(75% - 1px) 75%,transparent 75%)"
      : "repeating-linear-gradient(to right,transparent 0 calc(16.666% - 1px),var(--line-soft) calc(16.666% - 1px) 16.666%)";

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Roadmap</h1>
          <div className="panel-sub">
            {visible.length} epic{visible.length === 1 ? "" : "s"} across{" "}
            {new Set(visible.map((e) => e.projectKey)).size} project
            {new Set(visible.map((e) => e.projectKey)).size === 1 ? "" : "s"}
          </div>
        </div>

        <div className="seg" style={{ marginLeft: 10 }}>
          <button data-active={zoom === "month"} onClick={() => setZoom("month")}>
            Month
          </button>
          <button data-active={zoom === "quarter"} onClick={() => setZoom("quarter")}>
            Quarter
          </button>
        </div>

        <div className="grow" />

        <Popover
          align="right"
          width={200}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle}>
              {projectFilter
                ? (projects.find((p) => p.key === projectFilter)?.name ?? projectFilter)
                : "All projects"}{" "}
              ⌄
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                className="menu-item"
                data-active={!projectFilter}
                onClick={() => {
                  setProjectFilter(null);
                  close();
                }}
              >
                All projects
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="menu-item"
                  data-active={projectFilter === p.key}
                  onClick={() => {
                    setProjectFilter(p.key);
                    close();
                  }}
                >
                  {p.name}
                </button>
              ))}
            </>
          )}
        </Popover>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0, padding: "0 22px 18px" }}>
        <div style={{ width: 236, flex: "none", display: "flex", flexDirection: "column" }}>
          <div className="eyebrow" style={{ height: 34, display: "flex", alignItems: "center" }}>
            Epic
          </div>
          <div className="scroll-y" style={{ flex: 1 }}>
            {visible.map((epic) => (
              <button
                key={epic.id}
                style={{
                  height: 58,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 2,
                  textAlign: "left",
                }}
                onClick={() => router.push(`/projects/${epic.projectKey}/epics?epic=${epic.id}`)}
              >
                <span className="truncate" style={{ font: "600 12.5px var(--display)" }}>
                  {epic.name}
                </span>
                <span className="truncate" style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
                  {epic.projectName} · {epic.issueCount} issue{epic.issueCount === 1 ? "" : "s"} ·{" "}
                  {epic.status === EpicStatus.PLANNED && epic.progress === 0
                    ? "not started"
                    : `${epic.progress}%`}
                </span>
              </button>
            ))}
            <button
              style={{ height: 44, font: "400 11.5px var(--sans)", color: "var(--muted-2)" }}
              onClick={() => setCreating("epic")}
            >
              + New epic
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ height: 34, display: "flex" }}>
            {columns.map((col) => (
              <div
                key={col.label}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "500 9.5px var(--mono)",
                  color: "var(--muted-2)",
                }}
              >
                {col.label}
              </div>
            ))}
          </div>

          <div className="timeline-grid scroll-y" style={{ backgroundImage: gridLines }}>
            <div className="today-line" style={{ left: `${todayPct}%` }} />
            <div
              style={{
                position: "absolute",
                left: `${todayPct}%`,
                top: 4,
                font: "600 8.5px var(--mono)",
                color: "var(--accent)",
                paddingLeft: 6,
                zIndex: 2,
              }}
            >
              TODAY
            </div>

            {milestones.map((m) => {
              const left = positionOf(new Date(m.date));
              if (left < 0 || left > 100) return null;
              return (
                <div
                  key={m.id}
                  title={`${m.name} · ${new Date(m.date).toLocaleDateString()}`}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                >
                  <span className="milestone-mark" style={{ marginTop: 12 }} />
                  <div style={{ flex: 1, width: 1, background: "var(--line-strong)", opacity: 0.6 }} />
                </div>
              );
            })}

            {visible.map((epic) => {
              const bar = barFor(epic);
              const tone = accent(epic.color);
              const done = epic.progress >= 100;

              return (
                <div key={epic.id} className="timeline-row">
                  {bar ? (
                    <div
                      className="timeline-bar"
                      style={{
                        left: `${bar.left}%`,
                        width: `${bar.width}%`,
                        top: 16,
                        background: done ? tone.soft : epic.progress > 0 ? tone.base : tone.soft,
                        color: epic.progress > 0 && !done ? tone.fg : "var(--text)",
                      }}
                      onClick={() => router.push(`/projects/${epic.projectKey}/epics?epic=${epic.id}`)}
                      title={`${epic.name} — drag the edges to reschedule`}
                    >
                      <button
                        aria-label="Pull start earlier"
                        style={{ opacity: 0.6, fontSize: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          reschedule(epic, -7, "start");
                        }}
                      >
                        ‹
                      </button>
                      <span className="truncate grow">{epic.name}</span>
                      {epic.progress > 0 && (
                        <span className="mono" style={{ fontSize: 9.5, opacity: 0.7 }}>
                          {epic.progress}%
                        </span>
                      )}
                      <button
                        aria-label="Push target later"
                        style={{ opacity: 0.6, fontSize: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          reschedule(epic, 7, "end");
                        }}
                      >
                        ›
                      </button>
                    </div>
                  ) : (
                    <div
                      className="timeline-bar"
                      style={{
                        left: "66%",
                        width: "22%",
                        top: 16,
                        border: "1.5px dashed var(--line-strong)",
                        color: "var(--muted)",
                        background: "transparent",
                      }}
                      onClick={() => router.push(`/projects/${epic.projectKey}/epics?epic=${epic.id}`)}
                      title="No dates yet — open the epic to schedule it"
                    >
                      <span className="truncate">{epic.name}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="empty">No epics yet. Group a few issues and they&rsquo;ll appear here.</div>
            )}
          </div>

          <div style={{ height: 104, flex: "none", paddingTop: 14, display: "flex", gap: 14 }}>
            {milestones.map((m) => (
              <div
                key={m.id}
                className="card"
                style={{ flex: 1, borderRadius: 14, padding: 13, display: "flex", gap: 11 }}
              >
                <span
                  className="milestone-mark"
                  style={{
                    marginTop: 4,
                    background:
                      m.derivedStatus === MilestoneStatus.AT_RISK ? "var(--danger)" : "transparent",
                    border:
                      m.derivedStatus === MilestoneStatus.AT_RISK
                        ? "none"
                        : "1.5px solid var(--muted)",
                  }}
                />
                <div>
                  <div style={{ font: "600 12px var(--display)" }}>
                    {m.name} ·{" "}
                    {new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div
                    style={{
                      font: "400 10.5px var(--sans)",
                      marginTop: 3,
                      color:
                        m.derivedStatus === MilestoneStatus.AT_RISK
                          ? "var(--danger)"
                          : "var(--success)",
                    }}
                  >
                    {m.derivedStatus === MilestoneStatus.AT_RISK
                      ? `At risk — ${m.lateEpics} epic${m.lateEpics === 1 ? "" : "s"} land after it`
                      : "On track"}
                  </div>
                </div>
              </div>
            ))}

            <button
              className="card-dashed"
              style={{ flex: 1, borderRadius: 14, display: "flex", alignItems: "center", fontSize: 11 }}
              onClick={() => setCreating("milestone")}
            >
              + Add milestone
            </button>
          </div>
        </div>
      </div>

      {creating === "epic" && <NewEpicModal onClose={() => setCreating(null)} />}
      {creating === "milestone" && <NewMilestoneModal onClose={() => setCreating(null)} />}
    </main>
  );
}

function NewEpicModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { projects } = useShell();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New epic" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/epics", {
              projectId,
              name: name.trim(),
              startDate: startDate || null,
              targetDate: targetDate || null,
            });
            onClose();
            router.refresh();
          } catch {
            toast("Couldn't create that epic");
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor="epic-name">
            Name
          </label>
          <input
            id="epic-name"
            className="input"
            autoFocus
            required
            placeholder="Auth hardening"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="epic-project">
            Project
          </label>
          <select
            id="epic-project"
            className="select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div className="field grow">
            <label className="label" htmlFor="epic-start">
              Start
            </label>
            <input
              id="epic-start"
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field grow">
            <label className="label" htmlFor="epic-target">
              Target
            </label>
            <input
              id="epic-target"
              className="input"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || !name.trim()}>
            {busy ? <span className="spin" /> : "Create epic"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewMilestoneModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New milestone" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/milestones", { name: name.trim(), date });
            onClose();
            router.refresh();
          } catch {
            toast("Couldn't create that milestone");
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor="ms-name">
            Name
          </label>
          <input
            id="ms-name"
            className="input"
            autoFocus
            required
            placeholder="v2.0 launch"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="ms-date">
            Date
          </label>
          <input
            id="ms-date"
            className="input"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--faint)" }}>
          Status is derived — a milestone goes at risk when an epic is due after it.
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || !name.trim() || !date}>
            {busy ? <span className="spin" /> : "Add milestone"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

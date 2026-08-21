"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Avatar, Bar, Editable, Empty, Modal, Popover } from "@/components/ui";
import { NewIssueModal } from "@/components/NewIssueButton";
import { DateField } from "@/components/DateField";
import { EpicStatus, IssueStatus } from "@/lib/types";
import { ACCENT_NAMES, STATUS_LABEL, accent } from "@/lib/constants";
import type { BoardIssue, BoardProject } from "@/components/board/types";

export type EpicRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  status: EpicStatus;
  startDate: string | null;
  targetDate: string | null;
  issues: BoardIssue[];
};

const STATUS_LABELS: Record<EpicStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export function Epics({
  project,
  epics,
  unassigned,
  selectedId,
}: {
  project: BoardProject;
  epics: EpicRow[];
  unassigned: BoardIssue[];
  selectedId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [composeIn, setComposeIn] = useState<string | null>(null);

  const selected = epics.find((e) => e.id === selectedId) ?? null;

  async function patch(epic: EpicRow, body: Record<string, unknown>) {
    try {
      await api.patch(`/api/epics/${epic.id}`, body);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that");
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Epics</h1>
          <div className="panel-sub">
            {epics.length} epic{epics.length === 1 ? "" : "s"} in {project.name}
            {unassigned.length
              ? ` · ${unassigned.length} issue${unassigned.length === 1 ? "" : "s"} ungrouped`
              : ""}
          </div>
        </div>
        <div className="grow" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New epic
        </button>
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px", gap: 12 }}>
        {epics.length === 0 && (
          <Empty
            title="No epics yet"
            hint="An epic is just a name over a group of issues. Create one and drag work into it."
          />
        )}

        {epics.map((epic) => {
          const done = epic.issues.filter((i) => i.status === IssueStatus.DONE).length;
          const points = epic.issues.reduce((n, i) => n + (i.estimate ?? 0), 0);
          const progress = epic.issues.length ? Math.round((done / epic.issues.length) * 100) : 0;
          const isOpen = selected?.id === epic.id;
          const tone = accent(epic.color);

          return (
            <section
              key={epic.id}
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="row-flex" style={{ gap: 10 }}>
                <Popover
                  width={160}
                  trigger={({ toggle }) => (
                    <button
                      aria-label="Epic colour"
                      style={{ width: 12, height: 12, borderRadius: 4, background: tone.base, flex: "none" }}
                      onClick={toggle}
                    />
                  )}
                >
                  {(close) =>
                    ACCENT_NAMES.map((name) => (
                      <button
                        key={name}
                        className="menu-item"
                        onClick={() => {
                          patch(epic, { color: name });
                          close();
                        }}
                      >
                        <span
                          style={{ width: 12, height: 12, borderRadius: 4, background: accent(name).base }}
                        />
                        {name}
                      </button>
                    ))
                  }
                </Popover>

                <span className="chip-key">{epic.key}</span>

                <Editable
                  value={epic.name}
                  onCommit={(name) => patch(epic, { name })}
                  style={{ font: "600 14px var(--display)" }}
                />

                <Popover
                  width={170}
                  trigger={({ toggle }) => (
                    <button className="pill" onClick={toggle} style={{ fontSize: 10.5 }}>
                      {STATUS_LABELS[epic.status]}
                    </button>
                  )}
                >
                  {(close) =>
                    (Object.keys(STATUS_LABELS) as EpicStatus[]).map((s) => (
                      <button
                        key={s}
                        className="menu-item"
                        data-active={epic.status === s}
                        onClick={() => {
                          patch(epic, { status: s });
                          close();
                        }}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))
                  }
                </Popover>

                <span className="grow" />

                <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  {epic.issues.length} issue{epic.issues.length === 1 ? "" : "s"} · {points} pts
                </span>

                <div style={{ width: 90 }}>
                  <Bar value={progress} size="sm" color={tone.base} />
                </div>

                <span className="mono" style={{ fontSize: 10.5, width: 34, textAlign: "right" }}>
                  {progress}%
                </span>

                <Link
                  href={
                    isOpen
                      ? `/projects/${project.key}/epics`
                      : `/projects/${project.key}/epics?epic=${epic.id}`
                  }
                  className="btn btn-quiet btn-sm"
                >
                  {isOpen ? "Collapse" : "Open"}
                </Link>
              </div>

              <div className="row-flex" style={{ gap: 10, flexWrap: "wrap" }}>
                <DateRow
                  label="Start"
                  value={epic.startDate}
                  onChange={(value) => patch(epic, { startDate: value })}
                />
                <DateRow
                  label="Target"
                  value={epic.targetDate}
                  onChange={(value) => patch(epic, { targetDate: value })}
                />
                <Editable
                  value={epic.description ?? ""}
                  multiline
                  onCommit={(description) => patch(epic, { description })}
                  placeholder="Add a one-line goal…"
                  style={{ font: "400 11.5px var(--sans)", color: "var(--muted)", flex: 1, minWidth: 200 }}
                />
              </div>

              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {epic.issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="row"
                      style={{ borderRadius: 8 }}
                      onClick={() => router.push(`/issues/${issue.key}`)}
                    >
                      <span className="chip-key" style={{ width: 60 }}>
                        {issue.key}
                      </span>
                      <span className="row-title truncate">{issue.title}</span>
                      <span className="pill" style={{ fontSize: 10 }}>
                        {STATUS_LABEL[issue.status]}
                      </span>
                      <span className="mono" style={{ fontSize: 10.5, width: 20, textAlign: "right" }}>
                        {issue.estimate ?? "–"}
                      </span>
                      <Avatar name={issue.assignee?.name} hue={issue.assignee?.avatarHue} size={22} />
                    </div>
                  ))}

                  <button
                    className="inline-compose"
                    style={{ marginTop: 6 }}
                    onClick={() => setComposeIn(epic.id)}
                  >
                    + New issue in this epic
                  </button>
                </div>
              )}
            </section>
          );
        })}

        {unassigned.length > 0 && (
          <section className="card-dashed" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ font: "600 12px var(--display)", color: "var(--text-2)" }}>
              {unassigned.length} issue{unassigned.length === 1 ? "" : "s"} without an epic
            </div>
            <div style={{ lineHeight: 1.6 }}>
              Group them from the backlog — select rows, then use the Epic action.
            </div>
            <Link
              href={`/projects/${project.key}/backlog`}
              className="link-accent"
              style={{ fontSize: 11.5 }}
            >
              Open the backlog →
            </Link>
          </section>
        )}
      </div>

      {creating && <NewEpicModal projectId={project.id} onClose={() => setCreating(false)} />}
      {composeIn && (
        <NewIssueModal projectId={project.id} epicId={composeIn} onClose={() => setComposeIn(null)} />
      )}
    </main>
  );
}

function DateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        font: "400 10.5px var(--sans)",
        color: "var(--muted-2)",
      }}
    >
      {label}
      <DateField
        className="input input-sm date-inline"
        align="right"
        stretch={false}
        value={value ? value.slice(0, 10) : ""}
        onChange={(next) => onChange(next || null)}
        placeholder="—"
        ariaLabel={label}
      />
    </label>
  );
}

function NewEpicModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New epic" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/epics", { projectId, name: name.trim() });
            onClose();
            router.refresh();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Couldn't create that epic");
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor="new-epic-name">
            Name
          </label>
          <input
            id="new-epic-name"
            className="input"
            autoFocus
            required
            placeholder="Auth hardening"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
            Dates and a goal are optional — add them inline afterwards.
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

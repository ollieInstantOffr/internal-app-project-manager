"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useShell } from "@/components/shell/context";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { IssueStatus, Priority } from "@/lib/types";
import { STATUS_LABEL, PRIORITY_LABEL, STATUS_ORDER, PRIORITY_ORDER } from "@/lib/constants";

export function NewIssueButton({
  projectId,
  label = "New issue",
  className = "btn btn-primary",
  sprintId,
  epicId,
  status,
  onCreated,
}: {
  projectId?: string;
  label?: string;
  className?: string;
  sprintId?: string | null;
  epicId?: string | null;
  status?: IssueStatus;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <NewIssueModal
          projectId={projectId}
          sprintId={sprintId}
          epicId={epicId}
          status={status}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}

export function NewIssueModal({
  projectId,
  sprintId,
  epicId,
  status: initialStatus,
  initialTitle = "",
  onClose,
  onCreated,
}: {
  projectId?: string;
  sprintId?: string | null;
  epicId?: string | null;
  status?: IssueStatus;
  initialTitle?: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const { projects, members, user } = useShell();
  const { toast } = useToast();

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [project, setProject] = useState(projectId ?? projects[0]?.id ?? "");
  const [status, setStatus] = useState<IssueStatus>(initialStatus ?? IssueStatus.TRIAGE);
  const [priority, setPriority] = useState<Priority>(Priority.NONE);
  const [assigneeId, setAssigneeId] = useState("");
  const [estimate, setEstimate] = useState("");
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ issue: { key: string } }>("/api/issues", {
        projectId: project,
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        assigneeId: assigneeId || null,
        estimate: estimate ? Number(estimate) : null,
        sprintId: sprintId ?? null,
        epicId: epicId ?? null,
      });
      onClose();
      onCreated?.();
      router.refresh();
      toast(`${res.issue.key} created`, {
        label: "Open",
        run: () => router.push(`/issues/${res.issue.key}`),
      });
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : "Couldn't create that");
      setBusy(false);
    }
  }

  return (
    <Modal title="New issue" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div className="form-error">{error}</div>}

        <div className="field">
          <label className="label" htmlFor="ni-title">
            Title
          </label>
          <input
            id="ni-title"
            className="input"
            autoFocus
            required
            placeholder="Refactor auth middleware"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
            A title is all an issue needs — everything else is inline-editable later.
          </div>
        </div>

        {!projectId && projects.length > 1 && (
          <div className="field">
            <label className="label" htmlFor="ni-project">
              Project
            </label>
            <select
              id="ni-project"
              className="select"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {more ? (
          <>
            <div className="field">
              <label className="label" htmlFor="ni-desc">
                Description
              </label>
              <textarea
                id="ni-desc"
                className="textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div className="field grow">
                <label className="label" htmlFor="ni-status">
                  Status
                </label>
                <select
                  id="ni-status"
                  className="select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as IssueStatus)}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field grow">
                <label className="label" htmlFor="ni-priority">
                  Priority
                </label>
                <select
                  id="ni-priority"
                  className="select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div className="field grow">
                <label className="label" htmlFor="ni-assignee">
                  Assignee
                </label>
                <select
                  id="ni-assignee"
                  className="select"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.id === user.id ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: 120 }}>
                <label className="label" htmlFor="ni-estimate">
                  Points
                </label>
                <input
                  id="ni-estimate"
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setMore(true)}
          >
            + Add details
          </button>
        )}

        <div style={{ display: "flex", gap: 9, marginTop: 2 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || !title.trim()}>
            {busy ? <span className="spin" /> : "Create issue"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

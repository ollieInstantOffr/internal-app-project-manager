"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Avatar, Popover } from "@/components/ui";
import { formatBytes, prettyJson, type AssertionResult, type Method } from "./types";
import { CodeEditor } from "./CodeEditor";

export type RunResult = {
  id: string;
  name: string;
  method: Method;
  url: string;
  requestBody: string | null;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  sizeBytes: number;
  responseBody: string | null;
  error: string | null;
  assertions: AssertionResult[] | null;
  passedCount: number;
  failedCount: number;
  issue: { key: string; title: string } | null;
};

export type RunDetail = {
  id: string;
  passed: number;
  failed: number;
  p95Ms: number;
  requestCount: number;
  createdAt: string;
  projectId: string;
  environmentId: string | null;
  environment: { name: string; kind: string; prNumber: number | null } | null;
  collection: { id: string; name: string } | null;
  triggeredBy: { name: string; avatarHue: number } | null;
  results: RunResult[];
};

export function RunView({
  run,
  previous,
  projectKey,
  epics,
  sprints,
  labels,
  openResultId,
}: {
  run: RunDetail;
  previous: { failed: number; environmentName: string | null } | null;
  projectKey: string;
  epics: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  openResultId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const firstFailure = run.results.find((r) => r.failedCount > 0 || r.error);
  const [selectedId, setSelectedId] = useState<string | null>(
    openResultId ?? firstFailure?.id ?? null,
  );
  const [rerunning, setRerunning] = useState(false);

  const selected = run.results.find((r) => r.id === selectedId) ?? null;
  const deltaVsPrevious = previous ? run.failed - previous.failed : null;

  async function rerun() {
    if (!run.environmentId) {
      toast("This run has no environment left — pick one in the console");
      return;
    }
    setRerunning(true);
    try {
      const res = await api.post<{ runId: string }>("/api/api-console/run", {
        projectId: run.projectId,
        environmentId: run.environmentId,
        collectionId: run.collection?.id ?? null,
      });
      router.push(`/projects/${projectKey}/api/runs/${res.runId}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't re-run that collection");
      setRerunning(false);
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm" style={{ padding: "0 20px" }}>
        <div>
          <h1 style={{ font: "600 15px var(--display)" }}>
            Run all · {run.collection?.name ?? "All collections"}
          </h1>
          <div className="panel-sub">
            {run.requestCount} request{run.requestCount === 1 ? "" : "s"} ·{" "}
            {run.results.reduce((n, r) => n + r.passedCount + r.failedCount, 0)} assertions
          </div>
        </div>

        <div className="grow" />

        {run.environment && (
          <span
            className="btn"
            style={
              run.environment.kind === "PR_PREVIEW"
                ? {
                    background: "oklch(0.31 0.03 128)",
                    boxShadow: "0 0 0 1.5px var(--accent)",
                    fontWeight: 600,
                    cursor: "default",
                  }
                : { background: "var(--raised)", fontWeight: 500, cursor: "default" }
            }
          >
            <span
              className="dot"
              style={{
                background:
                  run.environment.kind === "PR_PREVIEW" ? "var(--accent)" : "var(--amber)",
              }}
            />
            {run.environment.kind === "PR_PREVIEW" && run.environment.prNumber
              ? `PR #${run.environment.prNumber} preview`
              : run.environment.name}
          </span>
        )}

        <Link className="btn btn-ghost" href={`/projects/${projectKey}/api`}>
          Console
        </Link>
        <button className="btn btn-white" onClick={rerun} disabled={rerunning}>
          {rerunning ? <span className="spin" /> : "Re-run"}
        </button>
      </header>

      <div className="two-col" style={{ padding: "0 20px 20px", gap: 16 }}>
        <div style={{ flex: 1.25, display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
          <div className="stats" style={{ gap: 11 }}>
            <div className="stat" style={{ padding: 14 }}>
              <div className="stat-label">Passed</div>
              <div className="stat-value" style={{ fontSize: 24, color: "var(--accent)" }}>
                {run.passed}
              </div>
            </div>
            <div
              className="stat"
              style={{ padding: 14, background: run.failed ? "oklch(0.28 0.06 25)" : undefined }}
            >
              <div className="stat-label" style={{ color: run.failed ? "oklch(0.9 0.04 25)" : undefined }}>
                Failed
              </div>
              <div
                className="stat-value"
                style={{ fontSize: 24, color: run.failed ? "oklch(0.85 0.13 25)" : undefined }}
              >
                {run.failed}
              </div>
            </div>
            <div className="stat" style={{ padding: 14 }}>
              <div className="stat-label">p95 latency</div>
              <div className="stat-value" style={{ fontSize: 24 }}>
                {run.p95Ms}
                <span style={{ fontSize: 13 }}>ms</span>
              </div>
            </div>
            <div className="stat" style={{ padding: 14 }}>
              <div className="stat-label">vs {previous?.environmentName ?? "previous"}</div>
              <div
                className="stat-value"
                style={{
                  fontSize: 24,
                  color:
                    deltaVsPrevious === null
                      ? "var(--muted)"
                      : deltaVsPrevious > 0
                        ? "var(--danger)"
                        : deltaVsPrevious < 0
                          ? "var(--success)"
                          : undefined,
                }}
              >
                {deltaVsPrevious === null
                  ? "—"
                  : deltaVsPrevious > 0
                    ? `+${deltaVsPrevious}`
                    : deltaVsPrevious}
              </div>
            </div>
          </div>

          <div className="run-table">
            <div className="run-head">
              <div style={{ width: 34 }}>M</div>
              <div style={{ flex: 1 }}>Request</div>
              <div style={{ width: 66 }}>Status</div>
              <div style={{ width: 60 }}>Time</div>
              <div style={{ width: 96 }}>Assertions</div>
            </div>

            <div className="scroll-y" style={{ flex: 1 }}>
              {run.results.map((result) => {
                const failed = result.failedCount > 0 || !!result.error;
                const total = result.passedCount + result.failedCount;
                return (
                  <button
                    key={result.id}
                    className="run-row"
                    data-failed={failed}
                    onClick={() => setSelectedId(result.id)}
                  >
                    <div
                      className="mono"
                      style={{
                        width: 34,
                        fontSize: 8.5,
                        fontWeight: 700,
                        color: failed ? "oklch(0.9 0.04 25)" : methodTone(result.method),
                      }}
                    >
                      {result.method === "DELETE" ? "DEL" : result.method}
                    </div>
                    <div className="truncate" style={{ flex: 1 }}>
                      {result.name}
                      {failed && result.assertions?.find((a) => !a.ok) && (
                        <span style={{ color: "oklch(0.9 0.04 25)" }}>
                          {" "}
                          — {result.assertions.find((a) => !a.ok)!.source}
                        </span>
                      )}
                    </div>
                    <div
                      className="mono"
                      style={{
                        width: 66,
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: failed ? "oklch(0.85 0.13 25)" : "var(--success)",
                      }}
                    >
                      {result.status ?? "ERR"}
                    </div>
                    <div
                      className="mono"
                      style={{
                        width: 60,
                        fontSize: 10.5,
                        color: failed ? "oklch(0.9 0.03 25)" : "var(--text-3)",
                      }}
                    >
                      {result.durationMs}ms
                    </div>
                    <div
                      className="mono"
                      style={{
                        width: 96,
                        fontSize: 10.5,
                        color: failed ? "oklch(0.85 0.13 25)" : "var(--success)",
                      }}
                    >
                      {result.passedCount}/{total}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                marginTop: "auto",
                padding: "12px 15px",
                borderTop: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flex: "none",
              }}
            >
              <div className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                {run.environment?.kind === "PR_PREVIEW"
                  ? "Runs on every push to this PR"
                  : `Run ${new Date(run.createdAt).toLocaleString()}`}
              </div>
              <div className="grow" />
              {run.triggeredBy && (
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Avatar name={run.triggeredBy.name} hue={run.triggeredBy.avatarHue} size={18} />
                  <span style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
                    {run.triggeredBy.name}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {selected && (
          <IssuePanel
            key={selected.id}
            result={selected}
            projectKey={projectKey}
            environmentName={run.environment?.name ?? null}
            epics={epics}
            sprints={sprints}
            labels={labels}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </main>
  );
}

function IssuePanel({
  result,
  projectKey,
  environmentName,
  epics,
  sprints,
  labels,
  onClose,
}: {
  result: RunResult;
  projectKey: string;
  environmentName: string | null;
  epics: { id: string; name: string }[];
  sprints: { id: string; name: string }[];
  labels: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { members, user } = useShell();

  const failures = (result.assertions ?? []).filter((a) => !a.ok);
  const failed = failures.length > 0 || !!result.error;

  const [title, setTitle] = useState(
    failures[0]
      ? `${result.method} ${pathOf(result.url)} — ${failures[0].source}`
      : `${result.method} ${pathOf(result.url)} failed`,
  );
  const [epicId, setEpicId] = useState<string | null>(epics[0]?.id ?? null);
  const [sprintId, setSprintId] = useState<string | null>(sprints[0]?.id ?? null);
  const [assigneeId, setAssigneeId] = useState<string | null>(user.id);
  const [busy, setBusy] = useState(false);

  const bugLabel = labels.find((l) => l.name.toLowerCase() === "bug");

  async function create() {
    setBusy(true);
    try {
      const res = await api.post<{ issue: { key: string } }>(
        `/api/api-console/results/${result.id}/issue`,
        {
          title,
          epicId,
          sprintId,
          assigneeId,
          labelIds: bugLabel ? [bugLabel.id] : [],
        },
      );
      toast(`${res.issue.key} created`, {
        label: "Open",
        run: () => router.push(`/issues/${res.issue.key}`),
      });
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't create that issue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="card"
      style={{
        width: 380,
        flex: "none",
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minWidth: 0,
      }}
    >
      <div className="row-flex" style={{ gap: 9 }}>
        <div style={{ font: "600 14px var(--display)" }}>
          {result.issue ? "Issue created" : failed ? "New issue from failure" : "Request passed"}
        </div>
        <button
          style={{ marginLeft: "auto", color: "var(--muted-2)" }}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {result.issue ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ font: "400 12px/1.6 var(--sans)", color: "var(--muted)" }}>
            This failure is already tracked.
          </div>
          <Link className="btn btn-primary btn-block" href={`/issues/${result.issue.key}`}>
            Open {result.issue.key}
          </Link>
        </div>
      ) : !failed ? (
        <div style={{ font: "400 12px/1.7 var(--sans)", color: "var(--muted)" }}>
          {result.passedCount} assertion{result.passedCount === 1 ? "" : "s"} passed in{" "}
          {result.durationMs}ms. Nothing to file.
        </div>
      ) : (
        <>
          <div className="field">
            <span className="eyebrow">Title · prefilled</span>
            <textarea
              className="textarea"
              style={{
                minHeight: 60,
                borderColor: "var(--accent)",
                background: "var(--hover)",
                fontSize: 12.5,
              }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="pill pill-danger">bug</span>
            <span className="pill">api</span>
            {epics.length > 0 && (
              <Popover
                width={220}
                trigger={({ toggle }) => (
                  <button className="pill" onClick={toggle}>
                    Epic · {epics.find((e) => e.id === epicId)?.name ?? "none"}
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setEpicId(null);
                        close();
                      }}
                    >
                      No epic
                    </button>
                    {epics.map((e) => (
                      <button
                        key={e.id}
                        className="menu-item"
                        data-active={epicId === e.id}
                        onClick={() => {
                          setEpicId(e.id);
                          close();
                        }}
                      >
                        {e.name}
                      </button>
                    ))}
                  </>
                )}
              </Popover>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <Row label="Assignee">
              <Popover
                width={220}
                trigger={({ toggle }) => (
                  <button className="row-flex" style={{ gap: 8 }} onClick={toggle}>
                    <Avatar
                      name={members.find((m) => m.id === assigneeId)?.name}
                      hue={members.find((m) => m.id === assigneeId)?.avatarHue}
                      size={22}
                    />
                    <span style={{ font: "500 11.5px var(--sans)" }}>
                      {members.find((m) => m.id === assigneeId)?.name ?? "Unassigned"}
                    </span>
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setAssigneeId(null);
                        close();
                      }}
                    >
                      Unassigned
                    </button>
                    {members.map((m) => (
                      <button
                        key={m.id}
                        className="menu-item"
                        onClick={() => {
                          setAssigneeId(m.id);
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
            </Row>

            <Row label="Sprint">
              <Popover
                width={200}
                trigger={({ toggle }) => (
                  <button style={{ font: "500 11.5px var(--sans)" }} onClick={toggle}>
                    {sprints.find((s) => s.id === sprintId)?.name ?? "Backlog"}
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <button
                      className="menu-item"
                      onClick={() => {
                        setSprintId(null);
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
                          setSprintId(s.id);
                          close();
                        }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </>
                )}
              </Popover>
            </Row>
          </div>

          <div
            style={{
              borderRadius: 12,
              background: "oklch(0.19 0.01 285)",
              border: "1px solid var(--line-strong)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <div className="eyebrow">Attached · read-only</div>
            <div className="mono" style={{ font: "400 10.5px/1.7 var(--mono)", color: "var(--text-2)" }}>
              <span style={{ color: "var(--accent)" }}>{result.method}</span> {pathOf(result.url)}
              <br />
              <span style={{ color: "var(--muted)" }}>env</span> {environmentName ?? "—"}
              <br />
              <span style={{ color: "var(--muted)" }}>expect</span>{" "}
              {failures[0]?.source ?? "success"} ·{" "}
              <span style={{ color: "oklch(0.85 0.13 25)" }}>
                {failures[0]?.detail ?? result.error}
              </span>
              <br />
              <span style={{ color: "var(--muted)" }}>size</span> {formatBytes(result.sizeBytes)} ·{" "}
              {result.durationMs}ms
            </div>
            <div style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
              Full request + response saved with the issue — reproducible with one click.
            </div>
          </div>

          <details style={{ marginTop: -4 }}>
            <summary
              style={{ font: "500 11px var(--sans)", color: "var(--muted)", cursor: "pointer" }}
            >
              Response body
            </summary>
            <div style={{ marginTop: 8, height: 160, display: "flex" }}>
              <CodeEditor
                readOnly
                lineNumbers={false}
                value={prettyJson(result.responseBody) || result.error || "(empty)"}
              />
            </div>
          </details>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 9 }}>
            <button className="btn btn-primary btn-block" onClick={create} disabled={busy}>
              {busy ? <span className="spin" /> : "Create issue"}
            </button>
            <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted-2)", textAlign: "center" }}>
              Lands in Triage on the {projectKey} board
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 70, flex: "none", font: "400 10.5px var(--sans)", color: "var(--muted-2)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function methodTone(method: Method) {
  if (method === "GET") return "var(--success)";
  if (method === "POST") return "var(--accent)";
  if (method === "PUT" || method === "PATCH") return "var(--amber)";
  if (method === "DELETE") return "oklch(0.72 0.09 25)";
  return "var(--muted)";
}

function pathOf(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

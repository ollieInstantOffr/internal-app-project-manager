"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Modal, Popover, Empty } from "@/components/ui";
import { CodeEditor } from "./CodeEditor";
import { CollectionsPanel } from "./CollectionsPanel";
import {
  formatBytes,
  prettyJson,
  statusClass,
  type ConsoleState,
  type ConsoleRequest,
  type Method,
  type SendResult,
} from "./types";

const METHODS: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const REQUEST_TABS = ["Body", "Headers", "Params", "Tests"] as const;
const RESPONSE_TABS = ["Body", "Headers", "Timing"] as const;

type Draft = {
  name: string;
  method: Method;
  path: string;
  body: string;
  headers: string;
  params: string;
  assertions: string;
};

export function ApiConsole({ initial }: { initial: ConsoleState }) {
  const router = useRouter();
  const { toast } = useToast();

  const [state, setState] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(
    initial.collections.flatMap((c) => c.requests)[0]?.id ?? null,
  );
  const [envId, setEnvId] = useState(initial.environments[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<(typeof REQUEST_TABS)[number]>("Body");
  const [responseTab, setResponseTab] = useState<(typeof RESPONSE_TABS)[number]>("Body");
  const [result, setResult] = useState<SendResult | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newEnv, setNewEnv] = useState(false);

  useEffect(() => setState(initial), [initial]);

  const allRequests = useMemo(
    () => state.collections.flatMap((c) => c.requests),
    [state.collections],
  );
  const active = allRequests.find((r) => r.id === activeId) ?? null;
  const activeCollection = state.collections.find((c) =>
    c.requests.some((r) => r.id === activeId),
  );
  const environment = state.environments.find((e) => e.id === envId) ?? null;

  // Load the selected request into the editor. Keyed on the id, not the object:
  // refreshing console state remakes these objects, and reloading on identity
  // would wipe the response the user just fetched.
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!active) {
      setDraft(null);
      loadedId.current = null;
      return;
    }
    if (loadedId.current === active.id) return;
    loadedId.current = active.id;

    setDraft({
      name: active.name,
      method: active.method,
      path: active.path,
      body: prettyJson(active.body) || "",
      headers: JSON.stringify(active.headers ?? {}, null, 2),
      params: JSON.stringify(active.params ?? {}, null, 2),
      assertions: active.assertions ?? "",
    });
    setDirty(false);
    setResult(null);
    setResultId(null);
  }, [active]);

  const refresh = useCallback(async () => {
    const next = await api.get<ConsoleState>(`/api/api-console/${state.project.key}`);
    setState(next);
  }, [state.project.key]);

  /* ── actions ───────────────────────────────────────────── */

  const send = useCallback(async () => {
    if (!active || !draft || !envId) return;
    setSending(true);
    try {
      const res = await api.post<{ result: SendResult; resultId: string }>(
        `/api/api-console/requests/${active.id}/send`,
        {
          environmentId: envId,
          overrides: {
            method: draft.method,
            path: draft.path,
            body: draft.body || null,
            headers: safeParse(draft.headers),
            params: safeParse(draft.params),
            assertions: draft.assertions,
          },
        },
      );
      setResult(res.result);
      setResultId(res.resultId);
      setResponseTab("Body");
      refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't send that request");
    } finally {
      setSending(false);
    }
  }, [active, draft, envId, refresh, toast]);

  async function save() {
    if (!active || !draft) return;
    try {
      await api.patch(`/api/api-console/requests/${active.id}`, {
        name: draft.name,
        method: draft.method,
        path: draft.path,
        body: draft.body || null,
        headers: safeParse(draft.headers),
        params: safeParse(draft.params),
        assertions: draft.assertions,
      });
      setDirty(false);
      await refresh();
      toast("Request saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that");
    }
  }

  async function runAll(collectionId: string | null) {
    if (!envId) {
      toast("Add an environment first");
      return;
    }
    setRunning(true);
    try {
      const res = await api.post<{ runId: string }>("/api/api-console/run", {
        projectId: state.project.id,
        environmentId: envId,
        collectionId,
      });
      router.push(`/projects/${state.project.key}/api/runs/${res.runId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't run that collection");
      setRunning(false);
    }
  }

  async function importFromRepo() {
    setImporting(true);
    try {
      const res = await api.post<{
        found: boolean;
        collections: number;
        requests: number;
        style: string;
        message?: string;
      }>(`/api/api-console/${state.project.key}/import`);
      toast(
        res.found
          ? `Imported ${res.requests} request${res.requests === 1 ? "" : "s"} from ${res.collections} folder${res.collections === 1 ? "" : "s"}`
          : (res.message ?? "No /api folder found"),
      );
      await refresh();
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't read the repository");
    } finally {
      setImporting(false);
    }
  }

  async function addRequest(collectionId: string) {
    try {
      const res = await api.post<{ request: ConsoleRequest }>("/api/api-console/requests", {
        collectionId,
        name: "New request",
        method: "GET",
        path: "/api/",
      });
      await refresh();
      setActiveId(res.request.id);
    } catch {
      toast("Couldn't add that request");
    }
  }

  /* ── shortcuts from the design ─────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "Enter") {
        e.preventDefault();
        send();
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        const index = state.environments.findIndex((x) => x.id === envId);
        const next = state.environments[(index + 1) % Math.max(state.environments.length, 1)];
        if (next) {
          setEnvId(next.id);
          toast(`Environment · ${next.name}`);
        }
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "i" && resultId) {
        e.preventDefault();
        router.push(`/projects/${state.project.key}/api/runs/latest?from=${resultId}`);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [send, envId, state.environments, state.project.key, resultId, router, toast]);

  const failures = result?.assertions.filter((a) => !a.ok) ?? [];

  return (
    <main className="panel">
      <div className="split console-split">
        <CollectionsPanel
          collections={state.collections}
          repoFullName={state.project.repoFullName}
          activeId={activeId}
          onSelect={(r) => setActiveId(r.id)}
          onNewRequest={addRequest}
          onRunCollection={(c) => runAll(c.id)}
          lastRun={state.latestRun}
          running={running}
        />

        <div className="split-main">
          <header className="panel-head panel-head-sm" style={{ padding: "0 20px" }}>
            {draft ? (
              <>
                <input
                  value={draft.name}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value });
                    setDirty(true);
                  }}
                  style={{
                    font: "600 15px var(--display)",
                    letterSpacing: "-0.01em",
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: "var(--text)",
                    width: "auto",
                    maxWidth: 240,
                  }}
                />
                <span className="mono" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>
                  {activeCollection?.name} /
                </span>
              </>
            ) : (
              <div style={{ font: "600 15px var(--display)" }}>API console</div>
            )}

            <div className="grow" />

            {dirty && (
              <button className="btn btn-ghost" onClick={save}>
                Save
              </button>
            )}

            <Popover
              align="right"
              width={260}
              trigger={({ toggle }) => (
                <button className="btn btn-ghost" onClick={toggle}>
                  <span
                    className="dot"
                    style={{
                      background:
                        environment?.kind === "PR_PREVIEW" ? "var(--accent)" : "var(--amber)",
                    }}
                  />
                  {environment?.name ?? "no environment"} ⌄
                </button>
              )}
            >
              {(close) => (
                <>
                  {state.environments.map((env) => (
                    <button
                      key={env.id}
                      className="menu-item"
                      data-active={env.id === envId}
                      onClick={() => {
                        setEnvId(env.id);
                        close();
                      }}
                    >
                      <span
                        className="dot"
                        style={{
                          background: env.kind === "PR_PREVIEW" ? "var(--accent)" : "var(--amber)",
                        }}
                      />
                      <span className="grow">{env.name}</span>
                      <span className="mono" style={{ fontSize: 9.5, color: "var(--faint)" }}>
                        {env.kind === "PR_PREVIEW" ? `PR #${env.prNumber}` : ""}
                      </span>
                    </button>
                  ))}
                  <div className="menu-sep" />
                  <button
                    className="menu-item"
                    onClick={() => {
                      setNewEnv(true);
                      close();
                    }}
                  >
                    + New environment
                  </button>
                </>
              )}
            </Popover>

            <button className="btn btn-ghost" onClick={importFromRepo} disabled={importing}>
              {importing ? <span className="spin" /> : "Sync from repo"}
            </button>
          </header>

          {!draft ? (
            <Empty
              title={
                state.collections.length
                  ? "Pick a request"
                  : state.project.repoFullName
                    ? "No requests yet"
                    : "No repository linked"
              }
              hint={
                state.collections.length
                  ? "Choose one on the left, or add a new one."
                  : state.project.repoFullName
                    ? "Sync from repo reads the /api folder and builds collections from it."
                    : "Link a repository to the project and the console fills itself in."
              }
            />
          ) : (
            <>
              <div style={{ padding: "0 20px 14px", display: "flex", gap: 9 }}>
                <Popover
                  width={150}
                  trigger={({ toggle }) => (
                    <button
                      onClick={toggle}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "0 13px",
                        height: 44,
                        borderRadius: 12,
                        background: "var(--accent)",
                        color: "var(--accent-fg)",
                        font: "700 12px var(--mono)",
                        flex: "none",
                      }}
                    >
                      {draft.method} ⌄
                    </button>
                  )}
                >
                  {(close) =>
                    METHODS.map((m) => (
                      <button
                        key={m}
                        className="menu-item"
                        data-active={draft.method === m}
                        onClick={() => {
                          setDraft({ ...draft, method: m });
                          setDirty(true);
                          close();
                        }}
                      >
                        <span className={`method-badge method-${m}`}>
                          {m === "DELETE" ? "DEL" : m}
                        </span>
                        {m}
                      </button>
                    ))
                  }
                </Popover>

                <div className="url-bar">
                  <span className="url-base">{environment?.baseUrl ?? "set an environment"}</span>
                  <input
                    value={draft.path}
                    onChange={(e) => {
                      setDraft({ ...draft, path: e.target.value });
                      setDirty(true);
                    }}
                    spellCheck={false}
                    aria-label="Request path"
                  />
                </div>

                <button
                  className="btn btn-white"
                  style={{ width: 104, height: 44, borderRadius: 12, font: "600 13px var(--display)" }}
                  onClick={send}
                  disabled={sending || !envId}
                >
                  {sending ? (
                    <span className="spin" />
                  ) : (
                    <>
                      Send
                      <span className="mono kbd-hint" style={{ fontSize: 9.5, opacity: 0.55 }}>
                        ⌘⏎
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="console-panes" style={{ flex: 1, display: "flex", minHeight: 0, padding: "0 20px 20px", gap: 14 }}>
                {/* ── request ── */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
                  <div className="tabs" style={{ flexWrap: "wrap" }}>
                    {REQUEST_TABS.map((t) => (
                      <button key={t} data-active={tab === t} onClick={() => setTab(t)}>
                        {t}
                        {t === "Headers" && countOf(draft.headers) > 0 ? ` ${countOf(draft.headers)}` : ""}
                        {t === "Tests" && lineCount(draft.assertions) > 0
                          ? ` ${lineCount(draft.assertions)}`
                          : ""}
                      </button>
                    ))}
                  </div>

                  {tab === "Body" && (
                    <CodeEditor
                      value={draft.body}
                      placeholder={
                        ["GET", "HEAD"].includes(draft.method)
                          ? `${draft.method} requests don't send a body`
                          : "{ }"
                      }
                      onChange={(body) => {
                        setDraft({ ...draft, body });
                        setDirty(true);
                      }}
                    />
                  )}
                  {tab === "Headers" && (
                    <CodeEditor
                      value={draft.headers}
                      onChange={(headers) => {
                        setDraft({ ...draft, headers });
                        setDirty(true);
                      }}
                    />
                  )}
                  {tab === "Params" && (
                    <CodeEditor
                      value={draft.params}
                      onChange={(params) => {
                        setDraft({ ...draft, params });
                        setDirty(true);
                      }}
                    />
                  )}
                  {tab === "Tests" && (
                    <CodeEditor
                      lineNumbers={false}
                      value={draft.assertions}
                      placeholder={'status == 200\nbody.token exists\nduration < 500ms'}
                      onChange={(assertions) => {
                        setDraft({ ...draft, assertions });
                        setDirty(true);
                      }}
                    />
                  )}

                  <div
                    className="card"
                    style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}
                  >
                    <div className="row-flex" style={{ gap: 9 }}>
                      <div style={{ font: "600 12px var(--display)" }}>Assertions</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                        {result
                          ? `${result.passedCount} pass · ${result.failedCount} fail`
                          : `${lineCount(draft.assertions)} defined`}
                      </div>
                      <div className="grow" />
                      <button
                        style={{ font: "500 11px var(--sans)", color: "var(--accent)" }}
                        onClick={() => {
                          setTab("Tests");
                          setDraft({
                            ...draft,
                            assertions: `${draft.assertions}${draft.assertions ? "\n" : ""}status == 200`,
                          });
                          setDirty(true);
                        }}
                      >
                        + Add
                      </button>
                    </div>

                    {(result?.assertions ?? previewAssertions(draft.assertions)).map((a, i) => (
                      <div key={i} className="assert-row" data-ok={a.ok}>
                        <span style={{ color: a.ok ? "var(--success)" : undefined }}>
                          {result ? (a.ok ? "✓" : "✕") : "·"}
                        </span>
                        <span className="grow">{a.source}</span>
                        {result && !a.ok && (
                          <span style={{ fontSize: 10, opacity: 0.8 }}>{a.detail}</span>
                        )}
                      </div>
                    ))}

                    {lineCount(draft.assertions) === 0 && (
                      <div style={{ font: "400 11px var(--sans)", color: "var(--muted-2)" }}>
                        No assertions — a 2xx response counts as a pass.
                      </div>
                    )}
                  </div>
                </div>

                {/* ── response ── */}
                <div
                  className="console-response"
                  style={{ width: 430, flex: "none", display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}
                >
                  <div className="row-flex" style={{ gap: 9 }}>
                    {result ? (
                      <>
                        <span className={`status-pill ${statusClass(result.status, result.error)}`}>
                          {result.error ? "failed" : `${result.status} ${result.statusText ?? ""}`.trim()}
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {result.durationMs} ms
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                          {formatBytes(result.sizeBytes)}
                        </span>
                      </>
                    ) : (
                      <span style={{ font: "400 11px var(--sans)", color: "var(--muted)" }}>
                        Not sent yet
                      </span>
                    )}
                    <div className="grow" />
                    {state.latestRun && (
                      <Link
                        href={`/projects/${state.project.key}/api/runs/${state.latestRun.id}`}
                        style={{ font: "500 11px var(--sans)", color: "var(--muted)" }}
                      >
                        History →
                      </Link>
                    )}
                  </div>

                  <div className="tabs">
                    {RESPONSE_TABS.map((t) => (
                      <button key={t} data-active={responseTab === t} onClick={() => setResponseTab(t)}>
                        {t}
                        {t === "Headers" && result
                          ? ` ${Object.keys(result.responseHeaders).length}`
                          : ""}
                      </button>
                    ))}
                  </div>

                  <CodeEditor
                    readOnly
                    lineNumbers={false}
                    value={
                      !result
                        ? ""
                        : responseTab === "Body"
                          ? (prettyJson(result.responseBody) || result.error || "(empty response)")
                          : responseTab === "Headers"
                            ? JSON.stringify(result.responseHeaders, null, 2)
                            : JSON.stringify(
                                {
                                  durationMs: result.durationMs,
                                  sizeBytes: result.sizeBytes,
                                  url: result.url,
                                },
                                null,
                                2,
                              )
                    }
                    placeholder="Send the request to see the response"
                  />

                  {result && failures.length > 0 && (
                    <div className="failure-card">
                      <div className="row-flex" style={{ gap: 9 }}>
                        <span
                          className="avatar"
                          style={{
                            width: 18,
                            height: 18,
                            background: "var(--danger-solid)",
                            color: "oklch(0.2 0.04 25)",
                            fontWeight: 700,
                            fontSize: 10,
                          }}
                        >
                          !
                        </span>
                        <div style={{ font: "600 12px var(--display)" }}>
                          {failures.length} assertion{failures.length === 1 ? "" : "s"} failed
                        </div>
                      </div>

                      <div style={{ font: "400 11px/1.6 var(--sans)", color: "oklch(0.92 0.04 25)" }}>
                        <span className="mono">{failures[0].source}</span> — {failures[0].detail}
                        {environment ? ` on ${environment.name}.` : "."}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link
                          className="btn btn-white btn-sm"
                          href={`/projects/${state.project.key}/api/runs/latest?from=${resultId}`}
                        >
                          Create issue <span className="mono kbd-hint" style={{ fontSize: 9 }}>⌘⇧I</span>
                        </Link>
                      </div>
                    </div>
                  )}

                  {result?.error && failures.length === 0 && (
                    <div className="failure-card">
                      <div style={{ font: "600 12px var(--display)" }}>Request failed</div>
                      <div style={{ font: "400 11px/1.6 var(--sans)", color: "oklch(0.92 0.04 25)" }}>
                        {result.error}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {newEnv && (
        <NewEnvironmentModal
          projectId={state.project.id}
          onClose={() => setNewEnv(false)}
          onCreated={async (id) => {
            await refresh();
            setEnvId(id);
          }}
        />
      )}
    </main>
  );
}

function NewEnvironmentModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [prNumber, setPrNumber] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New environment" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await api.post<{ environment: { id: string } }>(
              "/api/api-console/environments",
              {
                projectId,
                name: name.trim(),
                baseUrl: baseUrl.trim(),
                kind: prNumber ? "PR_PREVIEW" : "STATIC",
                prNumber: prNumber ? Number(prNumber) : null,
              },
            );
            onCreated(res.environment.id);
            onClose();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Couldn't create that environment");
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor="env-name">
            Name
          </label>
          <input
            id="env-name"
            className="input"
            autoFocus
            required
            placeholder="staging"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="env-url">
            Base URL
          </label>
          <input
            id="env-url"
            className="input mono"
            required
            style={{ fontSize: 12.5 }}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="env-pr">
            PR number
          </label>
          <input
            id="env-pr"
            className="input"
            type="number"
            placeholder="optional — marks this as a PR preview"
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || !name.trim()}>
            {busy ? <span className="spin" /> : "Add environment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function safeParse(value: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function countOf(json: string) {
  return Object.keys(safeParse(json) ?? {}).length;
}

function lineCount(assertions: string) {
  return assertions.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
}

function previewAssertions(assertions: string) {
  return assertions
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((source) => ({ source, ok: true, detail: "" }));
}

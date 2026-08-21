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
  type ConsoleCollection,
  type ConsoleEnvironment,
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
  const [managingEnvs, setManagingEnvs] = useState(false);
  const [renaming, setRenaming] = useState<
    { kind: "collection" | "request"; id: string; name: string } | null
  >(null);

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
        created: number;
        bodiesFilled: number;
        detailsFilled: number;
        removed: number;
        message?: string;
      }>(`/api/api-console/${state.project.key}/import`);

      if (!res.found) {
        toast(res.message ?? "No /api folder found");
      } else {
        // Say what actually changed, not just what was scanned.
        const parts = [
          res.created ? `${res.created} new` : null,
          res.bodiesFilled ? `${res.bodiesFilled} bod${res.bodiesFilled === 1 ? "y" : "ies"} filled` : null,
          res.detailsFilled ? `${res.detailsFilled} updated` : null,
          res.removed ? `${res.removed} removed` : null,
        ].filter(Boolean);
        toast(
          parts.length
            ? `Synced ${res.requests} requests · ${parts.join(" · ")}`
            : `Synced ${res.requests} requests · already up to date`,
        );
      }
      await refresh();
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't read the repository");
    } finally {
      setImporting(false);
    }
  }

  async function renameCollection(id: string, name: string) {
    try {
      await api.patch(`/api/api-console/collections/${id}`, { name });
      await refresh();
      toast("Collection renamed");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't rename that");
    }
  }

  async function deleteCollection(collection: ConsoleCollection) {
    // Delete straight away and offer it back, rather than interrupting with a
    // browser dialog. Everything needed to rebuild it is captured first.
    const snapshot = {
      name: collection.name,
      requests: collection.requests.map((r) => ({
        name: r.name,
        method: r.method,
        path: r.path,
        body: r.body,
        headers: r.headers,
        params: r.params,
        assertions: r.assertions,
      })),
    };

    try {
      const res = await api.del<{ requests: number; returnsOnSync: boolean }>(
        `/api/api-console/collections/${collection.id}`,
      );
      if (activeId && collection.requests.some((r) => r.id === activeId)) setActiveId(null);
      await refresh();

      toast(
        `Deleted ${collection.name} · ${res.requests} request${res.requests === 1 ? "" : "s"}${
          res.returnsOnSync ? " · returns on next sync" : ""
        }`,
        {
          label: "Undo",
          run: async () => {
            try {
              const created = await api.post<{ collection: { id: string } }>(
                "/api/api-console/collections",
                { projectId: state.project.id, name: snapshot.name },
              );
              for (const request of snapshot.requests) {
                await api.post("/api/api-console/requests", {
                  collectionId: created.collection.id,
                  ...request,
                });
              }
              await refresh();
              toast(`${snapshot.name} restored`);
            } catch {
              toast("Couldn't restore that collection");
            }
          },
        },
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete that");
    }
  }

  async function renameRequest(id: string, name: string) {
    try {
      await api.patch(`/api/api-console/requests/${id}`, { name });
      await refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't rename that");
    }
  }

  async function duplicateRequest(request: ConsoleRequest) {
    const collection = state.collections.find((c) => c.requests.some((r) => r.id === request.id));
    if (!collection) return;
    try {
      const res = await api.post<{ request: ConsoleRequest }>("/api/api-console/requests", {
        collectionId: collection.id,
        name: `${request.name} copy`,
        method: request.method,
        path: request.path,
        body: request.body,
        headers: request.headers,
        params: request.params,
        assertions: request.assertions,
      });
      await refresh();
      setActiveId(res.request.id);
    } catch {
      toast("Couldn't duplicate that request");
    }
  }

  async function deleteRequest(request: ConsoleRequest) {
    const collection = state.collections.find((c) => c.requests.some((r) => r.id === request.id));
    if (!collection) return;

    try {
      await api.del(`/api/api-console/requests/${request.id}`);
      if (activeId === request.id) setActiveId(null);
      await refresh();

      toast(`Deleted ${request.name}`, {
        label: "Undo",
        run: async () => {
          try {
            const res = await api.post<{ request: ConsoleRequest }>("/api/api-console/requests", {
              collectionId: collection.id,
              name: request.name,
              method: request.method,
              path: request.path,
              body: request.body,
              headers: request.headers,
              params: request.params,
              assertions: request.assertions,
            });
            await refresh();
            setActiveId(res.request.id);
          } catch {
            toast("Couldn't restore that request");
          }
        },
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete that");
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
          onRenameCollection={(c) =>
            setRenaming({ kind: "collection", id: c.id, name: c.name })
          }
          onDeleteCollection={deleteCollection}
          onRenameRequest={(r) => setRenaming({ kind: "request", id: r.id, name: r.name })}
          onDuplicateRequest={duplicateRequest}
          onDeleteRequest={deleteRequest}
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
                      setManagingEnvs(true);
                      close();
                    }}
                  >
                    Manage environments
                  </button>
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

      {managingEnvs && (
        <ManageEnvironmentsModal
          environments={state.environments}
          activeId={envId}
          projectId={state.project.id}
          onClose={() => setManagingEnvs(false)}
          onChanged={async (removedId) => {
            await refresh();
            if (removedId && removedId === envId) {
              const next = state.environments.find((e) => e.id !== removedId);
              setEnvId(next?.id ?? "");
            }
          }}
        />
      )}

      {renaming && (
        <RenameModal
          label={renaming.kind === "collection" ? "Rename collection" : "Rename request"}
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={async (name) => {
            if (renaming.kind === "collection") await renameCollection(renaming.id, name);
            else await renameRequest(renaming.id, name);
            setRenaming(null);
          }}
        />
      )}

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

function RenameModal({
  label,
  initial,
  onClose,
  onSubmit,
}: {
  label: string;
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={label} onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSubmit(name.trim());
          setBusy(false);
        }}
      >
        <div className="field">
          <label className="label" htmlFor="rename-input">
            Name
          </label>
          <input
            id="rename-input"
            className="input"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy || !name.trim()}>
            {busy ? <span className="spin" /> : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Edit base URLs and the variables that `$env.NAME` resolves against. */
function ManageEnvironmentsModal({
  environments,
  activeId,
  projectId,
  onClose,
  onChanged,
}: {
  environments: ConsoleEnvironment[];
  activeId: string;
  projectId: string;
  onClose: () => void;
  onChanged: (removedId?: string) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; baseUrl: string; variables: string }>({
    name: "",
    baseUrl: "",
    variables: "{}",
  });
  const [busy, setBusy] = useState(false);

  function startEdit(env: ConsoleEnvironment) {
    setEditing(env.id);
    setDraft({
      name: env.name,
      baseUrl: env.baseUrl,
      variables: JSON.stringify(env.variables ?? {}, null, 2),
    });
  }

  async function save(id: string) {
    setBusy(true);
    try {
      await api.patch(`/api/api-console/environments/${id}`, {
        name: draft.name.trim(),
        baseUrl: draft.baseUrl.trim(),
        variables: safeParse(draft.variables) ?? {},
      });
      setEditing(null);
      await onChanged();
      toast("Environment saved");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that environment");
    } finally {
      setBusy(false);
    }
  }

  async function remove(env: ConsoleEnvironment) {
    try {
      await api.del(`/api/api-console/environments/${env.id}`);
      await onChanged(env.id);

      toast(`Deleted ${env.name}`, {
        label: "Undo",
        run: async () => {
          try {
            await api.post("/api/api-console/environments", {
              projectId,
              name: env.name,
              baseUrl: env.baseUrl,
              kind: env.kind,
              prNumber: env.prNumber,
              color: env.color,
              variables: env.variables,
            });
            await onChanged();
            toast(`${env.name} restored`);
          } catch {
            toast("Couldn't restore that environment");
          }
        },
      });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't delete that environment");
    }
  }

  return (
    <Modal title="Environments" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {environments.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 12 }}>No environments yet.</div>
        )}

        {environments.map((env) =>
          editing === env.id ? (
            <div
              key={env.id}
              className="card"
              style={{ background: "var(--raised)", display: "flex", flexDirection: "column", gap: 11 }}
            >
              <div className="field">
                <label className="label" htmlFor={`env-name-${env.id}`}>
                  Name
                </label>
                <input
                  id={`env-name-${env.id}`}
                  className="input input-sm"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`env-url-${env.id}`}>
                  Base URL
                </label>
                <input
                  id={`env-url-${env.id}`}
                  className="input input-sm mono"
                  style={{ fontSize: 12 }}
                  value={draft.baseUrl}
                  onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`env-vars-${env.id}`}>
                  Variables · used as $env.NAME
                </label>
                <textarea
                  id={`env-vars-${env.id}`}
                  className="textarea mono"
                  style={{ minHeight: 80, fontSize: 12 }}
                  value={draft.variables}
                  onChange={(e) => setDraft({ ...draft, variables: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 9 }}>
                <button className="btn btn-outline grow" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary grow" onClick={() => save(env.id)} disabled={busy}>
                  {busy ? <span className="spin" /> : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div key={env.id} className="row-flex card-tight" style={{ background: "var(--raised)" }}>
              <span
                className="dot"
                style={{ background: env.kind === "PR_PREVIEW" ? "var(--accent)" : "var(--amber)" }}
              />
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ font: "500 12px var(--sans)" }}>
                  {env.name}
                  {env.id === activeId && (
                    <span style={{ color: "var(--muted-2)", fontWeight: 400 }}> · in use</span>
                  )}
                </div>
                <div className="mono truncate" style={{ fontSize: 10, color: "var(--muted-2)" }}>
                  {env.baseUrl}
                  {env.variables && Object.keys(env.variables).length
                    ? ` · ${Object.keys(env.variables).length} vars`
                    : ""}
                </div>
              </div>
              <button className="btn btn-quiet btn-sm" onClick={() => startEdit(env)}>
                Edit
              </button>
              <button
                className="btn btn-quiet btn-sm"
                style={{ color: "var(--danger)" }}
                onClick={() => remove(env)}
              >
                Delete
              </button>
            </div>
          ),
        )}
      </div>

      <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--faint)" }}>
        Variables are substituted into the URL, headers and body as{" "}
        <span className="mono">$env.NAME</span>.
      </div>
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

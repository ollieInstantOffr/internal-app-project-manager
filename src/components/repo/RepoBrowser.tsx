"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Avatar, Empty, Modal, Popover } from "@/components/ui";
import { formatBytes } from "@/components/api/types";
import { relativeTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/constants";
import { IssueStatus } from "@/lib/types";
import { FileTree, type TreeNode } from "./FileTree";
import { CodeView } from "./CodeView";

export type RepoState = {
  project: { id: string; key: string; name: string };
  repo: string;
  ref: string;
  tree: TreeNode[];
  paths: string[];
  fileCount: number;
  truncated: boolean;
  syncedAt: string;
  branches: { name: string; sha: string; isDefault: boolean }[];
  flaggedPaths: string[];
};

export type FileContext = {
  path: string;
  ref: string;
  content: string | null;
  binary: boolean;
  lines: number;
  sizeBytes: number;
  language: string;
  lastCommit: { authorName: string; date: string; message: string } | null;
  owners: { name: string; login: string | null; hue: number; share: number }[];
  issues: {
    key: string;
    title: string;
    status: IssueStatus;
    startLine: number | null;
    endLine: number | null;
    assignee: string | null;
  }[];
  branches: { name: string; ahead: number; issueKey: string | null }[];
  pullRequests: { number: number; state: string; issueKey: string }[];
  epic: { key: string; name: string } | null;
};

export function RepoBrowser({
  initial,
  initialFile,
}: {
  initial: RepoState;
  initialFile: FileContext | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [state, setState] = useState(initial);
  const [file, setFile] = useState<FileContext | null>(initialFile);
  const [path, setPath] = useState<string | null>(initialFile?.path ?? null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [composing, setComposing] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);

  const flagged = useMemo(() => new Set(state.flaggedPaths), [state.flaggedPaths]);

  const open = useCallback(
    async (next: string, ref = state.ref) => {
      setPath(next);
      setSelection(null);
      setLoading(true);
      setTreeOpen(false);
      try {
        const res = await api.get<{ file: FileContext }>(
          `/api/repo/${state.project.key}/file?path=${encodeURIComponent(next)}&ref=${encodeURIComponent(ref)}`,
        );
        setFile(res.file);
        window.history.replaceState(
          null,
          "",
          `/projects/${state.project.key}/code?path=${encodeURIComponent(next)}&ref=${encodeURIComponent(ref)}`,
        );
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "Couldn't open that file");
        setFile(null);
      } finally {
        setLoading(false);
      }
    },
    [state.project.key, state.ref, toast],
  );

  async function switchBranch(ref: string) {
    setLoading(true);
    try {
      const next = await api.get<RepoState>(
        `/api/repo/${state.project.key}?ref=${encodeURIComponent(ref)}`,
      );
      setState(next);
      if (path && next.paths.includes(path)) await open(path, ref);
      else {
        setFile(null);
        setPath(null);
        setLoading(false);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't switch branch");
      setLoading(false);
    }
  }

  // ⌘P jumps to the file filter, the way an editor would.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setTreeOpen(true);
        requestAnimationFrame(() => document.getElementById("repo-find")?.focus());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const directory = path ? path.split("/").slice(0, -1).join("/") : "";
  const name = path ? path.split("/").pop() : null;
  const githubUrl = path
    ? `https://github.com/${state.repo}/blob/${state.ref}/${path}`
    : `https://github.com/${state.repo}`;

  return (
    <main className="panel">
      <div className="split repo-split" data-tree-open={treeOpen}>
        <div className="repo-scrim" onClick={() => setTreeOpen(false)} aria-hidden />

        <div className="repo-tree-pane">
          <div style={{ height: 62, flex: "none", display: "flex", alignItems: "center", padding: "0 16px" }}>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ font: "600 14px var(--display)" }}>
                {state.repo}
              </div>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
                {state.ref} · synced {relativeTime(state.syncedAt)}
              </div>
            </div>
          </div>

          <div style={{ padding: "0 12px 10px" }}>
            <div style={{ position: "relative" }}>
              <input
                id="repo-find"
                className="input input-sm"
                style={{ height: 34, background: "var(--card)", fontSize: 11.5, paddingRight: 34 }}
                placeholder="Find file"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <span
                className="mono kbd-hint"
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  fontSize: 9,
                  fontWeight: 500,
                  color: "var(--muted-2)",
                  pointerEvents: "none",
                }}
              >
                ⌘P
              </span>
            </div>
          </div>

          <div style={{ padding: "0 12px 10px" }}>
            <Popover
              width={240}
              trigger={({ toggle }) => (
                <button
                  onClick={toggle}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 11px",
                    borderRadius: 10,
                    background: "var(--card)",
                    font: "500 11px var(--sans)",
                    width: "100%",
                  }}
                >
                  <span className="dot" style={{ background: "var(--success)" }} />
                  <span className="truncate">{state.ref} ⌄</span>
                  <span
                    className="mono"
                    style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted-2)" }}
                  >
                    {state.branches.length > 1 ? `+${state.branches.length - 1} branches` : ""}
                  </span>
                </button>
              )}
            >
              {(close) =>
                state.branches.map((branch) => (
                  <button
                    key={branch.name}
                    className="menu-item"
                    data-active={branch.name === state.ref}
                    onClick={() => {
                      close();
                      if (branch.name !== state.ref) switchBranch(branch.name);
                    }}
                  >
                    <span
                      className="dot"
                      style={{ background: branch.isDefault ? "var(--success)" : "var(--blue)" }}
                    />
                    <span className="truncate">{branch.name}</span>
                  </button>
                ))
              }
            </Popover>
          </div>

          <div className="scroll-y" style={{ flex: 1, padding: "0 8px" }}>
            <FileTree
              tree={state.tree}
              activePath={path}
              flagged={flagged}
              filter={filter}
              onOpen={(next) => open(next)}
            />
          </div>

          <div
            style={{
              margin: "8px 9px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              font: "400 10.5px var(--sans)",
              color: "var(--muted-2)",
            }}
          >
            <span className="tree-dot" />
            dot = open issues on this file
          </div>
        </div>

        <div className="split-main">
          <header className="panel-head panel-head-sm" style={{ padding: "0 20px" }}>
            <button
              className="btn btn-ghost repo-tree-toggle"
              onClick={() => setTreeOpen(true)}
              aria-label="Browse files"
            >
              Files
            </button>

            {path ? (
              <div style={{ minWidth: 0 }}>
                <div className="mono truncate" style={{ fontSize: 12.5 }}>
                  <span style={{ color: "var(--muted-2)" }}>{directory ? `${directory}/` : ""}</span>
                  {name}
                </div>
                <div style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
                  {file
                    ? `${file.lines} lines · ${formatBytes(file.sizeBytes)}${
                        file.lastCommit
                          ? ` · last changed ${relativeTime(file.lastCommit.date)} by ${file.lastCommit.authorName}`
                          : ""
                      }`
                    : "loading…"}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ font: "600 15px var(--display)" }}>Code</div>
                <div className="panel-sub">
                  {state.fileCount} files on {state.ref}
                </div>
              </div>
            )}

            <div className="grow" />

            {path && (
              <>
                <a
                  className="btn btn-ghost"
                  href={`https://github.com/${state.repo}/raw/${state.ref}/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Raw
                </a>
                <a
                  className="btn btn-ghost"
                  href={`https://github.com/${state.repo}/commits/${state.ref}/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  History
                </a>
              </>
            )}
            <a className="btn btn-ghost" href={githubUrl} target="_blank" rel="noreferrer">
              Open on GitHub
            </a>
          </header>

          <div className="repo-body">
            <section className="repo-reader">
              {!path ? (
                <Empty
                  title="Pick a file"
                  hint="The tree mirrors the branch. Selecting lines lets you open an issue against exactly those lines."
                />
              ) : loading ? (
                <div className="empty">
                  <span className="spin" /> Loading {name}…
                </div>
              ) : !file || file.content === null ? (
                <Empty
                  title={file?.binary ? "Binary file" : "Couldn't read that file"}
                  hint={
                    file?.binary
                      ? "Nothing useful to show for this type — open it on GitHub instead."
                      : "It may be too large, or removed on this branch."
                  }
                />
              ) : (
                <>
                  <div className="repo-reader-head">
                    <span className="eyebrow" style={{ whiteSpace: "nowrap" }}>
                      {file.language}
                    </span>
                    <span className="grow" />
                    {selection && (
                      <>
                        <span
                          className="pill"
                          style={{
                            background: "var(--accent-wash-2)",
                            color: "var(--accent-text)",
                            fontSize: 10,
                          }}
                        >
                          {selection.start === selection.end
                            ? `Line ${selection.start}`
                            : `Lines ${Math.min(selection.start, selection.end)}–${Math.max(
                                selection.start,
                                selection.end,
                              )}`}
                        </span>
                        <button
                          style={{ font: "600 10px var(--sans)", color: "var(--accent)" }}
                          onClick={() => setComposing(true)}
                        >
                          New issue
                        </button>
                      </>
                    )}
                  </div>

                  <div className="scroll-y" style={{ flex: 1 }}>
                    <CodeView
                      content={file.content}
                      language={file.language}
                      selection={selection}
                      onSelect={(update) => setSelection((prev) => update(prev))}
                    />
                  </div>
                </>
              )}
            </section>

            {file && path && (
              <aside className="repo-aside">
                <div className="card" style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 11 }}>
                  <h2 style={{ font: "600 12.5px var(--display)" }}>Issues touching this file</h2>

                  {file.issues.length === 0 && (
                    <div style={{ font: "400 11px/1.6 var(--sans)", color: "var(--muted-2)" }}>
                      None yet. Select lines and open one — the range is stored with it.
                    </div>
                  )}

                  {file.issues.map((issue) => {
                    const blocked = issue.status === IssueStatus.DONE;
                    const active = issue.status === IssueStatus.IN_PROGRESS;
                    return (
                      <Link
                        key={`${issue.key}-${issue.startLine ?? "x"}`}
                        href={`/issues/${issue.key}`}
                        style={{
                          borderRadius: 11,
                          padding: 11,
                          display: "flex",
                          flexDirection: "column",
                          gap: 7,
                          background: active
                            ? "oklch(0.3 0.03 128)"
                            : blocked
                              ? "var(--surface)"
                              : "var(--raised)",
                        }}
                      >
                        <div className="row-flex" style={{ gap: 8 }}>
                          <span
                            className="mono"
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              color: active ? "var(--accent-mono)" : "var(--muted-2)",
                            }}
                          >
                            {issue.key}
                          </span>
                          <span
                            className="pill"
                            style={
                              active
                                ? {
                                    background: "var(--accent)",
                                    color: "var(--accent-fg)",
                                    fontSize: 9.5,
                                    fontWeight: 600,
                                    padding: "1px 8px",
                                  }
                                : { fontSize: 9.5, padding: "1px 8px" }
                            }
                          >
                            {STATUS_LABEL[issue.status]}
                          </span>
                        </div>
                        <div style={{ font: "400 11.5px/1.45 var(--sans)" }}>{issue.title}</div>
                        {(issue.startLine || issue.assignee) && (
                          <div
                            style={{
                              font: "400 10px var(--sans)",
                              color: active ? "var(--accent-text)" : "var(--muted-2)",
                            }}
                          >
                            {issue.startLine
                              ? issue.endLine && issue.endLine !== issue.startLine
                                ? `lines ${issue.startLine}–${issue.endLine}`
                                : `line ${issue.startLine}`
                              : ""}
                            {issue.startLine && issue.assignee ? " · " : ""}
                            {issue.assignee ?? ""}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>

                {(file.branches.length > 0 || file.pullRequests.length > 0) && (
                  <div className="card" style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <h2 style={{ font: "600 12.5px var(--display)" }}>Open branches here</h2>
                    {file.branches.map((branch) => (
                      <div key={branch.name} className="row-flex mono" style={{ gap: 9, fontSize: 10.5 }}>
                        <span className="dot" style={{ background: "var(--success)" }} />
                        <span className="truncate">{branch.name}</span>
                        <span style={{ marginLeft: "auto", color: "var(--muted-2)" }}>
                          +{branch.ahead}
                        </span>
                      </div>
                    ))}
                    {file.pullRequests.map((pr) => (
                      <div key={pr.number} style={{ font: "400 10.5px var(--sans)", color: "var(--muted-2)" }}>
                        PR #{pr.number} changes this file —{" "}
                        <a
                          className="link-accent"
                          href={`https://github.com/${state.repo}/pull/${pr.number}/files`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          view diff
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {file.owners.length > 0 && (
                  <div className="card" style={{ borderRadius: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <h2 style={{ font: "600 12.5px var(--display)" }}>Ownership</h2>
                    {file.owners.map((owner) => (
                      <div key={owner.name} className="row-flex" style={{ gap: 10 }}>
                        <Avatar name={owner.name} hue={owner.hue} size={24} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="truncate" style={{ font: "500 11.5px var(--sans)" }}>
                            {owner.name}
                          </div>
                          <div style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
                            {owner.share}% of recent changes
                          </div>
                        </div>
                      </div>
                    ))}
                    {file.epic && (
                      <>
                        <div className="divider" />
                        <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
                          Epic <b>{file.epic.name}</b> owns this directory
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="card-dashed" style={{ marginTop: "auto", fontSize: 10.5, lineHeight: 1.6 }}>
                  Select lines to open an issue against them — the range is stored and follows the
                  file.
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {composing && path && (
        <NewIssueFromLines
          projectKey={state.project.key}
          path={path}
          ref_={state.ref}
          selection={selection}
          onClose={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            setSelection(null);
            open(path);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function NewIssueFromLines({
  projectKey,
  path,
  ref_,
  selection,
  onClose,
  onCreated,
}: {
  projectKey: string;
  path: string;
  ref_: string;
  selection: { start: number; end: number } | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const { members, user } = useShell();

  const name = path.split("/").pop() ?? path;
  const range = selection
    ? selection.start === selection.end
      ? `line ${selection.start}`
      : `lines ${Math.min(selection.start, selection.end)}–${Math.max(selection.start, selection.end)}`
    : null;

  const [title, setTitle] = useState(`${name}${range ? ` · ${range}` : ""} — `);
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(user.id);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New issue from selection" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await api.post<{ issue: { key: string } }>(`/api/repo/${projectKey}/issue`, {
              path,
              ref: ref_,
              startLine: selection ? Math.min(selection.start, selection.end) : null,
              endLine: selection ? Math.max(selection.start, selection.end) : null,
              title: title.trim(),
              description: description.trim() || null,
              assigneeId,
            });
            toast(`${res.issue.key} created`);
            onCreated();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Couldn't create that issue");
            setBusy(false);
          }
        }}
      >
        <div
          className="mono"
          style={{
            borderRadius: 11,
            background: "oklch(0.19 0.01 285)",
            border: "1px solid var(--line-strong)",
            padding: 11,
            fontSize: 10.5,
            lineHeight: 1.7,
            color: "var(--text-2)",
          }}
        >
          <span style={{ color: "var(--muted)" }}>file</span> {path}
          <br />
          <span style={{ color: "var(--muted)" }}>ref</span> {ref_}
          {range && (
            <>
              <br />
              <span style={{ color: "var(--muted)" }}>range</span>{" "}
              <span style={{ color: "var(--accent)" }}>{range}</span>
            </>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="rf-title">
            Title
          </label>
          <input
            id="rf-title"
            className="input"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="rf-desc">
            Description
          </label>
          <textarea
            id="rf-desc"
            className="textarea"
            placeholder="What's wrong with these lines?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="rf-assignee">
            Assignee
          </label>
          <select
            id="rf-assignee"
            className="select"
            value={assigneeId ?? ""}
            onChange={(e) => setAssigneeId(e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 9 }}>
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

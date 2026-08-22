"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Popover, Toggle } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/client";
import { LEVEL_COPY, LEVELS, OFF_LIMITS, type Level } from "@/lib/mcp/levels";

export type ToolInfo = {
  name: string;
  title: string;
  description: string;
  group: string;
  modes: Record<Level, "ALLOW" | "ASK" | "DENY">;
};

export type AssistantRow = {
  id: string;
  name: string;
  level: Level | "CUSTOM";
  client: string;
  tokenHint: string;
  projectIds: string[];
  ratePerHour: number;
  idleHours: number;
  enabled: boolean;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  capabilities: { tool: string; mode: "ALLOW" | "ASK" | "DENY" }[];
  actionsToday: number;
  log: {
    id: string;
    summary: string;
    outcome: string;
    createdAt: string;
  }[];
  pending: { id: string; summary: string; tool: string; createdAt: string }[];
};

const RATES = [50, 100, 200, 500, 1000];
const IDLE = [1, 4, 8, 24, 72, 0];
const CLIENTS = [
  { key: "CLAUDE_CODE", label: "Claude Code" },
  { key: "CURSOR", label: "Cursor" },
  { key: "OTHER", label: "Other" },
];

export function McpServer({
  aiAccess,
  assistants,
  projects,
  tools,
  endpoint,
  orgSlug,
}: {
  aiAccess: boolean;
  assistants: AssistantRow[];
  projects: { id: string; key: string; name: string }[];
  tools: ToolInfo[];
  endpoint: string;
  orgSlug: string;
}) {
  const router = useRouter();
  const { toast, error } = useToast();

  const [on, setOn] = useState(aiAccess);
  const [selectedId, setSelectedId] = useState(assistants[0]?.id ?? null);
  const [connecting, setConnecting] = useState(false);
  const [newKey, setNewKey] = useState<{ id: string; name: string; key: string } | null>(null);
  const [editingTools, setEditingTools] = useState(false);
  const [reviewing, setReviewing] = useState<AssistantRow["pending"][number] | null>(null);
  const [showSchemas, setShowSchemas] = useState(false);
  const [client, setClient] = useState("CLAUDE_CODE");

  const selected = assistants.find((a) => a.id === selectedId) ?? assistants[0] ?? null;
  const live = assistants.filter((a) => !a.revokedAt);
  const waiting = useMemo(
    () => assistants.flatMap((a) => a.pending.map((p) => ({ ...p, assistant: a }))),
    [assistants],
  );

  async function save(id: string, patch: Record<string, unknown>, message?: string) {
    try {
      await api.patch(`/api/assistants/${id}`, patch);
      if (message) toast(message);
      router.refresh();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't save that");
    }
  }

  async function toggleAccess(next: boolean) {
    setOn(next);
    try {
      await api.patch("/api/org/ai-access", { aiAccess: next });
      toast(next ? "AI access on" : "AI access off — no assistant can connect");
      router.refresh();
    } catch (err) {
      setOn(!next);
      error(err instanceof ApiError ? err.message : "Couldn't change that");
    }
  }

  async function connect(name: string) {
    try {
      const data = await api.post<{ assistant: AssistantRow; key: string }>("/api/assistants", {
        name,
        client,
      });
      setNewKey({ id: data.assistant.id, name: data.assistant.name, key: data.key });
      setConnecting(false);
      setSelectedId(data.assistant.id);
      router.refresh();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't connect that assistant");
    }
  }

  async function decide(
    assistantId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ) {
    try {
      const data = await api.post<{ text?: string }>(
        `/api/assistants/${assistantId}/approvals/${approvalId}`,
        { decision },
      );
      toast(decision === "approve" ? (data.text ?? "Approved") : "Sent back a no");
      setReviewing(null);
      router.refresh();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't record that");
    }
  }

  return (
    <main className="panel">
      <header className="panel-head" style={{ alignItems: "center" }}>
        <div>
          <h1 className="panel-title">AI access</h1>
          <div className="panel-sub">
            Each assistant gets its own level of trust. Nothing is shared between them.
          </div>
        </div>
        <div className="grow" />
        <div style={{ display: "flex", alignItems: "center", gap: 9, flex: "none" }}>
          <span style={{ font: "400 11.5px var(--sans)", color: "var(--text-3)" }}>
            AI access {on ? "on" : "off"}
          </span>
          <Toggle on={on} onChange={toggleAccess} label="AI access" />
        </div>
      </header>

      <div className="mcp-split">
        <div className="mcp-main">
          {waiting.map((item) => (
            <div key={item.id} className="mcp-waiting">
              <span className="mcp-waiting-mark" aria-hidden>
                !
              </span>
              <div className="grow">
                <div className="mcp-waiting-title">{item.assistant.name} is waiting on you</div>
                <div className="mcp-waiting-sub">
                  Wants to {item.summary} · <TimeAgo iso={item.createdAt} />
                </div>
              </div>
              <button className="btn btn-white" onClick={() => setReviewing(item)}>
                Review
              </button>
              <button className="btn-amber" onClick={() => setReviewing(null)}>
                Later
              </button>
            </div>
          ))}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "none" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ font: "600 14.5px var(--display)", letterSpacing: "-0.01em" }}>
                Assistants
              </div>
              <div style={{ font: "400 11px var(--sans)", color: "var(--muted-2)" }}>
                {live.length} connected
              </div>
              <button
                style={{ marginLeft: "auto", font: "500 11.5px var(--sans)", color: "var(--accent)" }}
                onClick={() => setConnecting(true)}
              >
                + Connect one
              </button>
            </div>

            {assistants.length === 0 && (
              <div className="mcp-card" style={{ background: "var(--surface)" }}>
                <div style={{ font: "400 12px/1.7 var(--sans)", color: "var(--muted)" }}>
                  Nothing connected yet. Connect an assistant and it starts on{" "}
                  <b style={{ color: "var(--text-2)" }}>Read only</b> until you raise it.
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {assistants.map((assistant) => (
                <div key={assistant.id} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <button
                    className="mcp-assistant"
                    data-active={assistant.id === selected?.id}
                    data-revoked={!!assistant.revokedAt}
                    onClick={() => setSelectedId(assistant.id)}
                  >
                    <span className="mcp-avatar">{initials(assistant.name)}</span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="mcp-assistant-name">{assistant.name}</span>
                      <span className="mcp-assistant-sub" style={{ display: "block" }}>
                        {statusLine(assistant, projects)}
                      </span>
                    </span>
                    <span
                      className="mcp-level-pill"
                      data-strong={assistant.level !== "READ_ONLY" && !assistant.revokedAt}
                    >
                      {levelName(assistant.level)}
                    </span>
                  </button>

                  <Popover
                    align="right"
                    width={190}
                    trigger={({ toggle }) => (
                      <button
                        className="epic-menu"
                        onClick={toggle}
                        aria-label={`Actions for ${assistant.name}`}
                        style={{ padding: "0 6px" }}
                      >
                        ⋯
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <button
                          className="menu-item"
                          onClick={() => {
                            save(
                              assistant.id,
                              { enabled: !assistant.enabled },
                              assistant.enabled ? "Paused" : "Resumed",
                            );
                            close();
                          }}
                        >
                          {assistant.enabled ? "Pause" : "Resume"}
                        </button>
                        <button
                          className="menu-item"
                          onClick={async () => {
                            close();
                            try {
                              const data = await api.post<{ key: string }>(
                                `/api/assistants/${assistant.id}`,
                              );
                              setNewKey({ id: assistant.id, name: assistant.name, key: data.key });
                              router.refresh();
                            } catch (err) {
                              error(err instanceof ApiError ? err.message : "Couldn't issue a key");
                            }
                          }}
                        >
                          New key
                        </button>
                        <div className="menu-sep" />
                        <button
                          className="menu-item"
                          style={{ color: "var(--danger)" }}
                          onClick={async () => {
                            close();
                            try {
                              await api.del(`/api/assistants/${assistant.id}`);
                              toast(`${assistant.name} revoked — its history stays`);
                              router.refresh();
                            } catch (err) {
                              error(err instanceof ApiError ? err.message : "Couldn't revoke it");
                            }
                          }}
                        >
                          Revoke key
                        </button>
                      </>
                    )}
                  </Popover>
                </div>
              ))}
            </div>
          </div>

          {selected && (
            <>
              <div className="mcp-panel">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ font: "600 14.5px var(--display)", letterSpacing: "-0.01em" }}>
                    What {selected.name} can do
                  </div>
                  <div
                    style={{
                      marginLeft: "auto",
                      font: "400 11px var(--sans)",
                      color: "var(--muted-2)",
                    }}
                  >
                    Move the level to change it
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {LEVELS.map((level) => {
                    const effective = selected.level === "CUSTOM" ? "HELPER" : selected.level;
                    const index = LEVELS.indexOf(level);
                    const at = LEVELS.indexOf(effective as Level);
                    const state = index < at ? "included" : index === at ? "current" : "above";
                    const copy = LEVEL_COPY[level];

                    return (
                      <button
                        key={level}
                        className="mcp-rung"
                        data-state={state}
                        onClick={() =>
                          save(selected.id, { level, capabilities: [] }, `${selected.name} is now ${copy.name}`)
                        }
                      >
                        <span className="mcp-tick" data-state={state} aria-hidden>
                          ✓
                        </span>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                            <span className="mcp-rung-name">{copy.name}</span>
                            {state === "current" && (
                              <span className="mcp-current-pill">
                                {selected.level === "CUSTOM" ? "Custom, based here" : "Current level"}
                              </span>
                            )}
                            {state === "included" && <span className="mcp-rung-note">included</span>}
                            <span style={{ marginLeft: "auto" }} />
                            {state === "current" && copy.recommended && (
                              <span
                                className="mcp-rung-note"
                                style={{ color: "oklch(0.85 0.04 128)" }}
                              >
                                recommended
                              </span>
                            )}
                            {state === "above" && (
                              <span style={{ font: "500 11px var(--sans)", color: "var(--accent)" }}>
                                Move up
                              </span>
                            )}
                          </span>
                          <span className="mcp-rung-blurb" style={{ display: "block" }}>
                            {copy.blurb}
                          </span>
                          {state === "current" && copy.asks && (
                            <span className="mcp-asks" style={{ display: "flex" }}>
                              <span className="mcp-asks-label">But asks you first before</span>
                              <span className="mcp-asks-body">{copy.asks}</span>
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mcp-offlimits">
                  <span className="cross" aria-hidden>
                    ✕
                  </span>
                  <div>
                    <div style={{ font: "600 12px var(--display)", color: "var(--text-2)" }}>
                      Off limits at every level
                    </div>
                    <div
                      style={{
                        font: "400 11.5px/1.65 var(--sans)",
                        color: "var(--muted)",
                        marginTop: 4,
                      }}
                    >
                      {OFF_LIMITS}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button
                    style={{ font: "500 11.5px var(--sans)", color: "var(--accent)" }}
                    onClick={() => setEditingTools(true)}
                  >
                    Edit one permission at a time
                  </button>
                  <span style={{ font: "400 11px var(--sans)", color: "var(--muted-2)" }}>
                    {tools.length} in total · editing makes this assistant custom
                  </span>
                </div>
              </div>

              <div className="mcp-rows">
                <div className="mcp-row">
                  <div className="grow">
                    <div className="mcp-row-name">Projects {selected.name} can see</div>
                  </div>
                  <Popover
                    align="right"
                    width={230}
                    trigger={({ toggle }) => (
                      <button className="mcp-chip" onClick={toggle}>
                        {selected.projectIds.length
                          ? projects
                              .filter((p) => selected.projectIds.includes(p.id))
                              .map((p) => p.name)
                              .join(", ")
                          : "All projects"}{" "}
                        ⌄
                      </button>
                    )}
                  >
                    {() => (
                      <>
                        <button
                          className="menu-item"
                          data-active={selected.projectIds.length === 0}
                          onClick={() => save(selected.id, { projectIds: [] })}
                        >
                          All projects
                        </button>
                        <div className="menu-sep" />
                        {projects.map((project) => {
                          const chosen = selected.projectIds.includes(project.id);
                          return (
                            <button
                              key={project.id}
                              className="menu-item"
                              data-active={chosen}
                              onClick={() =>
                                save(selected.id, {
                                  projectIds: chosen
                                    ? selected.projectIds.filter((id) => id !== project.id)
                                    : [...selected.projectIds, project.id],
                                })
                              }
                            >
                              <span className="mono" style={{ fontSize: 10 }}>
                                {project.key}
                              </span>
                              {project.name}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </Popover>
                </div>

                <div className="mcp-row">
                  <div className="grow">
                    <div className="mcp-row-name">Pause it if it gets carried away</div>
                    <div className="mcp-row-hint">
                      We stop the assistant rather than flood your board
                    </div>
                  </div>
                  <Popover
                    align="right"
                    width={180}
                    trigger={({ toggle }) => (
                      <button className="mcp-chip" onClick={toggle}>
                        {selected.ratePerHour} actions / hour ⌄
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {RATES.map((rate) => (
                          <button
                            key={rate}
                            className="menu-item"
                            data-active={selected.ratePerHour === rate}
                            onClick={() => {
                              save(selected.id, { ratePerHour: rate });
                              close();
                            }}
                          >
                            {rate} actions / hour
                          </button>
                        ))}
                      </>
                    )}
                  </Popover>
                </div>

                <div className="mcp-row">
                  <div className="grow">
                    <div className="mcp-row-name">Sign it out after</div>
                  </div>
                  <Popover
                    align="right"
                    width={180}
                    trigger={({ toggle }) => (
                      <button className="mcp-chip" onClick={toggle}>
                        {selected.idleHours === 0 ? "Never" : `${selected.idleHours} hours idle`} ⌄
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        {IDLE.map((hours) => (
                          <button
                            key={hours}
                            className="menu-item"
                            data-active={selected.idleHours === hours}
                            onClick={() => {
                              save(selected.id, { idleHours: hours });
                              close();
                            }}
                          >
                            {hours === 0 ? "Never" : `${hours} hours idle`}
                          </button>
                        ))}
                      </>
                    )}
                  </Popover>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  style={{ font: "500 11.5px var(--sans)", color: "var(--accent)" }}
                  onClick={() => setShowSchemas(true)}
                >
                  Advanced — raw tool schemas
                </button>
                <span style={{ font: "400 11px var(--sans)", color: "var(--muted-2)" }}>
                  for people who want the JSON
                </span>
              </div>
            </>
          )}
        </div>

        <aside className="mcp-aside">
          <div className="mcp-card">
            <div style={{ font: "600 13px var(--display)" }}>Connect a new assistant</div>
            <button className="mcp-download" onClick={() => setConnecting(true)}>
              <span className="glyph" aria-hidden>
                ↓
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="mcp-download-title" style={{ display: "block" }}>
                  Set up for Claude
                </span>
                <span className="mcp-download-sub" style={{ display: "block" }}>
                  One command, or a config file to drop in
                </span>
              </span>
            </button>
            <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--text-3)" }}>
              The key is shown once, when you connect. New assistants start on{" "}
              <b style={{ fontWeight: 600, color: "var(--text-2)" }}>Read only</b> until you raise
              them.
            </div>
            <div className="mcp-filename">
              <i aria-hidden />
              {endpoint.replace(/^https?:\/\//, "")}
              <i aria-hidden />
            </div>
            <div className="mcp-clients">
              {CLIENTS.map((option) => (
                <button
                  key={option.key}
                  data-active={client === option.key}
                  onClick={() => setClient(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <div className="mcp-card">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div style={{ font: "600 13px var(--display)" }}>What {selected.name} did today</div>
              </div>
              {selected.log.length === 0 && (
                <div style={{ font: "400 11px/1.6 var(--sans)", color: "var(--muted-2)" }}>
                  Nothing yet today.
                </div>
              )}
              {selected.log.map((entry) => (
                <div key={entry.id} className="mcp-log-row">
                  <span
                    className="mcp-log-dot"
                    data-bad={entry.outcome === "BLOCKED" || entry.outcome === "DENIED"}
                    aria-hidden
                  />
                  <div>
                    <div className="mcp-log-text">{entry.summary}</div>
                    <div className="mcp-log-meta">
                      <TimeAgo iso={entry.createdAt} /> · {outcomeWord(entry.outcome)}
                    </div>
                  </div>
                </div>
              ))}
              <div
                style={{
                  font: "400 10.5px/1.6 var(--sans)",
                  color: "var(--muted-2)",
                  paddingTop: 2,
                  borderTop: "1px solid var(--hover)",
                }}
              >
                Revoking a key keeps its history.
              </div>
            </div>
          )}

          <div className="mcp-card" style={{ background: "var(--surface)", gap: 7 }}>
            <div style={{ font: "600 12.5px var(--display)" }}>Not sure where to start?</div>
            <div style={{ font: "400 11px/1.65 var(--sans)", color: "var(--muted)" }}>
              Leave a new assistant on Read only for a week. The log above shows what it would have
              done, and you can raise it from there.
            </div>
          </div>
        </aside>
      </div>

      {connecting && (
        <ConnectModal client={client} onClose={() => setConnecting(false)} onCreate={connect} />
      )}

      {newKey && (
        <KeyModal
          name={newKey.name}
          apiKey={newKey.key}
          endpoint={endpoint}
          orgSlug={orgSlug}
          client={client}
          onClose={() => setNewKey(null)}
        />
      )}

      {editingTools && selected && (
        <ToolsModal
          assistant={selected}
          tools={tools}
          onClose={() => setEditingTools(false)}
          onSave={(capabilities) => {
            save(selected.id, { capabilities }, "Permissions saved");
            setEditingTools(false);
          }}
        />
      )}

      {showSchemas && (
        <Modal title="Raw tool schemas" onClose={() => setShowSchemas(false)}>
          <div className="mcp-snippet" style={{ maxHeight: 420 }}>
            {JSON.stringify(tools, null, 2)}
          </div>
        </Modal>
      )}

      {reviewing && selected && (
        <Modal title="Approve this?" onClose={() => setReviewing(null)}>
          <div style={{ font: "400 13px/1.6 var(--sans)", color: "var(--text-2)" }}>
            {reviewing.summary}
          </div>
          <div className="mcp-snippet">tool: {reviewing.tool}</div>
          <div style={{ display: "flex", gap: 9 }}>
            <button
              className="btn btn-outline grow"
              onClick={() => decide(assistantOf(assistants, reviewing.id), reviewing.id, "deny")}
            >
              No
            </button>
            <button
              className="btn btn-primary grow"
              onClick={() => decide(assistantOf(assistants, reviewing.id), reviewing.id, "approve")}
            >
              Approve and run it
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

/* ── helpers ──────────────────────────────────────────────── */

function assistantOf(assistants: AssistantRow[], approvalId: string) {
  return assistants.find((a) => a.pending.some((p) => p.id === approvalId))?.id ?? "";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function levelName(level: AssistantRow["level"]) {
  if (level === "CUSTOM") return "Custom";
  return LEVEL_COPY[level].name;
}

function outcomeWord(outcome: string) {
  return outcome === "AUTO"
    ? "on its own"
    : outcome === "APPROVED"
      ? "you approved"
      : outcome === "DENIED"
        ? "you said no"
        : outcome === "BLOCKED"
          ? "off limits"
          : outcome === "FAILED"
            ? "failed"
            : "read";
}

function statusLine(assistant: AssistantRow, projects: { id: string; name: string }[]) {
  const scope = assistant.projectIds.length
    ? projects
        .filter((p) => assistant.projectIds.includes(p.id))
        .map((p) => p.name)
        .join(", ")
    : "all projects";

  if (assistant.revokedAt) return `Revoked · ${assistant.actionsToday} actions today · ${scope}`;
  if (!assistant.enabled) return `Paused · ${assistant.actionsToday} actions today · ${scope}`;

  const seen = assistant.lastSeenAt ? new Date(assistant.lastSeenAt) : null;
  const idleMs = seen ? Date.now() - seen.getTime() : null;
  const when =
    idleMs === null
      ? "Never connected"
      : idleMs < 15 * 60_000
        ? "Working now"
        : `Idle ${humanGap(idleMs)}`;

  return `${when} · ${assistant.actionsToday} actions today · ${scope}`;
}

function humanGap(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Filled in after mount, so the server and client renders can't disagree. */
function TimeAgo({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(humanGap(Date.now() - new Date(iso).getTime()));
  }, [iso]);
  return <>{text ? `${text} ago` : ""}</>;
}

function ConnectModal({
  client,
  onClose,
  onCreate,
}: {
  client: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const label = CLIENTS.find((c) => c.key === client)?.label ?? "your client";

  return (
    <Modal title="Connect an assistant" onClose={onClose}>
      <div className="field">
        <label className="label" htmlFor="assistant-name">
          Name
        </label>
        <input
          id="assistant-name"
          className="input"
          autoFocus
          placeholder="Claude · Sam's laptop"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onCreate(name.trim())}
        />
      </div>
      <div style={{ font: "400 11.5px/1.7 var(--sans)", color: "var(--muted)" }}>
        This becomes a named member of your org — everything it does appears in the activity feed
        under this name. It starts on <b style={{ color: "var(--text-2)" }}>Read only</b>, set up
        for <b style={{ color: "var(--text-2)" }}>{label}</b>.
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <button className="btn btn-outline grow" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary grow"
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim())}
        >
          Connect
        </button>
      </div>
    </Modal>
  );
}

function KeyModal({
  name,
  apiKey,
  endpoint,
  orgSlug,
  client,
  onClose,
}: {
  name: string;
  apiKey: string;
  endpoint: string;
  orgSlug: string;
  client: string;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const command = `claude mcp add --transport http arc-${orgSlug} ${endpoint} --header "Authorization: Bearer ${apiKey}"`;
  const config = JSON.stringify(
    {
      mcpServers: {
        [`arc-${orgSlug}`]: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );

  const snippet = client === "CLAUDE_CODE" ? command : config;

  function copy(value: string, what: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => toast(`${what} copied`))
      .catch(() => toast("Couldn't reach the clipboard — select it and copy"));
  }

  function download() {
    const blob = new Blob([config], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arc-${orgSlug}.mcp.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal title={`${name} is connected`} onClose={onClose}>
      <div style={{ font: "400 12px/1.7 var(--sans)", color: "var(--muted)" }}>
        This key is shown once and never again. If you lose it, issue a new one from the ⋯ menu —
        the assistant keeps its level and its history.
      </div>

      <div className="mcp-key-box">{apiKey}</div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => copy(apiKey, "Key")}>
          Copy key
        </button>
        <button className="btn btn-ghost" onClick={() => copy(snippet, "Config")}>
          {client === "CLAUDE_CODE" ? "Copy command" : "Copy config"}
        </button>
        <button className="btn btn-ghost" onClick={download}>
          Download config
        </button>
      </div>

      <div className="eyebrow">
        {client === "CLAUDE_CODE" ? "Run this once" : "Add this to your client's MCP config"}
      </div>
      <div className="mcp-snippet">{snippet}</div>

      <button className="btn btn-primary" onClick={onClose}>
        Done
      </button>
    </Modal>
  );
}

function ToolsModal({
  assistant,
  tools,
  onClose,
  onSave,
}: {
  assistant: AssistantRow;
  tools: ToolInfo[];
  onClose: () => void;
  onSave: (capabilities: { tool: string; mode: "ALLOW" | "ASK" | "DENY" }[]) => void;
}) {
  const base: Level = assistant.level === "CUSTOM" ? "HELPER" : assistant.level;

  const [modes, setModes] = useState<Record<string, "ALLOW" | "ASK" | "DENY">>(() => {
    const start: Record<string, "ALLOW" | "ASK" | "DENY"> = {};
    for (const tool of tools) start[tool.name] = tool.modes[base];
    for (const override of assistant.capabilities) start[override.tool] = override.mode;
    return start;
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, ToolInfo[]>();
    for (const tool of tools) {
      const list = groups.get(tool.group) ?? [];
      list.push(tool);
      groups.set(tool.group, list);
    }
    return [...groups];
  }, [tools]);

  return (
    <Modal title="One permission at a time" onClose={onClose}>
      <div style={{ font: "400 11.5px/1.7 var(--sans)", color: "var(--muted)" }}>
        Allow runs without asking · Ask needs your approval each time · Deny hides the tool
        completely. Saving any change makes {assistant.name} custom.
      </div>

      <div style={{ maxHeight: 420, overflowY: "auto", paddingRight: 4 }}>
        {grouped.map(([group, list]) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              {group}
            </div>
            {list.map((tool) => (
              <div key={tool.name} className="mcp-tool-row">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="mcp-tool-name">{tool.title}</div>
                  <div className="mcp-tool-desc">{tool.description}</div>
                </div>
                <div className="mcp-modes">
                  {(["ALLOW", "ASK", "DENY"] as const).map((mode) => (
                    <button
                      key={mode}
                      data-mode={mode}
                      data-active={modes[tool.name] === mode}
                      onClick={() => setModes((m) => ({ ...m, [tool.name]: mode }))}
                    >
                      {mode === "ALLOW" ? "Allow" : mode === "ASK" ? "Ask" : "Deny"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 9 }}>
        <button className="btn btn-outline grow" onClick={() => onSave([])}>
          Reset to {LEVEL_COPY[base].name}
        </button>
        <button
          className="btn btn-primary grow"
          onClick={() =>
            onSave(tools.map((tool) => ({ tool: tool.name, mode: modes[tool.name] })))
          }
        >
          Save permissions
        </button>
      </div>
    </Modal>
  );
}

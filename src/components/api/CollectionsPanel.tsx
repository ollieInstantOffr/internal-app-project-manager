"use client";

import { useMemo, useState } from "react";
import { Popover } from "@/components/ui";
import type { ConsoleCollection, ConsoleRequest } from "./types";

export function CollectionsPanel({
  collections,
  repoFullName,
  activeId,
  onSelect,
  onNewRequest,
  onRunCollection,
  onRenameCollection,
  onDeleteCollection,
  onRenameRequest,
  onDuplicateRequest,
  onDeleteRequest,
  lastRun,
  running,
}: {
  collections: ConsoleCollection[];
  repoFullName: string | null;
  activeId: string | null;
  onSelect: (request: ConsoleRequest) => void;
  onNewRequest: (collectionId: string) => void;
  onRunCollection: (collection: ConsoleCollection) => void;
  onRenameCollection: (collection: ConsoleCollection) => void;
  onDeleteCollection: (collection: ConsoleCollection) => void;
  onRenameRequest: (request: ConsoleRequest) => void;
  onDuplicateRequest: (request: ConsoleRequest) => void;
  onDeleteRequest: (request: ConsoleRequest) => void;
  lastRun: {
    passed: number;
    failed: number;
    requestCount: number;
    createdAt: string;
    collectionId: string | null;
  } | null;
  running: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return collections;
    return collections
      .map((c) => ({
        ...c,
        requests: c.requests.filter((r) =>
          `${r.name} ${r.method} ${r.path}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((c) => c.requests.length > 0);
  }, [collections, filter]);

  // The run card describes whichever collection was last run, or the first one.
  const runTarget =
    collections.find((c) => c.id === lastRun?.collectionId) ?? collections[0] ?? null;

  return (
    <div className="console-collections">
      <div style={{ height: 62, flex: "none", display: "flex", alignItems: "center", padding: "0 16px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "600 14px var(--display)" }}>Collections</div>
          <div className="truncate" style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>
            {repoFullName ? `synced with ${repoFullName}` : "not linked to a repo"}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 12px 10px" }}>
        <input
          className="input input-sm"
          style={{ height: 32, background: "var(--card)", fontSize: 11.5 }}
          placeholder="Filter requests"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div
        className="scroll-y"
        style={{ flex: 1, padding: "0 8px", display: "flex", flexDirection: "column", gap: 2 }}
      >
        {shown.length === 0 && (
          <div style={{ padding: "16px 9px", font: "400 11.5px/1.6 var(--sans)", color: "var(--muted)" }}>
            {collections.length === 0
              ? "No collections yet. Import from the repo, or add a request by hand."
              : "Nothing matches that filter."}
          </div>
        )}

        {shown.map((collection) => {
          const isCollapsed = collapsed.includes(collection.id);
          return (
            <div key={collection.id}>
              <div className="tree-row">
                <button
                  className="folder-row"
                  onClick={() =>
                    setCollapsed((prev) =>
                      prev.includes(collection.id)
                        ? prev.filter((x) => x !== collection.id)
                        : [...prev, collection.id],
                    )
                  }
                >
                  <span style={{ font: "400 9px var(--sans)", color: "var(--muted-2)" }}>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                  <span className="truncate">{collection.name}</span>
                  <span
                    className="mono"
                    style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--faint)" }}
                  >
                    {collection.requests.length}
                  </span>
                </button>

                <Popover
                  align="right"
                  width={210}
                  trigger={({ toggle }) => (
                    <button
                      className="row-more"
                      onClick={toggle}
                      aria-label={`Manage ${collection.name}`}
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
                          onNewRequest(collection.id);
                          close();
                        }}
                      >
                        New request
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          onRenameCollection(collection);
                          close();
                        }}
                      >
                        Rename collection
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          onRunCollection(collection);
                          close();
                        }}
                      >
                        Run all
                      </button>
                      <div className="menu-sep" />
                      <button
                        className="menu-item"
                        style={{ color: "var(--danger)" }}
                        onClick={() => {
                          onDeleteCollection(collection);
                          close();
                        }}
                      >
                        Delete collection
                      </button>
                    </>
                  )}
                </Popover>
              </div>

              {!isCollapsed && (
                <>
                  {collection.requests.map((request) => (
                    <div className="tree-row" key={request.id}>
                      <button
                        className="request-row"
                        data-active={request.id === activeId}
                        onClick={() => onSelect(request)}
                        title={`${request.method} ${request.path}`}
                      >
                        <span className={`method-badge method-${request.method}`}>
                          {request.method === "DELETE" ? "DEL" : request.method}
                        </span>
                        <span className="truncate" style={{ flex: 1 }}>
                          {request.name}
                        </span>
                        {request.failing && (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "var(--danger-solid)",
                              flex: "none",
                            }}
                            title="Failed on the last run"
                          />
                        )}
                      </button>

                      <Popover
                        align="right"
                        width={200}
                        trigger={({ toggle }) => (
                          <button
                            className="row-more"
                            onClick={toggle}
                            aria-label={`Manage ${request.name}`}
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
                                onRenameRequest(request);
                                close();
                              }}
                            >
                              Rename
                            </button>
                            <button
                              className="menu-item"
                              onClick={() => {
                                onDuplicateRequest(request);
                                close();
                              }}
                            >
                              Duplicate
                            </button>
                            <div className="menu-sep" />
                            <button
                              className="menu-item"
                              style={{ color: "var(--danger)" }}
                              onClick={() => {
                                onDeleteRequest(request);
                                close();
                              }}
                            >
                              Delete request
                            </button>
                          </>
                        )}
                      </Popover>
                    </div>
                  ))}
                  <button
                    onClick={() => onNewRequest(collection.id)}
                    style={{
                      padding: "7px 9px 7px 20px",
                      font: "400 11px var(--sans)",
                      color: "var(--muted-2)",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    + New request
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {runTarget && (
        <div
          className="card"
          style={{
            margin: "10px 12px 14px",
            borderRadius: 13,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <button
            style={{ font: "600 11.5px var(--display)", textAlign: "left" }}
            onClick={() => onRunCollection(runTarget)}
            disabled={running}
          >
            {running ? "Running…" : `Run all · ${runTarget.name}`}
          </button>

          <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
            {lastRun
              ? `Last run ${timeAgo(lastRun.createdAt)} · ${lastRun.passed} of ${
                  lastRun.requestCount
                } passed`
              : `${runTarget.requests.length} request${
                  runTarget.requests.length === 1 ? "" : "s"
                } · never run`}
          </div>

          {lastRun && lastRun.requestCount > 0 && (
            <div style={{ display: "flex", gap: 3, height: 6, marginTop: 2 }}>
              {Array.from({ length: Math.min(lastRun.requestCount, 24) }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    borderRadius: 3,
                    background:
                      i < lastRun.passed ? "var(--success)" : "var(--danger-solid)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

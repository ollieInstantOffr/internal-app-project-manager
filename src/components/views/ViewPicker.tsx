"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover, Toggle } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { api, ApiError } from "@/lib/client";

export type SavedView = {
  id: string;
  name: string;
  scope: "BOARD" | "BACKLOG";
  projectId: string | null;
  filters: Record<string, unknown>;
  shared: boolean;
  isDefault: boolean;
  owner: { id: string; name: string } | null;
};

/**
 * Named filter sets. A view is private to whoever made it unless they share it,
 * and one per person per screen can be the default that loads automatically.
 *
 * Filters are opaque here — each screen decides its own shape and hands it over.
 */
export function ViewPicker<T extends Record<string, unknown>>({
  scope,
  projectId,
  filters,
  onApply,
  isEmpty,
  describe,
}: {
  scope: "BOARD" | "BACKLOG";
  projectId?: string | null;
  /** The screen's current filter state, saved as-is. */
  filters: T;
  onApply: (filters: T | null) => void;
  /** True when nothing is filtered, so we don't offer to save an empty view. */
  isEmpty: boolean;
  /** Short summary of the current filters, shown while saving. */
  describe?: (filters: T) => string;
}) {
  const { user } = useShell();
  const { toast, error } = useToast();

  const [views, setViews] = useState<SavedView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [shareIt, setShareIt] = useState(false);
  const applied = useRef(false);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ scope });
      if (projectId) query.set("projectId", projectId);
      const data = await api.get<{ views: SavedView[] }>(`/api/views?${query}`);
      setViews(data.views);
      return data.views;
    } catch {
      return [];
    }
  }, [scope, projectId]);

  // Load once, and apply the default — but only on first mount, so it can't
  // yank filters out from under someone mid-session.
  useEffect(() => {
    let alive = true;
    load().then((loaded) => {
      if (!alive || applied.current) return;
      applied.current = true;
      const fallback = loaded.find((v) => v.isDefault && v.owner?.id === user.id);
      if (fallback) {
        setActiveId(fallback.id);
        onApply(fallback.filters as T);
      }
    });
    return () => {
      alive = false;
    };
    // onApply is recreated each render by most callers; re-running would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, user.id]);

  async function save(close: () => void) {
    if (!name.trim()) return;
    try {
      const data = await api.post<{ view: SavedView }>("/api/views", {
        name: name.trim(),
        scope,
        projectId: projectId ?? null,
        filters,
        shared: shareIt,
      });
      setViews((prev) => [...prev, data.view]);
      setActiveId(data.view.id);
      setName("");
      setShareIt(false);
      setNaming(false);
      toast(`Saved "${data.view.name}"`);
      close();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't save that view");
    }
  }

  async function patch(view: SavedView, body: Record<string, unknown>, message?: string) {
    try {
      const data = await api.patch<{ view: SavedView }>(`/api/views/${view.id}`, body);
      setViews((prev) => prev.map((v) => (v.id === view.id ? data.view : v)));
      if (message) toast(message);
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't update that view");
    }
  }

  async function remove(view: SavedView) {
    setViews((prev) => prev.filter((v) => v.id !== view.id));
    if (activeId === view.id) {
      setActiveId(null);
      onApply(null);
    }
    try {
      await api.del(`/api/views/${view.id}`);
      toast(`Deleted "${view.name}"`);
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't delete that view");
      load();
    }
  }

  const active = views.find((v) => v.id === activeId) ?? null;

  return (
    <Popover
      align="right"
      width={272}
      trigger={({ toggle }) => (
        <button className="btn btn-ghost" onClick={toggle}>
          {active ? active.name : "Views"}
          {active?.shared && <span className="view-shared-dot" aria-label="shared" />} ⌄
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="eyebrow menu-label">Saved views</div>

          {views.length === 0 && (
            <div className="view-empty">Nothing saved yet. Filter the board, then save it here.</div>
          )}

          {views.map((view) => (
            <div key={view.id} className="view-row">
              <button
                className="menu-item grow"
                data-active={view.id === activeId}
                onClick={() => {
                  setActiveId(view.id);
                  onApply(view.filters as T);
                  close();
                }}
              >
                <span className="truncate">{view.name}</span>
                {view.owner?.id !== user.id && (
                  <span className="view-owner truncate">{view.owner?.name?.split(" ")[0]}</span>
                )}
                {view.isDefault && <span className="view-badge">default</span>}
              </button>

              {view.owner?.id === user.id && (
                <Popover
                  align="right"
                  width={180}
                  trigger={({ toggle }) => (
                    <button className="epic-menu" onClick={toggle} aria-label={`Manage ${view.name}`}>
                      ⋯
                    </button>
                  )}
                >
                  {(inner) => (
                    <>
                      <button
                        className="menu-item"
                        onClick={() => {
                          patch(view, { filters }, `"${view.name}" now matches these filters`);
                          inner();
                        }}
                      >
                        Update to current filters
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          patch(
                            view,
                            { isDefault: !view.isDefault },
                            view.isDefault ? "No longer your default" : `"${view.name}" is your default`,
                          );
                          inner();
                        }}
                      >
                        {view.isDefault ? "Clear default" : "Make default"}
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          patch(
                            view,
                            { shared: !view.shared },
                            view.shared ? "Now private to you" : "Shared with the org",
                          );
                          inner();
                        }}
                      >
                        {view.shared ? "Make private" : "Share with the org"}
                      </button>
                      <div className="menu-sep" />
                      <button
                        className="menu-item"
                        style={{ color: "var(--danger)" }}
                        onClick={() => {
                          remove(view);
                          inner();
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </Popover>
              )}
            </div>
          ))}

          <div className="menu-sep" />

          {activeId && (
            <button
              className="menu-item"
              onClick={() => {
                setActiveId(null);
                onApply(null);
                close();
              }}
            >
              Clear filters
            </button>
          )}

          {naming ? (
            <div className="view-save">
              <input
                className="input input-sm"
                autoFocus
                placeholder="My open bugs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save(close);
                  if (e.key === "Escape") setNaming(false);
                }}
                aria-label="View name"
              />
              {describe && <div className="view-describe">{describe(filters)}</div>}
              <div className="view-share-row">
                <Toggle on={shareIt} onChange={setShareIt} label="Share with the org" />
                <span>Share with the org</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => save(close)} disabled={!name.trim()}>
                Save view
              </button>
            </div>
          ) : (
            <button
              className="menu-item"
              disabled={isEmpty}
              title={isEmpty ? "Filter something first" : undefined}
              onClick={() => setNaming(true)}
            >
              Save current filters…
            </button>
          )}
        </>
      )}
    </Popover>
  );
}

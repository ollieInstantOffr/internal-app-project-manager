"use client";

import { useCallback, useEffect, useState } from "react";
import { Popover } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/client";

export type ReleaseOption = {
  id: string;
  name: string;
  releasedAt?: string | null;
  _count?: { issues: number; epics: number };
};

/**
 * Picks the version a piece of work ships in, or names a new one.
 *
 * Versions are rows rather than free text on each issue, so a name is spelled
 * one way across the project — but the names themselves are unconstrained, and
 * typing one that doesn't exist yet creates it.
 */
export function ReleasePicker({
  projectKey,
  value,
  onChange,
  align = "right",
  trigger,
}: {
  projectKey: string;
  value: { id: string; name: string } | null;
  onChange: (releaseId: string | null) => void;
  align?: "left" | "right";
  /** Defaults to the sidebar's field style. */
  trigger?: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
}) {
  const { error } = useToast();
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ releases: ReleaseOption[] }>(
        `/api/projects/${projectKey}/releases`,
      );
      setReleases(data.releases);
    } catch {
      setReleases([]);
    } finally {
      setLoaded(true);
    }
  }, [projectKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(name: string, close: () => void) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const data = await api.post<{ release: ReleaseOption }>(
        `/api/projects/${projectKey}/releases`,
        { name: trimmed },
      );
      setReleases((prev) =>
        prev.some((r) => r.id === data.release.id) ? prev : [data.release, ...prev],
      );
      setDraft("");
      onChange(data.release.id);
      close();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Couldn't create that version");
    }
  }

  const query = draft.trim().toLowerCase();
  const shown = query
    ? releases.filter((r) => r.name.toLowerCase().includes(query))
    : releases;
  const exact = releases.some((r) => r.name.toLowerCase() === query);

  return (
    <Popover
      align={align}
      width={230}
      trigger={
        trigger ??
        (({ toggle }) => (
          <button style={{ font: "500 12px var(--sans)" }} onClick={toggle}>
            {value ? (
              <span className="release-chip">{value.name}</span>
            ) : (
              <span style={{ color: "var(--muted-2)" }}>—</span>
            )}
          </button>
        ))
      }
    >
      {(close) => (
        <>
          <div style={{ padding: "6px 8px 4px" }}>
            <input
              className="input input-sm"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !draft.trim()) return;
                e.preventDefault();
                const match = releases.find((r) => r.name.toLowerCase() === query);
                if (match) {
                  onChange(match.id);
                  close();
                } else {
                  create(draft, close);
                }
              }}
              placeholder="1.1.1, v2, anything"
              aria-label="Version"
            />
          </div>

          {shown.map((release) => (
            <button
              key={release.id}
              className="menu-item"
              data-active={release.id === value?.id}
              onClick={() => {
                onChange(release.id);
                close();
              }}
            >
              <span className="grow truncate">{release.name}</span>
              {release._count && (
                <span className="mono release-count">
                  {release._count.issues + release._count.epics}
                </span>
              )}
            </button>
          ))}

          {loaded && !shown.length && !query && (
            <div className="release-empty">No versions yet. Type one above.</div>
          )}

          {query && !exact && (
            <button className="menu-item" onClick={() => create(draft, close)}>
              Create <b style={{ color: "var(--text)" }}>{draft.trim()}</b>
            </button>
          )}

          {value && (
            <>
              <div className="menu-sep" />
              <button
                className="menu-item"
                onClick={() => {
                  onChange(null);
                  close();
                }}
              >
                No version
              </button>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

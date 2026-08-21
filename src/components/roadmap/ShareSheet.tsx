"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Toggle } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, ApiError } from "@/lib/client";
import { accent } from "@/lib/constants";

export type SharePage = {
  id: string;
  enabled: boolean;
  headline: string;
  intro: string | null;
  detail: "QUARTERS" | "MONTHS" | "DATES";
  showShipped: boolean;
  showSubscribe: boolean;
  showProgress: boolean;
  showIssues: boolean;
  showAssignees: boolean;
  publishedAt: string | null;
  views: number;
};

export type ShareEpic = {
  id: string;
  name: string;
  color: string;
  status: string;
  publicVisible: boolean;
};

const DETAILS = [
  { value: "QUARTERS", label: "Quarters" },
  { value: "MONTHS", label: "Months" },
  { value: "DATES", label: "Dates" },
] as const;

/** 9a — everything the team decides before outsiders see anything. */
export function ShareSheet({
  projectKey,
  projectName,
  publicPath,
  origin,
  page: initialPage,
  epics: initialEpics,
  onClose,
}: {
  projectKey: string;
  projectName: string;
  /** e.g. "acme/web-app" — what follows the /r/ in the shared link. */
  publicPath: string;
  origin: string;
  page: SharePage;
  epics: ShareEpic[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast, error } = useToast();
  const [page, setPage] = useState(initialPage);
  const [epics, setEpics] = useState(initialEpics);
  const [saving, setSaving] = useState(false);

  const url = `${origin}/r/${publicPath}`;
  const visibleCount = useMemo(() => epics.filter((e) => e.publicVisible).length, [epics]);

  const set = (patch: Partial<SharePage>) => setPage((p) => ({ ...p, ...patch }));

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      error("Couldn't reach the clipboard — select the link and copy it");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/api/projects/${projectKey}/roadmap`, {
        enabled: page.enabled,
        headline: page.headline,
        intro: page.intro,
        detail: page.detail,
        showShipped: page.showShipped,
        showSubscribe: page.showSubscribe,
        showProgress: page.showProgress,
        showIssues: page.showIssues,
        showAssignees: page.showAssignees,
        epics: epics.map((e) => ({ id: e.id, publicVisible: e.publicVisible })),
      });
      toast(page.enabled ? "Roadmap published" : "Roadmap saved — still private");
      router.refresh();
      onClose();
    } catch (err) {
      error(err instanceof ApiError ? err.message : "Could not save the roadmap");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal share-sheet" role="dialog" aria-modal aria-label="Share roadmap">
        <header className="share-head">
          <div>
            <div className="share-title">Share roadmap</div>
            <div className="share-sub">
              {projectName} · {visibleCount} epic{visibleCount === 1 ? "" : "s"}
            </div>
          </div>
          <button
            style={{ marginLeft: "auto", fontSize: 15, color: "var(--muted-2)" }}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="share-body">
          <div className="share-toggle-card">
            <div className="share-toggle-row">
              <div className="grow">
                <div className="share-toggle-name">Public roadmap page</div>
                <div className="share-toggle-hint">
                  Anyone with the link can read it. No sign-in, no account.
                </div>
              </div>
              <Toggle
                on={page.enabled}
                onChange={(next) => set({ enabled: next })}
                label="Publish the roadmap"
              />
            </div>

            <div className="share-url">
              <div className="share-url-box">
                <span className="dim">{origin.replace(/^https?:\/\//, "")}/r/</span>
                <span>{publicPath}</span>
              </div>
              <button className="btn btn-white" onClick={copy}>
                Copy link
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="eyebrow">What visitors see</div>
            <div className="share-list">
              <div className="share-list-row">
                <div className="grow">
                  <div className="share-list-name">Timeline detail</div>
                  <div className="share-list-hint">
                    Quarters read as intent. Months read as a commitment.
                  </div>
                </div>
                <div className="share-seg">
                  {DETAILS.map((option) => (
                    <button
                      key={option.value}
                      data-active={page.detail === option.value}
                      onClick={() => set({ detail: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Row
                name="Shipped section"
                on={page.showShipped}
                onChange={(next) => set({ showShipped: next })}
              />
              <Row
                name="Email updates sign-up"
                on={page.showSubscribe}
                onChange={(next) => set({ showSubscribe: next })}
              />
              <Row
                name="Progress percentages"
                hint="62% means nothing to someone outside the sprint"
                on={page.showProgress}
                onChange={(next) => set({ showProgress: next })}
              />
              <Row
                name="Issue titles & links"
                on={page.showIssues}
                onChange={(next) => set({ showIssues: next })}
              />
              <Row
                name="Assignees"
                on={page.showAssignees}
                onChange={(next) => set({ showAssignees: next })}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="eyebrow">Epics on the public page</div>
            <div className="share-epics">
              {epics.length === 0 && (
                <div className="share-list-hint">
                  This project has no epics yet — the public page needs at least one.
                </div>
              )}
              {epics.map((epic) => (
                <button
                  key={epic.id}
                  className="share-epic"
                  data-on={epic.publicVisible}
                  aria-pressed={epic.publicVisible}
                  onClick={() =>
                    setEpics((prev) =>
                      prev.map((e) =>
                        e.id === epic.id ? { ...e, publicVisible: !e.publicVisible } : e,
                      ),
                    )
                  }
                >
                  <i style={{ background: accent(epic.color).base }} aria-hidden />
                  {epic.name}
                  {!epic.publicVisible && " · hidden"}
                </button>
              ))}
            </div>
            <div className="share-list-hint" style={{ lineHeight: 1.5 }}>
              Internal epics stay internal. Hidden ones leave no gap in the timeline.
            </div>
          </div>
        </div>

        <footer className="share-foot">
          <div className="grow" style={{ font: "400 11px var(--sans)", color: "var(--muted-2)" }}>
            {page.publishedAt
              ? `Published ${relative(page.publishedAt)} · ${page.views.toLocaleString()} view${
                  page.views === 1 ? "" : "s"
                }`
              : "Not published yet"}
          </div>
          <a
            className="btn btn-outline"
            href={`/r/${publicPath}?preview=1`}
            target="_blank"
            rel="noreferrer"
          >
            Preview page
          </a>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({
  name,
  hint,
  on,
  onChange,
}: {
  name: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="share-list-row" data-off={!on}>
      <div className="grow">
        <div className="share-list-name">{name}</div>
        {hint && <div className="share-list-hint">{hint}</div>}
      </div>
      <Toggle on={on} onChange={onChange} label={name} />
    </div>
  );
}

function relative(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

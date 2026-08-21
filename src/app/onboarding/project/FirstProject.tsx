"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { Radio, Check } from "@/components/ui";

type Repo = {
  fullName: string;
  name: string;
  language: string | null;
  openIssues: number;
  private: boolean;
};

export default function FirstProject({ githubConnected }: { githubConnected: boolean }) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(githubConnected);
  const [selected, setSelected] = useState<string | null>(null);
  const [emptyMode, setEmptyMode] = useState(!githubConnected);
  const [projectName, setProjectName] = useState("");
  const [bring, setBring] = useState({ issues: true, labels: true, closed: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!githubConnected) return;
    api
      .get<{ repos: Repo[] }>("/api/github/repos")
      .then((res) => {
        setRepos(res.repos.slice(0, 8));
        if (res.repos[0]) setSelected(res.repos[0].fullName);
        if (res.repos.length === 0) setEmptyMode(true);
      })
      .catch(() => setEmptyMode(true))
      .finally(() => setLoadingRepos(false));
  }, [githubConnected]);

  const repo = repos.find((r) => r.fullName === selected) ?? null;
  const derivedName = emptyMode
    ? projectName
    : projectName || (repo ? titleize(repo.name) : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!derivedName.trim()) {
      setError("Give the project a name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ project: { key: string } }>("/api/projects", {
        name: derivedName.trim(),
        repoFullName: emptyMode ? null : repo?.fullName,
        importIssues: !emptyMode && bring.issues,
        importLabels: !emptyMode && bring.labels,
        importClosed: !emptyMode && bring.closed,
      });
      router.push(`/projects/${res.project.key}/board`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <form
        onSubmit={submit}
        style={{
          flex: 1,
          padding: "40px 48px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          overflowY: "auto",
        }}
      >
        <h1 style={{ font: "600 25px var(--display)" }}>Create your first project</h1>
        <div style={{ font: "400 12.5px/1.6 var(--sans)", color: "var(--muted)", maxWidth: 460 }}>
          {githubConnected
            ? "Pick a repo. We create the project, turn open issues into a backlog, group labels into epics, and start watching branches."
            : "Name it and you're done. Connect GitHub later and branches will start moving issues on their own."}
        </div>

        {error && <div className="form-error" style={{ maxWidth: 500 }}>{error}</div>}

        {githubConnected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9, maxWidth: 500 }}>
            {loadingRepos && (
              <div className="card-tight" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                <span className="spin" /> Loading your repos…
              </div>
            )}

            {repos.map((r) => {
              const on = !emptyMode && selected === r.fullName;
              return (
                <button
                  key={r.fullName}
                  type="button"
                  onClick={() => {
                    setSelected(r.fullName);
                    setEmptyMode(false);
                  }}
                  style={{
                    borderRadius: 13,
                    background: on ? "var(--accent-wash)" : "var(--surface)",
                    boxShadow: on ? "0 0 0 1.5px var(--accent)" : "none",
                    padding: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <Radio on={on} />
                  <span className="grow">
                    <span style={{ display: "block", font: "600 12.5px var(--sans)" }}>
                      {r.fullName}
                    </span>
                    <span
                      style={{
                        display: "block",
                        font: "400 10.5px var(--mono)",
                        color: on ? "var(--accent-mono)" : "var(--muted-2)",
                        marginTop: 2,
                      }}
                    >
                      {[
                        `${r.openIssues} open issue${r.openIssues === 1 ? "" : "s"}`,
                        r.language,
                        r.private ? "private" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setEmptyMode(true)}
              className="inline-compose"
              style={{
                borderColor: emptyMode ? "var(--accent)" : undefined,
                color: emptyMode ? "var(--text)" : undefined,
                padding: 13,
                fontSize: 12,
              }}
            >
              Start an empty project instead
            </button>
          </div>
        )}

        <div className="field" style={{ maxWidth: 500 }}>
          <label className="label" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            className="input"
            required={emptyMode}
            placeholder={repo ? titleize(repo.name) : "Web app"}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>

        {!emptyMode && githubConnected && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
            <div style={{ font: "600 11.5px var(--display)", color: "var(--text-2)" }}>Bring over</div>
            <div style={{ display: "flex", gap: 10 }}>
              <BringToggle
                label="Open issues"
                on={bring.issues}
                onChange={(v) => setBring((b) => ({ ...b, issues: v }))}
              />
              <BringToggle
                label="Labels → epics"
                on={bring.labels}
                onChange={(v) => setBring((b) => ({ ...b, labels: v }))}
              />
              <BringToggle
                label="Closed (30d)"
                on={bring.closed}
                onChange={(v) => setBring((b) => ({ ...b, closed: v }))}
              />
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{
            maxWidth: 500,
            height: 46,
            borderRadius: 12,
            font: "600 13px var(--display)",
            marginTop: 4,
          }}
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="spin" /> Creating…
            </>
          ) : emptyMode || !githubConnected ? (
            "Create project"
          ) : (
            "Create project & import"
          )}
        </button>

        {!githubConnected && (
          <Link
            href="/api/auth/github?intent=connect"
            style={{ font: "400 11.5px var(--sans)", color: "var(--accent)" }}
          >
            Connect GitHub to seed from a repo →
          </Link>
        )}
      </form>

      <aside
        style={{
          width: 470,
          flex: "none",
          background: "var(--panel)",
          borderRadius: "18px 0 0 18px",
          borderLeft: "1px solid var(--line)",
          padding: "36px 34px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div className="eyebrow">Preview</div>

        <div
          style={{
            borderRadius: 14,
            background: "var(--card)",
            padding: 13,
            display: "flex",
            gap: 9,
            height: 210,
          }}
        >
          <PreviewColumn label="TRIAGE" filled={emptyMode ? 0 : 3} />
          <PreviewColumn label="TODO" filled={emptyMode ? 0 : 2} />
          <PreviewColumn label="PROGRESS" filled={emptyMode ? 0 : 1} accent />
        </div>

        <div style={{ font: "400 12px/1.6 var(--sans)", color: "var(--muted)" }}>
          {emptyMode
            ? "An empty board, ready for its first title. Invited teammates skip all of this — they land straight here."
            : `Open issues arrive in Triage${bring.labels ? ", each label becomes an epic" : ""}. Invited teammates skip all of this — they land straight on the board.`}
        </div>

        <div
          className="card"
          style={{ marginTop: "auto", borderRadius: 14, display: "flex", flexDirection: "column", gap: 6 }}
        >
          <div style={{ font: "600 11.5px var(--display)" }}>3 steps total</div>
          <div style={{ font: "400 11px/1.55 var(--sans)", color: "var(--muted)" }}>
            No required fields beyond a name. Everything else is inline-editable later.
          </div>
        </div>
      </aside>
    </div>
  );
}

function BringToggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "10px 12px",
        borderRadius: 11,
        background: "var(--surface)",
        font: "400 11.5px var(--sans)",
        color: on ? "var(--text)" : "var(--muted)",
      }}
    >
      <Check on={on} label={label} />
      {label}
    </button>
  );
}

function PreviewColumn({
  label,
  filled,
  accent,
}: {
  label: string;
  filled: number;
  accent?: boolean;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ font: "600 9.5px var(--mono)", color: "var(--muted-2)" }}>{label}</div>
      {Array.from({ length: Math.max(filled, 1) }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 30,
            borderRadius: 8,
            background:
              filled === 0
                ? "oklch(0.30 0.014 285 / 0.4)"
                : accent
                  ? "oklch(0.34 0.03 128)"
                  : "var(--hover-strong)",
            transition: "background 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}

function titleize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

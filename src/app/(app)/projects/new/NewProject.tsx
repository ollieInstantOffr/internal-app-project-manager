"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Check, Radio } from "@/components/ui";
import { ACCENT_NAMES, accent } from "@/lib/constants";
import { projectKeyFrom } from "@/lib/format";

type Repo = { fullName: string; name: string; language: string | null; openIssues: number };

export default function NewProject({ githubConnected }: { githubConnected: boolean }) {
  const router = useRouter();
  const { toast } = useToast();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [color, setColor] = useState<string>("lime");
  const [bring, setBring] = useState({ issues: true, labels: true, closed: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!githubConnected) return;
    api
      .get<{ repos: Repo[] }>("/api/github/repos")
      .then((res) => setRepos(res.repos.slice(0, 6)))
      .catch(() => {});
  }, [githubConnected]);

  const effectiveKey = keyTouched ? key : projectKeyFrom(name || "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ project: { key: string }; imported: { issues: number } }>(
        "/api/projects",
        {
          name: name.trim(),
          key: effectiveKey || undefined,
          color,
          repoFullName: selected,
          importIssues: !!selected && bring.issues,
          importLabels: !!selected && bring.labels,
          importClosed: !!selected && bring.closed,
        },
      );
      if (res.imported.issues) toast(`Imported ${res.imported.issues} issue${res.imported.issues === 1 ? "" : "s"}`);
      router.push(`/projects/${res.project.key}/board`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : "Couldn't create that",
      );
      setBusy(false);
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">New project</h1>
          <div className="panel-sub">Name it, pick a repo, done</div>
        </div>
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px" }}>
        <form onSubmit={submit} style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="form-error">{error}</div>}

          <div className="field">
            <label className="label" htmlFor="np-name">
              Name
            </label>
            <input
              id="np-name"
              className="input"
              autoFocus
              required
              placeholder="Mobile"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ width: 140 }}>
              <label className="label" htmlFor="np-key">
                Issue key
              </label>
              <input
                id="np-key"
                className="input"
                placeholder="MOB"
                value={effectiveKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                }}
              />
              <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
                Issues become {effectiveKey || "KEY"}-1, {effectiveKey || "KEY"}-2…
              </div>
            </div>

            <div className="field grow">
              <span className="label">Colour</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", height: 42 }}>
                {ACCENT_NAMES.filter((c) => c !== "slate").map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: accent(c).base,
                      boxShadow: color === c ? "0 0 0 2px var(--panel), 0 0 0 4px var(--accent)" : "none",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {githubConnected ? (
            <div className="field">
              <span className="label">Seed from a repo</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {repos.map((repo) => {
                  const on = selected === repo.fullName;
                  return (
                    <button
                      key={repo.fullName}
                      type="button"
                      onClick={() => {
                        setSelected(on ? null : repo.fullName);
                        if (!on && !name) setName(titleize(repo.name));
                      }}
                      style={{
                        borderRadius: 13,
                        background: on ? "var(--accent-wash)" : "var(--surface)",
                        boxShadow: on ? "0 0 0 1.5px var(--accent)" : "none",
                        padding: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        textAlign: "left",
                      }}
                    >
                      <Radio on={on} />
                      <span className="grow">
                        <span style={{ display: "block", font: "600 12.5px var(--sans)" }}>
                          {repo.fullName}
                        </span>
                        <span
                          className="mono"
                          style={{ display: "block", fontSize: 10.5, color: "var(--muted-2)", marginTop: 2 }}
                        >
                          {repo.openIssues} open · {repo.language ?? "—"}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {repos.length === 0 && (
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>
                    No repos you can push to were found.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card-dashed">
              <Link prefetch={false} href="/api/auth/github?intent=connect" className="link-accent">
                Connect GitHub
              </Link>{" "}
              to seed a project from a repo and let branches move issues on their own.
            </div>
          )}

          {selected && (
            <div className="field">
              <span className="label">Bring over</span>
              <div style={{ display: "flex", gap: 10 }}>
                {(
                  [
                    ["issues", "Open issues"],
                    ["labels", "Labels → epics"],
                    ["closed", "Closed (30d)"],
                  ] as const
                ).map(([field, label]) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => setBring((b) => ({ ...b, [field]: !b[field] }))}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "10px 12px",
                      borderRadius: 11,
                      background: "var(--surface)",
                      font: "400 11.5px var(--sans)",
                      color: bring[field] ? "var(--text)" : "var(--muted)",
                    }}
                  >
                    <Check on={bring[field]} label={label} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 9 }}>
            <Link href="/home" className="btn btn-outline" style={{ height: 44, borderRadius: 12, width: 110 }}>
              Cancel
            </Link>
            <button
              className="btn btn-primary"
              style={{ flex: 1, height: 44, borderRadius: 12, font: "600 13px var(--display)" }}
              disabled={busy || !name.trim()}
            >
              {busy ? <span className="spin" /> : selected ? "Create project & import" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function titleize(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

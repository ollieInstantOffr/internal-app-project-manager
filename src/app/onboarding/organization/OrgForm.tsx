"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { slugify } from "@/lib/format";

export default function OrgForm({
  suggestedName,
  githubLogin,
  githubConnected,
}: {
  suggestedName: string;
  githubLogin: string | null;
  githubConnected: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  useEffect(() => {
    if (effectiveSlug.length < 2) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>(
          `/api/orgs/slug-available?slug=${encodeURIComponent(effectiveSlug)}`,
        );
        setAvailability(res.available ? "free" : "taken");
      } catch {
        setAvailability("idle");
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [effectiveSlug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/orgs", {
        name,
        slug: effectiveSlug,
        githubOrg: githubConnected ? githubLogin : null,
      });
      router.push("/onboarding/invite");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : "Something went wrong",
      );
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ width: 460, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 16 }}
    >
      <h1 style={{ font: "600 24px var(--display)" }}>Name your organization</h1>
      <div style={{ font: "400 12.5px/1.6 var(--sans)", color: "var(--muted)", marginTop: -8 }}>
        Projects, boards and members live inside it. Renaming later is one click.
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label className="label" htmlFor="org-name">
          Name
        </label>
        <input
          id="org-name"
          className="input"
          required
          autoFocus
          placeholder={`${suggestedName}'s team`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="org-slug">
          Workspace URL
        </label>
        <div
          className="input"
          style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 13px" }}
        >
          <span style={{ font: "400 12.5px var(--mono)", color: "var(--muted-2)" }}>arc.dev/</span>
          <input
            id="org-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: "none",
              border: "none",
              outline: "none",
              font: "400 12.5px var(--mono)",
              color: "var(--text)",
              padding: 0,
            }}
          />
          <span
            style={{
              font: "400 10.5px var(--sans)",
              color:
                availability === "free"
                  ? "var(--success)"
                  : availability === "taken"
                    ? "var(--danger)"
                    : "var(--faint)",
              flex: "none",
              marginLeft: 8,
            }}
          >
            {availability === "checking"
              ? "checking…"
              : availability === "free"
                ? "available"
                : availability === "taken"
                  ? "taken"
                  : ""}
          </span>
        </div>
      </div>

      <div
        className="card"
        style={{
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid var(--line-strong)",
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: githubConnected ? "var(--white)" : "var(--hover-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 16 16"
            fill={githubConnected ? "var(--white-fg)" : "var(--muted)"}
            aria-hidden
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
        </div>
        <div className="grow">
          <div style={{ font: "600 12.5px var(--sans)" }}>Connect GitHub organization</div>
          <div style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
            {githubConnected
              ? `Connected as @${githubLogin} — branches and PRs will move issues`
              : "Links branches and PRs to issues automatically"}
          </div>
        </div>
        {githubConnected ? (
          <span className="pill pill-success">Connected</span>
        ) : (
          <Link className="btn btn-primary btn-sm" href="/api/auth/github?intent=connect">
            Connect
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: 9, marginTop: 4 }}>
        <Link className="btn btn-outline" href="/login" style={{ width: 92, height: 44, borderRadius: 12 }}>
          Back
        </Link>
        <button
          className="btn btn-primary"
          style={{ flex: 1, height: 44, borderRadius: 12, font: "600 13px var(--display)" }}
          disabled={busy || availability === "taken" || !name.trim()}
        >
          {busy ? <span className="spin" /> : "Continue"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Avatar } from "@/components/ui";
import { Role } from "@/lib/types";
import { slugify } from "@/lib/format";

export function General({
  org,
  profile,
}: {
  org: { name: string; slug: string; githubOrg: string | null };
  profile: { name: string; email: string; githubLogin: string | null; verified: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { role, user } = useShell();
  const isAdmin = role === Role.OWNER || role === Role.ADMIN;

  const [orgName, setOrgName] = useState(org.name);
  const [orgSlug, setOrgSlug] = useState(org.slug);
  const [name, setName] = useState(profile.name);
  const [githubLogin, setGithubLogin] = useState(profile.githubLogin ?? "");
  const [busy, setBusy] = useState<"org" | "profile" | null>(null);

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">General</h1>
          <div className="panel-sub">Your account and this organization</div>
        </div>
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px", gap: 14 }}>
        <section className="card" style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ font: "600 13px var(--display)" }}>Organization</h2>

          <form
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("org");
              try {
                await api.patch("/api/org", { name: orgName, slug: orgSlug });
                toast("Organization updated");
                router.refresh();
              } catch (err) {
                toast(err instanceof ApiError ? err.message : "Couldn't save that");
              } finally {
                setBusy(null);
              }
            }}
          >
            <div className="field">
              <label className="label" htmlFor="org-name">
                Name
              </label>
              <input
                id="org-name"
                className="input"
                value={orgName}
                disabled={!isAdmin}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="org-slug">
                Workspace URL
              </label>
              <div className="input" style={{ display: "flex", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 12.5, color: "var(--muted-2)" }}>
                  arc.dev/
                </span>
                <input
                  id="org-slug"
                  value={orgSlug}
                  disabled={!isAdmin}
                  onChange={(e) => setOrgSlug(slugify(e.target.value))}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    outline: "none",
                    font: "400 12.5px var(--mono)",
                    color: "var(--text)",
                  }}
                />
              </div>
            </div>

            {isAdmin && (
              <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy === "org"}>
                {busy === "org" ? <span className="spin" /> : "Save organization"}
              </button>
            )}
          </form>
        </section>

        <section className="card" style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ font: "600 13px var(--display)" }}>You</h2>

          <div className="row-flex" style={{ gap: 12 }}>
            <Avatar name={profile.name} hue={user.avatarHue} size={40} />
            <div>
              <div style={{ font: "600 13px var(--sans)" }}>{profile.name}</div>
              <div style={{ font: "400 11px var(--sans)", color: "var(--muted)" }}>
                {profile.email} <span style={{ color: "var(--success)" }}>· verified</span>
              </div>
              <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)", marginTop: 2 }}>
                Sign-in is passwordless — GitHub, or a link to this address.
              </div>
            </div>
          </div>

          <form
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("profile");
              try {
                await api.patch("/api/profile", { name, githubLogin: githubLogin || null });
                toast("Profile updated");
                router.refresh();
              } catch {
                toast("Couldn't save that");
              } finally {
                setBusy(null);
              }
            }}
          >
            <div className="field">
              <label className="label" htmlFor="me-name">
                Name
              </label>
              <input id="me-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field">
              <label className="label" htmlFor="me-github">
                GitHub handle
              </label>
              <input
                id="me-github"
                className="input"
                placeholder="your-github-handle"
                value={githubLogin}
                onChange={(e) => setGithubLogin(e.target.value.replace(/^@/, ""))}
              />
              <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
                Used to match your pushes and reviews to issues.
              </div>
            </div>

            <div style={{ display: "flex", gap: 9 }}>
              <button className="btn btn-primary" disabled={busy === "profile"}>
                {busy === "profile" ? <span className="spin" /> : "Save profile"}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  await api.post("/api/auth/logout");
                  router.push("/login");
                  router.refresh();
                }}
              >
                Sign out
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

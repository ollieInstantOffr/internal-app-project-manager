"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { Role } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/constants";

export default function InviteForm({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<Role>(Role.MEMBER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emails = raw
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!emails.length) {
      router.push("/onboarding/project");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/invites", { emails, role });
      router.push("/onboarding/project");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ width: 460, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 16 }}
    >
      <h1 style={{ font: "600 24px var(--display)" }}>Invite your team</h1>
      <div style={{ font: "400 12.5px/1.6 var(--sans)", color: "var(--muted)", marginTop: -8 }}>
        They&rsquo;ll land straight on the board — no setup on their side. Unlimited members on{" "}
        {orgName}, free.
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label className="label" htmlFor="emails">
          Emails
        </label>
        <textarea
          id="emails"
          className="textarea"
          autoFocus
          placeholder={"first@company.com\nsecond@company.com, third@company.com"}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
          {emails.length
            ? `${emails.length} address${emails.length === 1 ? "" : "es"} — separated by commas, spaces or newlines`
            : "Separate with commas, spaces or newlines"}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="role">
          Role
        </label>
        <select
          id="role"
          className="select"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {(Object.keys(ROLE_LABEL) as Role[])
            .filter((r) => r !== Role.OWNER)
            .map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 9, marginTop: 4 }}>
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: 92, height: 44, borderRadius: 12 }}
          onClick={() => router.push("/onboarding/project")}
        >
          Skip
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, height: 44, borderRadius: 12, font: "600 13px var(--display)" }}
          disabled={busy}
        >
          {busy ? <span className="spin" /> : emails.length ? `Send ${emails.length} invite${emails.length === 1 ? "" : "s"}` : "Continue"}
        </button>
      </div>
    </form>
  );
}

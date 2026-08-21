"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { Brand } from "@/components/AuthChrome";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(
    token ? null : "That link is missing its token — request a new one.",
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ next: string }>("/api/auth/reset", { token, password });
      router.push(res.next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.issues?.[0]?.message ?? err.message) : "Something went wrong",
      );
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <Brand />
      <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Choose a new password</h1>
      <div style={{ font: "400 12.5px/1.6 var(--sans)", color: "var(--muted)", marginTop: -6 }}>
        Signing in everywhere else will need the new one.
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="field" style={{ marginTop: 6 }}>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="confirm">
          Confirm
        </label>
        <input
          id="confirm"
          className="input"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-block" disabled={busy || !token}>
        {busy ? <span className="spin" /> : "Set password & sign in"}
      </button>

      <div style={{ font: "400 12px var(--sans)", color: "var(--muted)", textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

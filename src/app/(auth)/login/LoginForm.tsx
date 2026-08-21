"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { Brand, GithubButton } from "@/components/AuthChrome";

const OAUTH_MESSAGES: Record<string, string> = {
  github_not_configured: "GitHub sign-in isn't configured on this deployment yet.",
  oauth_state: "That GitHub sign-in expired. Try again.",
  oauth_token: "GitHub wouldn't hand over a token. Try again.",
  oauth_email: "GitHub didn't share a verified email address.",
};

export default function LoginForm({ oauthError }: { oauthError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_MESSAGES[oauthError] ?? "Sign-in failed. Try again.") : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ next: string }>("/api/auth/login", { email, password });
      router.push(res.next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <Brand />

      <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Welcome back</h1>
      <div style={{ font: "400 12.5px var(--sans)", color: "var(--muted)", marginTop: -6 }}>
        Free forever. Every feature, no seats.
      </div>

      <div style={{ marginTop: 6 }}>
        <GithubButton />
      </div>

      <div className="auth-rule">OR</div>

      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <div style={{ display: "flex" }}>
          <label className="label grow" htmlFor="password">
            Password
          </label>
          <Link
            href="/forgot-password"
            style={{ font: "400 10.5px var(--sans)", color: "var(--accent)" }}
          >
            Forgot?
          </Link>
        </div>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 4 }} disabled={busy}>
        {busy ? <span className="spin" /> : "Sign in"}
      </button>

      <div style={{ font: "400 12px var(--sans)", color: "var(--muted)", textAlign: "center" }}>
        New here?{" "}
        <Link href="/signup" style={{ color: "var(--accent)" }}>
          Create an account
        </Link>
      </div>
    </form>
  );
}

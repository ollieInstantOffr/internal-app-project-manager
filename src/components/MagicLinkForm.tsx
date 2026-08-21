"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/client";
import { Brand, GithubButton } from "@/components/AuthChrome";

const AUTH_MESSAGES: Record<string, string> = {
  github_not_configured: "GitHub sign-in isn't configured on this deployment yet.",
  oauth_state: "That GitHub sign-in expired. Try again.",
  oauth_token: "GitHub wouldn't hand over a token. Try again.",
  oauth_email: "GitHub didn't share a verified email address.",
  link_expired: "That sign-in link expired — they last 15 minutes. Here's a fresh start.",
  link_used: "That sign-in link was already used. Request another below.",
  link_invalid: "That sign-in link isn't valid. Request another below.",
  link_missing: "That link arrived without its token. Open it straight from the email.",
};

/**
 * Sign-in and sign-up are the same act now: prove you own an address. The only
 * difference is whether we ask for a name on the way through.
 */
export default function MagicLinkForm({
  mode,
  oauthError,
  redirectTo,
}: {
  mode: "signin" | "signup";
  oauthError?: string;
  redirectTo?: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError ? (AUTH_MESSAGES[oauthError] ?? "Sign-in failed. Try again.") : null,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ devLink?: string }>("/api/auth/magic-link", {
        email,
        name: mode === "signup" && name.trim() ? name.trim() : undefined,
        redirectTo,
      });
      setDevLink(res.devLink ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-form">
        <Brand />
        <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Check your email</h1>
        <div style={{ font: "400 12.5px/1.7 var(--sans)", color: "var(--muted)", marginTop: -6 }}>
          We sent a sign-in link to <span style={{ color: "var(--text)" }}>{email}</span>. It works
          once and expires in 15 minutes.
        </div>

        {devLink && (
          <div className="card card-accent" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ font: "600 12px var(--display)" }}>No mail provider configured</div>
            <div style={{ font: "400 11.5px/1.6 var(--sans)", color: "var(--accent-text)" }}>
              Set <span className="mono">RESEND_API_KEY</span> to send real email. For now, use this
              link:
            </div>
            <a className="btn btn-primary btn-block" href={devLink}>
              Sign in now
            </a>
          </div>
        )}

        <div className="card" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ font: "600 12px var(--display)" }}>Nothing arrived?</div>
          <div style={{ font: "400 11.5px/1.6 var(--sans)", color: "var(--muted)" }}>
            Check spam, and make sure the address is right. You can request another in a moment.
          </div>
        </div>

        <button
          className="btn btn-outline btn-block"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <Brand />

      <h1 style={{ font: "600 27px/1.2 var(--display)" }}>
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <div style={{ font: "400 12.5px var(--sans)", color: "var(--muted)", marginTop: -6 }}>
        Free forever. Every feature, no seats.
      </div>

      <div style={{ marginTop: 6 }}>
        <GithubButton intent={mode === "signup" ? "signup" : "signin"} />
      </div>

      <div className="auth-rule">OR</div>

      {error && <div className="form-error">{error}</div>}

      {mode === "signup" && (
        <div className="field">
          <label className="label" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}

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
          autoFocus={mode === "signin"}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 4 }} disabled={busy}>
        {busy ? <span className="spin" /> : "Email me a sign-in link"}
      </button>

      <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--faint)", textAlign: "center" }}>
        No password to choose, forget or leak.
      </div>

      <div style={{ font: "400 12px var(--sans)", color: "var(--muted)", textAlign: "center" }}>
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--accent)" }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--accent)" }}>
              Create an account
            </Link>
          </>
        )}
      </div>
    </form>
  );
}

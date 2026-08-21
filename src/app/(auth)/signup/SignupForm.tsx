"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { Brand, GithubButton } from "@/components/AuthChrome";

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ next: string }>("/api/auth/signup", { name, email, password });
      router.push(res.next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.issues?.[0]?.message ?? err.message)
          : "Something went wrong",
      );
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <Brand />

      <div className="steps" style={{ marginBottom: 4 }}>
        <div className="step" data-state="current">
          Account
        </div>
        <div className="step-line" />
        <div className="step">Organization</div>
        <div className="step-line" />
        <div className="step">Invite team</div>
      </div>

      <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Create your account</h1>
      <div style={{ font: "400 12.5px var(--sans)", color: "var(--muted)", marginTop: -6 }}>
        Free forever. Every feature, no seats.
      </div>

      <div style={{ marginTop: 6 }}>
        <GithubButton intent="signup" />
      </div>

      <div className="auth-rule">OR</div>

      {error && <div className="form-error">{error}</div>}

      <div className="field">
        <label className="label" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          className="input"
          required
          autoComplete="name"
          placeholder="Sam Okafor"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          required
          autoComplete="email"
          placeholder="sam@acme.dev"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">
          Password
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
        <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
          At least 8 characters.
        </div>
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 4 }} disabled={busy}>
        {busy ? <span className="spin" /> : "Continue"}
      </button>

      <div style={{ font: "400 12px var(--sans)", color: "var(--muted)", textAlign: "center" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </div>
    </form>
  );
}

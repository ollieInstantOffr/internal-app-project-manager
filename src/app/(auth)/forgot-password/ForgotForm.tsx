"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Brand } from "@/components/AuthChrome";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await api.post("/api/auth/forgot", { email }).catch(() => {});
    setSent(true);
    setBusy(false);
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <Brand />
      <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Reset your password</h1>
      <div style={{ font: "400 12.5px/1.6 var(--sans)", color: "var(--muted)", marginTop: -6 }}>
        Enter the address you sign in with and we&rsquo;ll send a link.
      </div>

      {sent ? (
        <div className="form-ok" style={{ marginTop: 8 }}>
          If an account exists for {email}, a reset link is on its way. It expires in an hour.
        </div>
      ) : (
        <>
          <div className="field" style={{ marginTop: 6 }}>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <span className="spin" /> : "Send reset link"}
          </button>
        </>
      )}

      <div style={{ font: "400 12px var(--sans)", color: "var(--muted)", textAlign: "center" }}>
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Back to sign in
        </Link>
      </div>
    </form>
  );
}

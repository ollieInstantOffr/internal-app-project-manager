"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";

export default function AcceptInvite({
  token,
  inviteEmail,
  signedInAs,
}: {
  token: string;
  inviteEmail: string;
  signedInAs: { email: string; name: string } | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = signedInAs && signedInAs.email !== inviteEmail;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ next: string }>("/api/invites/accept", { token });
      router.push(res.next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (!signedInAs) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        <Link className="btn btn-primary btn-block" href={`/signup?invite=${token}`}>
          Create an account
        </Link>
        <Link className="btn btn-outline btn-block" href={`/login?invite=${token}`}>
          I already have one
        </Link>
        <div style={{ font: "400 10.5px var(--sans)", color: "var(--faint)", textAlign: "center" }}>
          Use {inviteEmail} so the invite matches.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
      {error && <div className="form-error">{error}</div>}

      {mismatch && (
        <div className="form-error">
          You&rsquo;re signed in as {signedInAs.email}, but this invite is for {inviteEmail}.
        </div>
      )}

      <button className="btn btn-primary btn-block" onClick={accept} disabled={busy || !!mismatch}>
        {busy ? <span className="spin" /> : `Accept as ${signedInAs.name}`}
      </button>

      {mismatch && (
        <form action="/api/auth/logout" method="post" onSubmit={async (e) => {
          e.preventDefault();
          await api.post("/api/auth/logout");
          router.refresh();
        }}>
          <button className="btn btn-outline btn-block">Sign in with a different account</button>
        </form>
      )}
    </div>
  );
}

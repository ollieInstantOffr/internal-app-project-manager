"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client";

/**
 * Approving connects a named assistant at read-only. Saying so plainly is the
 * point of the screen — a consent dialog nobody reads grants exactly as much as
 * one they do.
 */
export function Consent({
  clientName,
  clientUri,
  orgName,
  userName,
  startsAt,
  startsBlurb,
  offLimits,
  params,
}: {
  clientName: string;
  clientUri: string | null;
  orgName: string;
  userName: string;
  startsAt: string;
  startsBlurb: string;
  offLimits: string;
  params: Record<string, string>;
}) {
  const [name, setName] = useState(`${clientName} · ${userName.split(" ")[0]}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      const data = await api.post<{ redirectTo: string }>("/api/oauth/authorize", {
        ...params,
        assistantName: name.trim() || clientName,
        approve,
      });
      // Leaving Arc entirely, so a full page navigation rather than a route push.
      window.location.href = data.redirectTo;
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="pub-shell">
      <div className="consent">
        <div className="consent-mark">A</div>
        <h1 className="consent-title">
          Connect <b>{clientName}</b> to {orgName}?
        </h1>

        <p className="consent-lede">
          It will join as a named member and appear in your activity feed. Everything it does is
          logged, and you can revoke it in one click.
        </p>

        <div className="consent-block">
          <div className="eyebrow">It starts at</div>
          <div className="consent-level">{startsAt}</div>
          <div className="consent-detail">{startsBlurb}</div>
          <div className="consent-detail" style={{ marginTop: 8 }}>
            Raise it later in Settings → MCP Server. Approving here grants nothing more.
          </div>
        </div>

        <div className="consent-block">
          <div className="eyebrow">Off limits at every level</div>
          <div className="consent-detail">{offLimits}</div>
        </div>

        <div className="field">
          <label className="label" htmlFor="assistant-name">
            Name it
          </label>
          <input
            id="assistant-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>

        {problem && <div className="form-error">{problem}</div>}

        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-outline grow" disabled={busy} onClick={() => decide(false)}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy} onClick={() => decide(true)}>
            {busy ? <span className="spin" /> : "Connect at read-only"}
          </button>
        </div>

        {clientUri && (
          <div className="consent-foot">
            Requested by <span className="mono">{new URL(clientUri).host}</span>
          </div>
        )}
      </div>
    </main>
  );
}

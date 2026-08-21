"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client";

type Mode = "idle" | "sent" | "error";

/** "Know when it ships" — and the same box doubles as the feature-request form. */
export function SubscribeBox({
  pageId,
  showSubscribe,
  confirmed,
}: {
  pageId: string;
  showSubscribe: boolean;
  confirmed: boolean;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [asking, setAsking] = useState(!showSubscribe);
  const [mode, setMode] = useState<Mode>(confirmed ? "sent" : "idle");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`/api/public/roadmap/${pageId}/subscribe`, {
        email: email.trim(),
        message: asking ? message.trim() || null : null,
      });
      setMode("sent");
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "Something went wrong");
      setMode("error");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "sent") {
    return (
      <div className="pub-subscribe">
        <h2>{confirmed ? "You're subscribed" : "Check your inbox"}</h2>
        <p>
          {confirmed
            ? "We'll send one short email whenever something on this page moves."
            : asking
              ? "Thanks — the team has your request. Confirm the email we just sent to get updates too."
              : "Open the link we just sent and you're subscribed. Nothing else, we promise."}
        </p>
      </div>
    );
  }

  return (
    <div className="pub-subscribe">
      <h2>{asking ? "Tell us what's missing" : "Know when it ships"}</h2>
      <p>
        {asking
          ? "Say what you'd want to see on this roadmap. It goes straight to the team."
          : "One short email when something on this page moves. Nothing else."}
      </p>

      {asking && (
        <textarea
          className="pub-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would make this better?"
          aria-label="Your request"
          maxLength={1000}
        />
      )}

      <input
        className="pub-input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="you@company.com"
        aria-label="Your email address"
      />

      <button className="pub-submit" onClick={submit} disabled={busy || !email.trim()}>
        {busy ? "Sending…" : asking ? "Send it" : "Subscribe"}
      </button>

      {problem && <div className="pub-note" style={{ color: "var(--danger)" }}>{problem}</div>}

      {showSubscribe && (
        <div className="pub-note">
          {asking ? (
            <>
              Just want updates? <button onClick={() => setAsking(false)}>Subscribe instead.</button>
            </>
          ) : (
            <>
              Have a request? <button onClick={() => setAsking(true)}>Tell us what&apos;s missing.</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

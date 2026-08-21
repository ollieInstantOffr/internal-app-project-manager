"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Toggle } from "@/components/ui";

export type Prefs = {
  emailMentions: boolean;
  emailAssigned: boolean;
  emailBlocking: boolean;
  emailCiFailures: boolean;
  emailDigest: boolean;
};

const ROWS: { key: keyof Prefs; title: string; detail: string }[] = [
  {
    key: "emailMentions",
    title: "Mentions",
    detail: "Someone writes @you in a comment.",
  },
  {
    key: "emailAssigned",
    title: "Assigned to you",
    detail: "An issue lands in your queue.",
  },
  {
    key: "emailBlocking",
    title: "You're blocking someone",
    detail: "Another issue can't move until yours does.",
  },
  {
    key: "emailCiFailures",
    title: "CI failures",
    detail: "A check goes red on a branch you watch. Off by default — it's noisy.",
  },
  {
    key: "emailDigest",
    title: "Daily digest",
    detail: "One morning email with everything that needs you.",
  },
];

export function Notifications({ initial, email }: { initial: Prefs; email: string }) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState(initial);
  const [sending, setSending] = useState(false);

  async function update(key: keyof Prefs, value: boolean) {
    const previous = prefs;
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      await api.patch("/api/prefs", { [key]: value });
    } catch {
      setPrefs(previous);
      toast("Couldn't save that preference");
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Notifications</h1>
          <div className="panel-sub">Everything still lands in My work — this is only email</div>
        </div>
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px", gap: 14 }}>
        <section className="card" style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="eyebrow">Email to {email}</div>

          {ROWS.map((row) => (
            <div key={row.key} className="row-flex" style={{ gap: 14, alignItems: "flex-start" }}>
              <div style={{ paddingTop: 2 }}>
                <Toggle
                  on={prefs[row.key]}
                  label={row.title}
                  onChange={(next) => update(row.key, next)}
                />
              </div>
              <div className="grow">
                <div style={{ font: "500 12.5px var(--sans)" }}>{row.title}</div>
                <div style={{ font: "400 11px/1.6 var(--sans)", color: "var(--muted)" }}>
                  {row.detail}
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="card" style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 11 }}>
          <h2 style={{ font: "600 13px var(--display)" }}>Send yourself a digest</h2>
          <p style={{ font: "400 11px/1.6 var(--sans)", color: "var(--muted)", margin: 0 }}>
            Runs the real digest job for your account and emails the result — useful for checking
            the Resend setup end to end.
          </p>
          <button
            className="btn btn-ghost"
            style={{ alignSelf: "flex-start" }}
            disabled={sending}
            onClick={async () => {
              setSending(true);
              try {
                const res = await api.post<{ sent: number; skipped?: boolean }>("/api/digest/me");
                toast(
                  res.skipped
                    ? "Nothing needs you right now — no digest sent"
                    : "Digest sent",
                );
              } catch {
                toast("Couldn't send the digest");
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? <span className="spin" /> : "Send test digest"}
          </button>
        </section>
      </div>
    </main>
  );
}

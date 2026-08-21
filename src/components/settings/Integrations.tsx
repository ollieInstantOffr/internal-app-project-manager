"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useShell } from "@/components/shell/context";
import { Toggle, Modal, Popover } from "@/components/ui";
import { Role, RuleAction, RuleTrigger } from "@/lib/types";

export type Rule = {
  id: string;
  trigger: RuleTrigger;
  action: RuleAction;
  enabled: boolean;
  label: string;
  builtIn: boolean;
};

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  owner: string;
  lastUsedAt: string | null;
};

const TRIGGER_LABEL: Record<RuleTrigger, string> = {
  BRANCH_PUSHED: "Branch pushed",
  PR_OPENED: "PR opened",
  PR_MERGED: "PR merged",
  CI_FAILED: "CI red",
  ISSUE_CREATED: "Issue created",
};

const ACTION_LABEL: Record<RuleAction, string> = {
  SET_IN_PROGRESS: "move to In progress",
  SET_IN_REVIEW: "move to In review",
  SET_DONE: "move to Done",
  COMMENT_ON_ISSUE: "comment on the issue",
  ADD_WATCHERS: "add reviewers as watchers",
  ASSIGN_TO_ACTOR: "assign to whoever pushed",
};

export function Integrations({
  rules,
  tokens,
  github,
  usage,
  sampleIssueKey,
}: {
  sampleIssueKey: string | null;
  rules: Rule[];
  tokens: TokenRow[];
  github: {
    connected: boolean;
    account: string | null;
    repos: string[];
    oauthConfigured: boolean;
    webhookConfigured: boolean;
  };
  usage: { issues: number; attachmentsMb: number; apiCalls: number };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { role } = useShell();
  const isAdmin = role === Role.OWNER || role === Role.ADMIN;

  const [addingRule, setAddingRule] = useState(false);
  const [managingTokens, setManagingTokens] = useState(false);

  async function toggleRule(rule: Rule, enabled: boolean) {
    try {
      await api.patch(`/api/rules/${rule.id}`, { enabled });
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change that rule");
    }
  }

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Integrations</h1>
          <div className="panel-sub">Automations are what keep status accurate</div>
        </div>
      </header>

      <div className="panel-body settings-split">
        <div className="settings-main">
          <section className="card" style={{ padding: 17, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="row-flex" style={{ gap: 13 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: github.connected ? "var(--white)" : "var(--hover-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "none",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 16 16"
                  fill={github.connected ? "var(--white-fg)" : "var(--muted)"}
                  aria-hidden
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
              </span>

              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ font: "600 14px var(--display)" }}>GitHub</div>
                <div className="truncate" style={{ font: "400 10.5px var(--sans)", color: "var(--muted)" }}>
                  {github.connected
                    ? `${github.account ?? "github.com"} · ${github.repos.length} repo${
                        github.repos.length === 1 ? "" : "s"
                      } linked`
                    : github.oauthConfigured
                      ? "Not connected yet"
                      : "Set GITHUB_CLIENT_ID to enable"}
                </div>
              </div>

              {github.connected ? (
                <span className="pill pill-success" style={{ fontWeight: 600, fontSize: 10.5, padding: "4px 12px" }}>
                  Connected
                </span>
              ) : (
                <Link
                  className="btn btn-primary btn-sm"
                  href="/api/auth/github?intent=connect"
                  aria-disabled={!github.oauthConfigured}
                >
                  Connect
                </Link>
              )}
            </div>

            <div className="divider" />

            <div className="eyebrow">Automations</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {rules.map((rule) => (
                <div key={rule.id} className="row-flex" style={{ gap: 12 }}>
                  <Toggle
                    on={rule.enabled}
                    label={rule.label}
                    onChange={isAdmin ? (next) => toggleRule(rule, next) : undefined}
                  />
                  <span className="grow" style={{ font: "400 12px var(--sans)" }}>
                    <RuleLabel label={rule.label} muted={!rule.enabled} />
                  </span>
                  {!rule.builtIn && isAdmin && (
                    <button
                      aria-label="Delete rule"
                      style={{ color: "var(--muted-2)" }}
                      onClick={async () => {
                        await api.del(`/api/rules/${rule.id}`).catch(() => {});
                        router.refresh();
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {isAdmin && (
                <button
                  style={{ font: "500 11.5px var(--sans)", color: "var(--accent)", alignSelf: "flex-start" }}
                  onClick={() => setAddingRule(true)}
                >
                  + Add rule
                </button>
              )}
            </div>

            {github.connected && isAdmin && <RuleTester sampleKey={sampleIssueKey} />}
          </section>

          <section
            className="card"
            style={{ padding: 17, background: "oklch(0.265 0.012 285)", display: "flex", flexDirection: "column", gap: 13 }}
          >
            <div className="eyebrow">Available</div>

            <AvailableRow
              name="Slack"
              detail="Mentions, blocked issues, sprint start"
              action="Connect"
              onClick={() => toast("Slack isn't wired up on this deployment yet")}
            />
            <AvailableRow
              name="GitLab"
              detail="Same automations as GitHub"
              action="Connect"
              onClick={() => toast("GitLab isn't wired up on this deployment yet")}
            />
            <AvailableRow
              name="CLI & API tokens"
              detail={`${tokens.length} active token${tokens.length === 1 ? "" : "s"}`}
              action="Manage"
              onClick={() => setManagingTokens(true)}
            />
          </section>
        </div>

        <div className="settings-aside">
          <section className="card card-accent" style={{ padding: 17, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row-flex" style={{ gap: 8 }}>
              <h2 style={{ font: "600 14px var(--display)" }}>Free plan</h2>
              <span className="pill pill-accent" style={{ marginLeft: "auto", fontSize: 10 }}>
                Active
              </span>
            </div>
            <p style={{ font: "400 11.5px/1.65 var(--sans)", color: "var(--accent-text)", margin: 0 }}>
              Every feature. Unlimited members, projects and history. No card on file, nothing to
              upgrade.
            </p>
          </section>

          <section className="card" style={{ padding: 17, display: "flex", flexDirection: "column", gap: 13 }}>
            <div className="eyebrow">Usage this month</div>
            <UsageBar label="Issues created" value={usage.issues.toLocaleString()} pct={Math.min(100, usage.issues / 10)} color="var(--accent)" />
            <UsageBar
              label="Attachments"
              value={`${usage.attachmentsMb.toFixed(1)} MB`}
              pct={Math.min(100, usage.attachmentsMb / 20)}
              color="var(--blue)"
            />
            <UsageBar
              label="API calls"
              value={usage.apiCalls.toLocaleString()}
              pct={Math.min(100, usage.apiCalls / 500)}
              color="var(--amber)"
            />
            <div style={{ font: "400 10px var(--sans)", color: "var(--faint)" }}>
              Shown for transparency — these are not limits.
            </div>
          </section>

          <div className="card-dashed" style={{ marginTop: "auto", fontSize: 10.5, lineHeight: 1.6 }}>
            No pricing page in-app. If paid tiers ever ship, this column becomes Billing and nothing
            else moves.
          </div>
        </div>
      </div>

      {addingRule && <AddRuleModal onClose={() => setAddingRule(false)} />}
      {managingTokens && <TokensModal tokens={tokens} onClose={() => setManagingTokens(false)} />}
    </main>
  );
}

/** Renders the `**bold**` and `` `code` `` markers the rule labels carry. */
function RuleLabel({ label, muted }: { label: string; muted: boolean }) {
  const parts = label.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span style={{ color: muted ? "var(--muted)" : "var(--text)" }}>
      {parts.map((part, i) => {
        if (part.startsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
        if (part.startsWith("`"))
          return (
            <span
              key={i}
              className="mono"
              style={{ fontSize: 11, background: "var(--hover)", borderRadius: 4, padding: "1px 5px" }}
            >
              {part.slice(1, -1)}
            </span>
          );
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function AvailableRow({
  name,
  detail,
  action,
  onClick,
}: {
  name: string;
  detail: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="row-flex" style={{ gap: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--hover-strong)", flex: "none" }} />
      <div className="grow">
        <div style={{ font: "500 12px var(--sans)" }}>{name}</div>
        <div style={{ font: "400 10px var(--sans)", color: "var(--muted-2)" }}>{detail}</div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ fontWeight: 600 }} onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function UsageBar({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "400 11px var(--sans)",
          color: "var(--text-3)",
        }}
      >
        <span>{label}</span>
        <span className="mono">{value}</span>
      </div>
      <div className="bar" style={{ height: 6, marginTop: 5 }}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Fires a real automation against a real issue, so the rules can be seen working. */
function RuleTester({ sampleKey }: { sampleKey: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [issueKey, setIssueKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function fire(event: string) {
    if (!issueKey.trim()) {
      toast(sampleKey ? `Name an issue first, e.g. ${sampleKey}` : "Create an issue first");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/webhooks/github/simulate", {
        issueKey: issueKey.trim().toUpperCase(),
        event,
      });
      toast(`${event} applied to ${issueKey.trim().toUpperCase()}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't run that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="divider" />
      <div className="eyebrow">Try an automation</div>
      <div className="row-flex" style={{ gap: 8, flexWrap: "wrap" }}>
        <input
          className="input input-sm"
          style={{ width: 130 }}
          placeholder={sampleKey ?? "ABC-1"}
          value={issueKey}
          onChange={(e) => setIssueKey(e.target.value)}
        />
        <Popover
          width={200}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle} disabled={busy}>
              {busy ? <span className="spin" /> : "Fire a git event"}
            </button>
          )}
        >
          {(close) =>
            (
              [
                ["push", "Push a branch"],
                ["pr-open", "Open a PR"],
                ["pr-merge", "Merge the PR"],
                ["ci-fail", "Fail CI"],
                ["ci-pass", "Pass CI"],
              ] as const
            ).map(([event, label]) => (
              <button
                key={event}
                className="menu-item"
                onClick={() => {
                  fire(event);
                  close();
                }}
              >
                {label}
              </button>
            ))
          }
        </Popover>
        <span style={{ font: "400 10.5px var(--sans)", color: "var(--faint)" }}>
          Runs the same code path a real GitHub delivery takes.
        </span>
      </div>
    </>
  );
}

function AddRuleModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [trigger, setTrigger] = useState<RuleTrigger>(RuleTrigger.BRANCH_PUSHED);
  const [action, setAction] = useState<RuleAction>(RuleAction.ASSIGN_TO_ACTOR);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="New automation rule" onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post("/api/rules", { trigger, action });
            onClose();
            router.refresh();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Couldn't create that rule");
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor="rule-trigger">
            When
          </label>
          <select
            id="rule-trigger"
            className="select"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as RuleTrigger)}
          >
            {(Object.keys(TRIGGER_LABEL) as RuleTrigger[]).map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="rule-action">
            Then
          </label>
          <select
            id="rule-action"
            className="select"
            value={action}
            onChange={(e) => setAction(e.target.value as RuleAction)}
          >
            {(Object.keys(ACTION_LABEL) as RuleAction[]).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>

        <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--faint)" }}>
          Rules match issues by the key in the branch name or PR title, e.g.{" "}
          <span className="mono">feat/WEB-408-auth</span>.
        </div>

        <div style={{ display: "flex", gap: 9 }}>
          <button type="button" className="btn btn-outline grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" disabled={busy}>
            {busy ? <span className="spin" /> : "Add rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TokensModal({ tokens, onClose }: { tokens: TokenRow[]; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="API tokens" onClose={onClose}>
      {secret && (
        <div className="form-ok" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>Copy this now — it isn&rsquo;t shown again.</div>
          <code
            className="mono"
            style={{ fontSize: 11, wordBreak: "break-all", background: "rgba(0,0,0,.25)", padding: 8, borderRadius: 8 }}
          >
            {secret}
          </code>
          <button
            className="btn btn-white btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              navigator.clipboard?.writeText(secret);
              toast("Token copied");
            }}
          >
            Copy
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {tokens.map((token) => (
          <div key={token.id} className="row-flex card-tight" style={{ background: "var(--raised)" }}>
            <div className="grow">
              <div style={{ font: "500 12px var(--sans)" }}>{token.name}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
                {token.prefix}…
                {token.lastUsedAt
                  ? ` · used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                  : " · never used"}
              </div>
            </div>
            <button
              style={{ color: "var(--danger)", fontSize: 11, fontWeight: 500 }}
              onClick={async () => {
                await api.del(`/api/tokens/${token.id}`).catch(() => {});
                router.refresh();
                toast("Token revoked");
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        {tokens.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 12 }}>No tokens yet.</div>
        )}
      </div>

      <form
        style={{ display: "flex", gap: 9 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const res = await api.post<{ token: { secret: string } }>("/api/tokens", {
              name: name.trim(),
            });
            setSecret(res.token.secret);
            setName("");
            router.refresh();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : "Couldn't create that token");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="input input-sm grow"
          placeholder="CI deploy bot"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
          Create token
        </button>
      </form>

      <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--faint)" }}>
        Send it as <span className="mono">Authorization: Bearer arc_…</span> to any endpoint under{" "}
        <span className="mono">/api</span>.
      </div>
    </Modal>
  );
}

import { shell, card, issueLine, escapeHtml } from "./layout";

const APP = () => process.env.APP_URL || "http://localhost:3000";

export function verifyEmailTemplate(name: string, token: string) {
  return {
    subject: "Verify your email for Arc",
    html: shell({
      preheader: "One click and your Arc account is live.",
      heading: `Welcome, ${name.split(" ")[0]}`,
      body: `<p style="margin:0">Confirm this address and your account is ready. The link works for 24 hours.</p>`,
      cta: { label: "Verify email", url: `${APP()}/verify-email?token=${token}` },
      footnote: "If you didn't create an Arc account, ignore this email.",
    }),
  };
}

export function resetPasswordTemplate(name: string, token: string) {
  return {
    subject: "Reset your Arc password",
    html: shell({
      preheader: "Choose a new password.",
      heading: "Reset your password",
      body: `<p style="margin:0">Hi ${escapeHtml(name.split(" ")[0])} — pick a new password with the link below. It expires in one hour and can be used once.</p>`,
      cta: { label: "Choose a new password", url: `${APP()}/reset-password?token=${token}` },
      footnote: "Didn't ask for this? Your password hasn't changed.",
    }),
  };
}

export function inviteTemplate(opts: {
  orgName: string;
  inviterName: string;
  role: string;
  token: string;
}) {
  return {
    subject: `${opts.inviterName} invited you to ${opts.orgName} on Arc`,
    html: shell({
      preheader: `Join ${opts.orgName} — you'll land straight on the board.`,
      heading: `Join ${opts.orgName}`,
      body: `<p style="margin:0"><b style="color:#f0eee9">${escapeHtml(opts.inviterName)}</b> invited you to ${escapeHtml(
        opts.orgName,
      )} on Arc as ${escapeHtml(opts.role.toLowerCase())}.</p>
      <p style="margin:12px 0 0">No setup on your side — accept and you go straight to the board.</p>`,
      cta: { label: "Accept invite", url: `${APP()}/invite/${opts.token}` },
      footnote: "This invite expires in 14 days.",
    }),
  };
}

export function mentionTemplate(opts: {
  actorName: string;
  issueKey: string;
  issueTitle: string;
  body: string;
}) {
  return {
    subject: `${opts.actorName} mentioned you on ${opts.issueKey}`,
    html: shell({
      preheader: opts.body.slice(0, 120),
      heading: `${opts.actorName} mentioned you`,
      body:
        `<p style="margin:0">On ${escapeHtml(opts.issueKey)}:</p>` +
        card(
          issueLine(opts.issueKey, opts.issueTitle) +
            `<div style="font-size:13.5px;line-height:1.65;color:#d8d5cf;border-left:2px solid #c8f24a;padding-left:12px">${escapeHtml(
              opts.body,
            )}</div>`,
        ),
      cta: { label: "Reply on Arc", url: `${APP()}/issues/${opts.issueKey}` },
    }),
  };
}

export function assignedTemplate(opts: {
  actorName: string;
  issueKey: string;
  issueTitle: string;
  meta: string;
}) {
  return {
    subject: `${opts.issueKey} assigned to you`,
    html: shell({
      preheader: opts.issueTitle,
      heading: "You picked up an issue",
      body:
        `<p style="margin:0">${escapeHtml(opts.actorName)} assigned this to you.</p>` +
        card(issueLine(opts.issueKey, opts.issueTitle, opts.meta)),
      cta: { label: "Open issue", url: `${APP()}/issues/${opts.issueKey}` },
    }),
  };
}

export function blockingTemplate(opts: {
  issueKey: string;
  issueTitle: string;
  blockedKey: string;
}) {
  return {
    subject: `${opts.issueKey} is blocking ${opts.blockedKey}`,
    html: shell({
      preheader: `${opts.blockedKey} can't move until ${opts.issueKey} does.`,
      heading: "Someone is waiting on you",
      body:
        `<p style="margin:0"><b style="color:#f0eee9">${escapeHtml(
          opts.blockedKey,
        )}</b> is blocked until this moves.</p>` + card(issueLine(opts.issueKey, opts.issueTitle)),
      cta: { label: "Unblock it", url: `${APP()}/issues/${opts.issueKey}` },
    }),
  };
}

export function ciFailedTemplate(opts: { issueKey: string; branch: string; detail: string }) {
  return {
    subject: `CI failed on ${opts.branch}`,
    html: shell({
      preheader: opts.detail,
      heading: "CI went red",
      body:
        `<p style="margin:0">On <span style="font-family:ui-monospace,Menlo,monospace;color:#f0eee9">${escapeHtml(
          opts.branch,
        )}</span> — ${escapeHtml(opts.detail)}.</p>`,
      cta: { label: `Open ${opts.issueKey}`, url: `${APP()}/issues/${opts.issueKey}` },
    }),
  };
}

export function digestTemplate(opts: {
  name: string;
  items: { key: string; title: string; meta: string }[];
  blockingCount: number;
  sprintName?: string | null;
}) {
  const rows = opts.items.map((i) => issueLine(i.key, i.title, i.meta)).join("");
  return {
    subject: `Your Arc digest — ${opts.items.length} need you`,
    html: shell({
      preheader: `${opts.items.length} items need you today.`,
      heading: `Good morning, ${opts.name.split(" ")[0]}`,
      body:
        `<p style="margin:0">${opts.items.length} item${opts.items.length === 1 ? "" : "s"} need you today${
          opts.blockingCount ? `, ${opts.blockingCount} blocking someone else` : ""
        }.${opts.sprintName ? ` You're in ${escapeHtml(opts.sprintName)}.` : ""}</p>` +
        (rows ? card(rows) : ""),
      cta: { label: "Open My work", url: `${APP()}/my-work` },
      footnote: "Turn digests off in Settings → Notifications.",
    }),
  };
}

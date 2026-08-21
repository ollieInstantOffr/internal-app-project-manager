import { shell, card, issueLine, escapeHtml } from "./layout";
import { appUrl } from "../app-url";

export function magicLinkTemplate(opts: {
  name: string;
  token: string;
  isNew: boolean;
  minutes: number;
}) {
  const url = appUrl(`/auth/verify?token=${opts.token}`);
  return {
    subject: opts.isNew ? "Finish setting up Arc" : "Your Arc sign-in link",
    html: shell({
      preheader: "One click and you're in. No password to remember.",
      heading: opts.isNew ? `Welcome, ${opts.name.split(" ")[0]}` : "Sign in to Arc",
      body: `<p style="margin:0">${
        opts.isNew
          ? "Confirm this address and your account is ready."
          : "Click below and you're signed in."
      }</p>
      <p style="margin:12px 0 0">The link works once and expires in ${opts.minutes} minutes.</p>`,
      cta: { label: opts.isNew ? "Create my account" : "Sign in", url },
      footnote: "If you didn't ask for this, ignore it — nobody can sign in without the link.",
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
      cta: { label: "Accept invite", url: appUrl(`/invite/${opts.token}`) },
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
      cta: { label: "Reply on Arc", url: appUrl(`/issues/${opts.issueKey}`) },
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
      cta: { label: "Open issue", url: appUrl(`/issues/${opts.issueKey}`) },
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
      cta: { label: "Unblock it", url: appUrl(`/issues/${opts.issueKey}`) },
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
      cta: { label: `Open ${opts.issueKey}`, url: appUrl(`/issues/${opts.issueKey}`) },
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
      cta: { label: "Open My work", url: appUrl("/my-work") },
      footnote: "Turn digests off in Settings → Notifications.",
    }),
  };
}

export function roadmapConfirmTemplate(opts: {
  orgName: string;
  projectName: string;
  confirmUrl: string;
}) {
  return {
    subject: `Confirm updates for the ${opts.orgName} roadmap`,
    html: shell({
      preheader: `One click and you're subscribed to ${opts.projectName} updates.`,
      heading: "Confirm your subscription",
      body: `<p>You asked to hear when the <strong>${escapeHtml(opts.projectName)}</strong> roadmap moves. Confirm below and we'll send one short email whenever something on the page changes — nothing else.</p>`,
      cta: { label: "Confirm subscription", url: opts.confirmUrl },
      footnote: "If you didn't ask for this, ignore this email and nothing happens.",
    }),
  };
}

export function roadmapChangedTemplate(opts: {
  orgName: string;
  projectName: string;
  roadmapUrl: string;
  unsubscribeUrl: string;
  changes: string[];
}) {
  const list = opts.changes.length
    ? `<ul style="margin:14px 0 0;padding-left:18px">${opts.changes
        .map((line) => `<li style="margin-bottom:6px">${escapeHtml(line)}</li>`)
        .join("")}</ul>`
    : "";

  return {
    subject: `The ${opts.orgName} roadmap has moved`,
    html: shell({
      preheader: `What's new on the ${opts.projectName} roadmap.`,
      heading: "The roadmap has moved",
      body: `<p>Something on the <strong>${escapeHtml(opts.projectName)}</strong> roadmap changed since you last heard from us.</p>${list}`,
      cta: { label: "See the roadmap", url: opts.roadmapUrl },
      footnote: `Don't want these? Unsubscribe: ${opts.unsubscribeUrl}`,
    }),
  };
}

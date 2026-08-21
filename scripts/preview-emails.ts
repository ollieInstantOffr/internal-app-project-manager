/**
 * Renders every transactional email to .preview/emails/ so the templates can be
 * eyeballed without sending anything. Run with: npx tsx scripts/preview-emails.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  magicLinkTemplate,
  inviteTemplate,
  mentionTemplate,
  assignedTemplate,
  blockingTemplate,
  ciFailedTemplate,
  digestTemplate,
} from "../src/lib/email/templates";

const out = path.join(process.cwd(), ".preview", "emails");
fs.mkdirSync(out, { recursive: true });

const samples = {
  "magic-link-new": magicLinkTemplate({
    name: "Ollie Johnsen",
    token: "sample-token",
    isNew: true,
    minutes: 15,
  }),
  "magic-link-return": magicLinkTemplate({
    name: "Ollie Johnsen",
    token: "sample-token",
    isNew: false,
    minutes: 15,
  }),
  invite: inviteTemplate({
    orgName: "InstantOffr",
    inviterName: "Ollie Johnsen",
    role: "Member",
    token: "sample-token",
  }),
  mention: mentionTemplate({
    actorName: "Robin Alvarez",
    issueKey: "WEB-408",
    issueTitle: "Refactor auth middleware to share session logic",
    body: "any update? WEB-419 is waiting.",
  }),
  assigned: assignedTemplate({
    actorName: "Robin Alvarez",
    issueKey: "WEB-409",
    issueTitle: "Session cookie flags for staging",
    meta: "Platform · Sprint 3 · 2 pts",
  }),
  blocking: blockingTemplate({
    issueKey: "WEB-408",
    issueTitle: "Refactor auth middleware to share session logic",
    blockedKey: "WEB-419",
  }),
  "ci-failed": ciFailedTemplate({
    issueKey: "WEB-408",
    branch: "fix/408-auth",
    detail: "auth e2e",
  }),
  digest: digestTemplate({
    name: "Ollie Johnsen",
    blockingCount: 2,
    sprintName: "Sprint 3",
    items: [
      {
        key: "WEB-408",
        title: "Refactor auth middleware",
        meta: "WEB-419 blocked on this",
      },
      {
        key: "API-77",
        title: "Review PR #219 — pagination cursor",
        meta: "Review requested · checks green",
      },
      {
        key: "WEB-409",
        title: "Session cookie flags for staging",
        meta: "Sprint 14 · 2 pts",
      },
    ],
  }),
};

const index: string[] = [];
for (const [name, tpl] of Object.entries(samples)) {
  fs.writeFileSync(path.join(out, `${name}.html`), tpl.html);
  index.push(`<li><a href="./${name}.html">${name}</a> — <em>${tpl.subject}</em></li>`);
}

fs.writeFileSync(
  path.join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Arc emails</title>
<body style="background:#1a1917;color:#f0eee9;font-family:system-ui;padding:40px">
<h1 style="font-size:20px">Arc transactional emails</h1>
<ul style="line-height:2">${index.join("")}</ul></body>`,
);

console.log(`Wrote ${Object.keys(samples).length} email previews to ${out}`);

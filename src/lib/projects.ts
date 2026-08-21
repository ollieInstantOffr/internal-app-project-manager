import "server-only";
import { db } from "./db";
import { ActivityType, IssueStatus } from "./types";
import { logActivity } from "./activity";
import { projectKeyFrom } from "./format";
import { RANK_STEP } from "./rank";
import { ACCENT_NAMES } from "./constants";
import { listRepoIssues, ensureWebhook } from "./github";

/** Finds a free 2–6 char key for a project inside an org. */
export async function allocateKey(orgId: string, name: string, preferred?: string) {
  const base = (preferred || projectKeyFrom(name) || "PRJ").toUpperCase().slice(0, 6);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 4)}${i + 1}`;
    const clash = await db.project.findUnique({ where: { orgId_key: { orgId, key: candidate } } });
    if (!clash) return candidate;
  }
  return `${base.slice(0, 3)}${Date.now().toString().slice(-3)}`;
}

async function nextColor(orgId: string) {
  const used = await db.project.count({ where: { orgId } });
  return ACCENT_NAMES.filter((c) => c !== "slate")[used % (ACCENT_NAMES.length - 1)];
}

export async function createProject(input: {
  orgId: string;
  actorId: string;
  name: string;
  key?: string;
  color?: string;
  repoFullName?: string | null;
  importIssues?: boolean;
  importLabels?: boolean;
  importClosed?: boolean;
  githubToken?: string | null;
}) {
  const key = await allocateKey(input.orgId, input.name, input.key);

  const project = await db.project.create({
    data: {
      orgId: input.orgId,
      name: input.name,
      key,
      color: input.color ?? (await nextColor(input.orgId)),
      repoFullName: input.repoFullName || null,
    },
  });

  await logActivity({
    orgId: input.orgId,
    type: ActivityType.PROJECT_CREATED,
    message: `created project ${project.name}`,
    actorId: input.actorId,
  });

  let imported = { issues: 0, epics: 0, labels: 0, webhook: false };
  if (input.repoFullName && input.githubToken && (input.importIssues || input.importLabels)) {
    imported = await seedFromRepo({
      projectId: project.id,
      orgId: input.orgId,
      actorId: input.actorId,
      repoFullName: input.repoFullName,
      token: input.githubToken,
      importIssues: !!input.importIssues,
      importLabels: !!input.importLabels,
      importClosed: !!input.importClosed,
    });
  }

  return { project, imported };
}

/**
 * Turns a repo into a working project: open issues become the backlog, labels
 * become epics, and a webhook starts watching branches.
 */
export async function seedFromRepo(opts: {
  projectId: string;
  orgId: string;
  actorId: string;
  repoFullName: string;
  token: string;
  importIssues: boolean;
  importLabels: boolean;
  importClosed: boolean;
}) {
  const issues = await listRepoIssues(opts.token, opts.repoFullName, {
    includeClosed: opts.importClosed,
  });

  const labelNames = [...new Set(issues.flatMap((i) => i.labels))].slice(0, 40);

  const labelIds = new Map<string, string>();
  const epicIds = new Map<string, string>();

  if (opts.importLabels) {
    for (const name of labelNames) {
      const label = await db.label.upsert({
        where: { projectId_name: { projectId: opts.projectId, name } },
        create: { projectId: opts.projectId, name },
        update: {},
      });
      labelIds.set(name, label.id);

      const org = await db.organization.update({
        where: { id: opts.orgId },
        data: { epicCounter: { increment: 1 } },
        select: { epicCounter: true },
      });
      const epic = await db.epic.create({
        data: {
          projectId: opts.projectId,
          key: `EPIC-${org.epicCounter}`,
          name: name.replace(/^\w/, (c) => c.toUpperCase()),
        },
      });
      epicIds.set(name, epic.id);
    }
  }

  let created = 0;
  if (opts.importIssues) {
    const members = await db.user.findMany({
      where: { memberships: { some: { orgId: opts.orgId } }, githubLogin: { not: null } },
      select: { id: true, githubLogin: true },
    });
    const byLogin = new Map(members.map((m) => [m.githubLogin!.toLowerCase(), m.id]));

    const project = await db.project.findUniqueOrThrow({ where: { id: opts.projectId } });
    let counter = project.issueCounter;
    let rank = RANK_STEP;

    for (const issue of issues) {
      counter += 1;
      const primaryLabel = issue.labels[0];
      const done = issue.state === "closed";

      const record = await db.issue.create({
        data: {
          projectId: opts.projectId,
          number: counter,
          key: `${project.key}-${counter}`,
          title: issue.title.slice(0, 300),
          description: issue.body?.slice(0, 20000) ?? null,
          status: done ? IssueStatus.DONE : IssueStatus.TRIAGE,
          completedAt: done && issue.closedAt ? new Date(issue.closedAt) : null,
          rank,
          epicId: primaryLabel ? (epicIds.get(primaryLabel) ?? null) : null,
          assigneeId: issue.assigneeLogin
            ? (byLogin.get(issue.assigneeLogin.toLowerCase()) ?? null)
            : null,
          createdById: opts.actorId,
        },
      });
      rank += RANK_STEP;
      created += 1;

      const ids = issue.labels.map((l) => labelIds.get(l)).filter(Boolean) as string[];
      if (ids.length) {
        await db.issueLabel.createMany({
          data: ids.map((labelId) => ({ issueId: record.id, labelId })),
          skipDuplicates: true,
        });
      }
    }

    await db.project.update({
      where: { id: opts.projectId },
      data: { issueCounter: counter },
    });
  }

  let webhook = false;
  if (process.env.GITHUB_WEBHOOK_SECRET) {
    webhook = await ensureWebhook(
      opts.token,
      opts.repoFullName,
      process.env.APP_URL || "http://localhost:3000",
      process.env.GITHUB_WEBHOOK_SECRET,
    ).catch(() => false);
  }

  return { issues: created, epics: epicIds.size, labels: labelIds.size, webhook };
}

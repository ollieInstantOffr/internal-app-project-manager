import "server-only";
import { db } from "./db";
import { ActivityType, IssueStatus, Priority } from "./types";
import { logActivity, notifyAssigned, notifyBlocking, addWatcher } from "./activity";
import { nextRank } from "./rank";
import { STATUS_LABEL } from "./constants";
import { HttpError } from "./auth";

export const ISSUE_INCLUDE = {
  project: { select: { id: true, key: true, name: true, color: true, repoFullName: true } },
  epic: { select: { id: true, key: true, name: true, color: true } },
  sprint: { select: { id: true, name: true, number: true, status: true } },
  release: { select: { id: true, name: true, releasedAt: true } },
  assignee: { select: { id: true, name: true, email: true, avatarHue: true, githubLogin: true } },
  createdBy: { select: { id: true, name: true } },
  labels: { include: { label: true } },
  subtasks: {
    orderBy: { position: "asc" },
    include: { assignee: { select: { id: true, name: true, avatarHue: true } } },
  },
  branches: true,
  pullRequests: { orderBy: { createdAt: "desc" } },
  blocks: { include: { blocked: { select: { id: true, key: true, title: true, status: true } } } },
  blockedBy: { include: { blocker: { select: { id: true, key: true, title: true, status: true } } } },
  watchers: { include: { user: { select: { id: true, name: true, avatarHue: true } } } },
  _count: { select: { comments: true } },
} as const;

export type IssueDetail = Awaited<ReturnType<typeof getIssue>>;

export async function getIssue(orgId: string, idOrKey: string) {
  const issue = await db.issue.findFirst({
    where: { project: { orgId }, OR: [{ id: idOrKey }, { key: idOrKey.toUpperCase() }] },
    include: ISSUE_INCLUDE,
  });
  if (!issue) throw new HttpError(404, "Issue not found");
  return issue;
}

/** Creates an issue. Only `title` and `projectId` are required — everything else is optional. */
export async function createIssue(input: {
  orgId: string;
  projectId: string;
  actorId: string;
  title: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: Priority;
  estimate?: number | null;
  assigneeId?: string | null;
  epicId?: string | null;
  sprintId?: string | null;
  releaseId?: string | null;
  labelIds?: string[];
  dueDate?: Date | null;
}) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, orgId: input.orgId },
  });
  if (!project) throw new HttpError(404, "Project not found");

  const status = input.status ?? IssueStatus.TRIAGE;

  const siblings = await db.issue.findMany({
    where: { projectId: project.id, status },
    select: { rank: true },
  });

  const updated = await db.project.update({
    where: { id: project.id },
    data: { issueCounter: { increment: 1 } },
    select: { issueCounter: true },
  });
  const number = updated.issueCounter;

  const issue = await db.issue.create({
    data: {
      number,
      key: `${project.key}-${number}`,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? Priority.NONE,
      estimate: input.estimate ?? null,
      dueDate: input.dueDate ?? null,
      rank: nextRank(siblings.map((s) => s.rank)),
      projectId: project.id,
      epicId: input.epicId ?? null,
      sprintId: input.sprintId ?? null,
      releaseId: input.releaseId ?? null,
      assigneeId: input.assigneeId ?? null,
      createdById: input.actorId,
      startedAt: status === IssueStatus.IN_PROGRESS ? new Date() : null,
      completedAt: status === IssueStatus.DONE ? new Date() : null,
      labels: input.labelIds?.length
        ? { create: input.labelIds.map((labelId) => ({ labelId })) }
        : undefined,
    },
    include: ISSUE_INCLUDE,
  });

  await addWatcher(issue.id, input.actorId);
  if (issue.assigneeId) await addWatcher(issue.id, issue.assigneeId);

  await logActivity({
    orgId: input.orgId,
    type: ActivityType.ISSUE_CREATED,
    message: `created ${issue.key}`,
    issueId: issue.id,
    actorId: input.actorId,
  });

  if (issue.assignee && issue.assigneeId !== input.actorId) {
    const actor = await db.user.findUnique({ where: { id: input.actorId }, select: { name: true } });
    await notifyAssigned({
      user: { id: issue.assignee.id, email: issue.assignee.email },
      actorId: input.actorId,
      actorName: actor?.name ?? "Someone",
      issueId: issue.id,
      issueKey: issue.key,
      issueTitle: issue.title,
      meta: [issue.project.name, issue.sprint?.name, issue.estimate ? `${issue.estimate} pts` : null]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return issue;
}

type Patch = {
  title?: string;
  description?: string | null;
  status?: IssueStatus;
  priority?: Priority;
  estimate?: number | null;
  assigneeId?: string | null;
  epicId?: string | null;
  sprintId?: string | null;
  releaseId?: string | null;
  labelIds?: string[];
  dueDate?: Date | null;
  rank?: number;
  archived?: boolean;
};

/**
 * Applies a patch, records one activity line per meaningful change and fires the
 * notifications that follow from it. `automatic` marks changes driven by git events.
 */
export async function updateIssue(opts: {
  orgId: string;
  issueId: string;
  actorId: string | null;
  patch: Patch;
  automatic?: boolean;
}) {
  const { orgId, issueId, actorId, patch, automatic = false } = opts;

  const before = await db.issue.findFirst({
    where: { id: issueId, project: { orgId } },
    include: ISSUE_INCLUDE,
  });
  if (!before) throw new HttpError(404, "Issue not found");

  const data: Record<string, unknown> = {};
  const events: { type: ActivityType; message: string; meta?: Record<string, unknown> }[] = [];

  if (patch.title !== undefined && patch.title !== before.title) {
    data.title = patch.title;
    events.push({ type: ActivityType.ISSUE_UPDATED, message: "renamed the issue" });
  }

  if (patch.description !== undefined && patch.description !== before.description) {
    data.description = patch.description;
    events.push({ type: ActivityType.ISSUE_UPDATED, message: "edited the description" });
  }

  if (patch.status !== undefined && patch.status !== before.status) {
    data.status = patch.status;
    if (patch.status === IssueStatus.IN_PROGRESS && !before.startedAt) data.startedAt = new Date();
    if (patch.status === IssueStatus.DONE) data.completedAt = new Date();
    if (before.status === IssueStatus.DONE && patch.status !== IssueStatus.DONE)
      data.completedAt = null;
    events.push({
      type: ActivityType.STATUS_CHANGED,
      message: `moved ${before.key} to ${STATUS_LABEL[patch.status]}`,
      meta: { from: before.status, to: patch.status },
    });
  }

  if (patch.priority !== undefined && patch.priority !== before.priority) {
    data.priority = patch.priority;
    events.push({ type: ActivityType.ISSUE_UPDATED, message: `set priority to ${patch.priority.toLowerCase()}` });
  }

  if (patch.estimate !== undefined && patch.estimate !== before.estimate) {
    data.estimate = patch.estimate;
    events.push({
      type: ActivityType.ISSUE_UPDATED,
      message: patch.estimate == null ? "cleared the estimate" : `estimated ${patch.estimate} pts`,
    });
  }

  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.rank !== undefined) data.rank = patch.rank;

  if (patch.archived !== undefined) {
    data.archivedAt = patch.archived ? new Date() : null;
  }

  let assigneeChanged = false;
  if (patch.assigneeId !== undefined && patch.assigneeId !== before.assigneeId) {
    data.assigneeId = patch.assigneeId;
    assigneeChanged = true;
    events.push({ type: ActivityType.ASSIGNED, message: patch.assigneeId ? "reassigned the issue" : "unassigned the issue" });
  }

  if (patch.epicId !== undefined && patch.epicId !== before.epicId) {
    data.epicId = patch.epicId;
    events.push({ type: ActivityType.ISSUE_UPDATED, message: "moved to a different epic" });
  }

  if (patch.releaseId !== undefined && patch.releaseId !== before.releaseId) {
    data.releaseId = patch.releaseId;
    const named = patch.releaseId
      ? await db.release.findUnique({ where: { id: patch.releaseId }, select: { name: true } })
      : null;
    events.push({
      type: ActivityType.ISSUE_UPDATED,
      message: named ? `tagged for ${named.name}` : "removed the release tag",
    });
  }

  if (patch.sprintId !== undefined && patch.sprintId !== before.sprintId) {
    data.sprintId = patch.sprintId;
    events.push({ type: ActivityType.ISSUE_UPDATED, message: patch.sprintId ? "added to a sprint" : "removed from the sprint" });
  }

  if (patch.labelIds) {
    await db.issueLabel.deleteMany({ where: { issueId } });
    if (patch.labelIds.length) {
      await db.issueLabel.createMany({
        data: patch.labelIds.map((labelId) => ({ issueId, labelId })),
        skipDuplicates: true,
      });
    }
  }

  const issue = Object.keys(data).length
    ? await db.issue.update({ where: { id: issueId }, data, include: ISSUE_INCLUDE })
    : await db.issue.findUniqueOrThrow({ where: { id: issueId }, include: ISSUE_INCLUDE });

  for (const event of events) {
    await logActivity({
      orgId,
      type: event.type,
      message: event.message,
      issueId,
      actorId,
      automatic,
      meta: event.meta,
    });
  }

  if (assigneeChanged && issue.assignee) {
    await addWatcher(issue.id, issue.assignee.id);
    const actor = actorId
      ? await db.user.findUnique({ where: { id: actorId }, select: { name: true } })
      : null;
    await notifyAssigned({
      user: { id: issue.assignee.id, email: issue.assignee.email },
      actorId: actorId ?? "system",
      actorName: actor?.name ?? "Arc",
      issueId: issue.id,
      issueKey: issue.key,
      issueTitle: issue.title,
      meta: [issue.project.name, issue.sprint?.name, issue.estimate ? `${issue.estimate} pts` : null]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (patch.status !== undefined && patch.status !== before.status) {
    await refreshBlockingNotifications(issue.id);
  }

  return issue;
}

/** When an issue blocks something else and isn't done, its assignee hears about it. */
export async function refreshBlockingNotifications(issueId: string) {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      assignee: { select: { id: true, email: true } },
      blocks: { include: { blocked: { select: { key: true, status: true } } } },
    },
  });
  if (!issue?.assignee) return;

  const stillBlocking = issue.blocks.filter(
    (b) => issue.status !== IssueStatus.DONE && b.blocked.status !== IssueStatus.DONE,
  );

  if (stillBlocking.length === 0) {
    await db.notification.updateMany({
      where: { issueId, kind: "BLOCKING", archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return;
  }

  await notifyBlocking({
    user: issue.assignee,
    issueId: issue.id,
    issueKey: issue.key,
    issueTitle: issue.title,
    blockedKey: stillBlocking[0].blocked.key,
  });
}

/** Points a board/backlog column reports for a set of issues. */
export function pointsOf(issues: { estimate: number | null }[]) {
  return issues.reduce((n, i) => n + (i.estimate ?? 0), 0);
}

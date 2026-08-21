import "server-only";
import { db } from "../db";
import { HttpError } from "../auth";
import { nextRank } from "../rank";
import { notify } from "../activity";
import { NotificationKind, Urgency } from "../types";

export const TASK_INCLUDE = {
  list: { select: { id: true, name: true, color: true } },
  owner: { select: { id: true, name: true, avatarHue: true } },
  delegatedBy: { select: { id: true, name: true, avatarHue: true } },
  issue: { select: { key: true, title: true, status: true } },
  subtasks: { orderBy: { position: "asc" } },
} as const;

/** Everyone in the org, so `@handle` can be resolved to a person. */
export async function resolveHandle(orgId: string, handle: string) {
  const members = await db.user.findMany({
    where: { memberships: { some: { orgId } } },
    select: { id: true, name: true, email: true, githubLogin: true },
  });
  const needle = handle.toLowerCase();

  return (
    members.find((m) =>
      [
        m.githubLogin?.toLowerCase(),
        m.email.split("@")[0].toLowerCase(),
        m.name.toLowerCase().replace(/\s+/g, ""),
        m.name.split(" ")[0].toLowerCase(),
      ]
        .filter(Boolean)
        .includes(needle),
    ) ?? null
  );
}

export async function createTask(input: {
  orgId: string;
  actorId: string;
  title: string;
  note?: string | null;
  listId?: string | null;
  dueDate?: Date | null;
  estimateMinutes?: number | null;
  issueKey?: string | null;
  delegateToId?: string | null;
  canRenegotiate?: boolean;
}) {
  const issue = input.issueKey
    ? await db.issue.findFirst({
        where: { key: input.issueKey.toUpperCase(), project: { orgId: input.orgId } },
        select: { id: true },
      })
    : null;

  const delegating = !!input.delegateToId && input.delegateToId !== input.actorId;
  // A delegated task lives on the recipient's page from the moment it's sent.
  const ownerId = delegating ? input.delegateToId! : input.actorId;

  const siblings = await db.task.findMany({
    where: { ownerId, status: "OPEN" },
    select: { position: true },
  });

  const task = await db.task.create({
    data: {
      orgId: input.orgId,
      title: input.title,
      note: input.note ?? null,
      listId: delegating ? null : (input.listId ?? null),
      dueDate: input.dueDate ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      issueId: issue?.id ?? null,
      ownerId,
      position: nextRank(siblings.map((s) => s.position)),
      ...(delegating
        ? {
            delegatedById: input.actorId,
            delegationStatus: "PENDING" as const,
            delegatedAt: new Date(),
            canRenegotiate: input.canRenegotiate ?? true,
          }
        : {}),
    },
    include: TASK_INCLUDE,
  });

  if (delegating) {
    const sender = await db.user.findUnique({
      where: { id: input.actorId },
      select: { name: true },
    });
    await notify({
      userId: ownerId,
      kind: NotificationKind.ASSIGNED,
      urgency: Urgency.TODAY,
      title: `${sender?.name ?? "Someone"} sent you a task`,
      detail: task.title,
      actorId: input.actorId,
    });
  }

  return task;
}

async function ownedTask(taskId: string, userId: string) {
  const task = await db.task.findFirst({
    where: { id: taskId, OR: [{ ownerId: userId }, { delegatedById: userId }] },
    include: TASK_INCLUDE,
  });
  if (!task) throw new HttpError(404, "Task not found");
  return task;
}

export async function respondToDelegation(opts: {
  taskId: string;
  userId: string;
  action: "accept" | "decline" | "propose";
  reason?: string | null;
  proposedDate?: Date | null;
}) {
  const task = await ownedTask(opts.taskId, opts.userId);
  if (task.ownerId !== opts.userId) {
    throw new HttpError(403, "Only the recipient can answer a delegated task");
  }
  if (task.delegationStatus !== "PENDING") {
    throw new HttpError(409, "That task has already been answered");
  }

  const senderId = task.delegatedById;
  const me = await db.user.findUnique({ where: { id: opts.userId }, select: { name: true } });

  if (opts.action === "accept") {
    const updated = await db.task.update({
      where: { id: task.id },
      data: {
        delegationStatus: "ACCEPTED",
        respondedAt: new Date(),
        // Accepting a counter-offer settles the date.
        ...(task.proposedDate ? { dueDate: task.proposedDate, proposedDate: null } : {}),
      },
      include: TASK_INCLUDE,
    });
    if (senderId) {
      await notify({
        userId: senderId,
        kind: NotificationKind.ASSIGNED,
        urgency: Urgency.LATER,
        title: `${me?.name ?? "They"} accepted your task`,
        detail: task.title,
        actorId: opts.userId,
      });
    }
    return updated;
  }

  if (opts.action === "propose") {
    if (!task.canRenegotiate) throw new HttpError(403, "This task can't be renegotiated");
    const updated = await db.task.update({
      where: { id: task.id },
      data: { proposedDate: opts.proposedDate ?? null },
      include: TASK_INCLUDE,
    });
    if (senderId) {
      await notify({
        userId: senderId,
        kind: NotificationKind.ASSIGNED,
        urgency: Urgency.TODAY,
        title: `${me?.name ?? "They"} proposed a new date`,
        detail: task.title,
        actorId: opts.userId,
      });
    }
    return updated;
  }

  // Declining sends it back with a reason — it never silently disappears.
  const updated = await db.task.update({
    where: { id: task.id },
    data: {
      delegationStatus: "DECLINED",
      declineReason: opts.reason?.trim() || null,
      respondedAt: new Date(),
    },
    include: TASK_INCLUDE,
  });
  if (senderId) {
    await notify({
      userId: senderId,
      kind: NotificationKind.ASSIGNED,
      urgency: Urgency.TODAY,
      title: `${me?.name ?? "They"} declined your task`,
      detail: opts.reason?.trim() || task.title,
      actorId: opts.userId,
    });
  }
  return updated;
}

/** Pulls a delegated task back to the sender, whatever state it was in. */
export async function takeBack(taskId: string, userId: string) {
  const task = await ownedTask(taskId, userId);
  if (task.delegatedById !== userId) {
    throw new HttpError(403, "Only the sender can take a task back");
  }

  return db.task.update({
    where: { id: task.id },
    data: {
      ownerId: userId,
      delegatedById: null,
      delegationStatus: "NONE",
      declineReason: null,
      proposedDate: null,
      delegatedAt: null,
      respondedAt: null,
      nudgedAt: null,
    },
    include: TASK_INCLUDE,
  });
}

export async function nudge(taskId: string, userId: string) {
  const task = await ownedTask(taskId, userId);
  if (task.delegatedById !== userId) throw new HttpError(403, "Only the sender can nudge");

  const sender = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await notify({
    userId: task.ownerId,
    kind: NotificationKind.MENTION,
    urgency: Urgency.TODAY,
    title: `${sender?.name ?? "Someone"} nudged you about a task`,
    detail: task.title,
    actorId: userId,
  });

  return db.task.update({
    where: { id: task.id },
    data: { nudgedAt: new Date() },
    include: TASK_INCLUDE,
  });
}

/** Promotes a task onto a board. The task closes and links across. */
export async function convertToIssue(opts: {
  taskId: string;
  userId: string;
  orgId: string;
  projectId: string;
}) {
  const task = await ownedTask(opts.taskId, opts.userId);
  if (task.convertedIssueId) throw new HttpError(409, "That task is already an issue");

  const { createIssue } = await import("../issues");
  const issue = await createIssue({
    orgId: opts.orgId,
    projectId: opts.projectId,
    actorId: opts.userId,
    title: task.title,
    description: [task.note, "Converted from a task."].filter(Boolean).join("\n\n"),
    assigneeId: task.ownerId,
    dueDate: task.dueDate,
  });

  await db.task.update({
    where: { id: task.id },
    data: { status: "DONE", completedAt: new Date(), convertedIssueId: issue.id },
  });

  return issue;
}

/** Minutes of focus per weekday for the current week — Monday first. */
export async function focusThisWeek(userId: string, now = new Date()) {
  const monday = new Date(now);
  const offset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - offset);
  monday.setHours(0, 0, 0, 0);

  const sessions = await db.focusSession.findMany({
    where: { userId, startedAt: { gte: monday }, endedAt: { not: null } },
    select: { startedAt: true, minutes: true },
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return {
      label: ["M", "T", "W", "T", "F", "S", "S"][i],
      minutes: 0,
      isToday: date.toDateString() === now.toDateString(),
    };
  });

  for (const session of sessions) {
    const index = (new Date(session.startedAt).getDay() + 6) % 7;
    days[index].minutes += session.minutes;
  }

  return { days, totalMinutes: days.reduce((n, d) => n + d.minutes, 0) };
}

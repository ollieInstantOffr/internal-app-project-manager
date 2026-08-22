import "server-only";
import { db } from "./db";
import { ActivityType, NotificationKind, Urgency } from "./types";
import { sendMail } from "./mail";
import { publish } from "./events";
import {
  mentionTemplate,
  assignedTemplate,
  blockingTemplate,
  ciFailedTemplate,
} from "./email/templates";

export async function logActivity(opts: {
  orgId: string;
  type: ActivityType;
  message: string;
  issueId?: string | null;
  actorId?: string | null;
  automatic?: boolean;
  meta?: Record<string, unknown>;
}) {
  void publish({ orgId: opts.orgId, kind: "activity", issueId: opts.issueId ?? null });

  return db.activity.create({
    data: {
      orgId: opts.orgId,
      type: opts.type,
      message: opts.message,
      issueId: opts.issueId ?? null,
      actorId: opts.actorId ?? null,
      automatic: opts.automatic ?? false,
      meta: (opts.meta ?? undefined) as never,
    },
  });
}

/** Creates an inbox item, skipping self-notification and duplicates for the same issue+kind. */
export async function notify(opts: {
  userId: string;
  kind: NotificationKind;
  urgency?: Urgency;
  title: string;
  detail?: string;
  issueId?: string | null;
  actorId?: string | null;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return null;

  // The inbox badge is the change people notice going stale first.
  const membership = await db.membership.findFirst({
    where: { userId: opts.userId },
    select: { orgId: true },
  });
  if (membership) {
    void publish({ orgId: membership.orgId, kind: "notification", userId: opts.userId });
  }

  if (opts.issueId) {
    const existing = await db.notification.findFirst({
      where: {
        userId: opts.userId,
        issueId: opts.issueId,
        kind: opts.kind,
        readAt: null,
        archivedAt: null,
      },
    });
    if (existing) {
      return db.notification.update({
        where: { id: existing.id },
        data: {
          title: opts.title,
          detail: opts.detail,
          urgency: opts.urgency ?? existing.urgency,
          createdAt: new Date(),
        },
      });
    }
  }

  return db.notification.create({
    data: {
      userId: opts.userId,
      kind: opts.kind,
      urgency: opts.urgency ?? Urgency.LATER,
      title: opts.title,
      detail: opts.detail,
      issueId: opts.issueId ?? null,
    },
  });
}

/**
 * "Pause notifications while focusing" — the in-app notification is still
 * created (losing it would be worse), but nothing is pushed to their inbox
 * while they're heads-down.
 */
async function quiet(userId: string) {
  const { isMuted } = await import("./focus");
  return isMuted(userId);
}

async function prefsFor(userId: string) {
  return (
    (await db.notificationPref.findUnique({ where: { userId } })) ?? {
      userId,
      emailMentions: true,
      emailAssigned: true,
      emailBlocking: true,
      emailCiFailures: false,
      emailDigest: true,
    }
  );
}

/** Extracts @handles from a comment body and resolves them to org members. */
export async function resolveMentions(body: string, orgId: string) {
  const handles = [...body.matchAll(/@([a-zA-Z0-9._-]{2,40})/g)].map((m) => m[1].toLowerCase());
  if (handles.length === 0) return [];

  const members = await db.user.findMany({
    where: { memberships: { some: { orgId } } },
    select: { id: true, name: true, email: true, githubLogin: true },
  });

  return members.filter((m) => {
    const candidates = [
      m.githubLogin?.toLowerCase(),
      m.email.split("@")[0].toLowerCase(),
      m.name.split(" ")[0].toLowerCase(),
      m.name.toLowerCase().replace(/\s+/g, ""),
    ].filter(Boolean) as string[];
    return handles.some((h) => candidates.includes(h));
  });
}

export async function notifyMention(opts: {
  user: { id: string; email: string };
  actorName: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  body: string;
  actorId: string;
}) {
  await notify({
    userId: opts.user.id,
    kind: NotificationKind.MENTION,
    urgency: Urgency.TODAY,
    title: `${opts.actorName} mentioned you on ${opts.issueKey}`,
    detail: opts.body.slice(0, 160),
    issueId: opts.issueId,
    actorId: opts.actorId,
  });

  const prefs = await prefsFor(opts.user.id);
  if (!prefs.emailMentions) return;
  const tpl = mentionTemplate({
    actorName: opts.actorName,
    issueKey: opts.issueKey,
    issueTitle: opts.issueTitle,
    body: opts.body,
  });
  if (await quiet(opts.user.id)) return;
  await sendMail({ to: opts.user.email, ...tpl });
}

export async function notifyAssigned(opts: {
  user: { id: string; email: string };
  actorId: string;
  actorName: string;
  issueId: string;
  issueKey: string;
  issueTitle: string;
  meta: string;
}) {
  if (opts.user.id === opts.actorId) return;
  await notify({
    userId: opts.user.id,
    kind: NotificationKind.ASSIGNED,
    urgency: Urgency.TODAY,
    title: opts.issueTitle,
    detail: `${opts.issueKey} · assigned by ${opts.actorName}`,
    issueId: opts.issueId,
    actorId: opts.actorId,
  });

  const prefs = await prefsFor(opts.user.id);
  if (!prefs.emailAssigned) return;
  const tpl = assignedTemplate({
    actorName: opts.actorName,
    issueKey: opts.issueKey,
    issueTitle: opts.issueTitle,
    meta: opts.meta,
  });
  if (await quiet(opts.user.id)) return;
  await sendMail({ to: opts.user.email, ...tpl });
}

export async function notifyBlocking(opts: {
  user: { id: string; email: string };
  issueId: string;
  issueKey: string;
  issueTitle: string;
  blockedKey: string;
}) {
  await notify({
    userId: opts.user.id,
    kind: NotificationKind.BLOCKING,
    urgency: Urgency.BLOCKING,
    title: opts.issueTitle,
    detail: `${opts.blockedKey} blocked on this`,
    issueId: opts.issueId,
  });

  const prefs = await prefsFor(opts.user.id);
  if (!prefs.emailBlocking) return;
  const tpl = blockingTemplate({
    issueKey: opts.issueKey,
    issueTitle: opts.issueTitle,
    blockedKey: opts.blockedKey,
  });
  if (await quiet(opts.user.id)) return;
  await sendMail({ to: opts.user.email, ...tpl });
}

export async function notifyCiFailed(opts: {
  user: { id: string; email: string };
  issueId: string;
  issueKey: string;
  branch: string;
  detail: string;
}) {
  await notify({
    userId: opts.user.id,
    kind: NotificationKind.CI_FAILED,
    urgency: Urgency.TODAY,
    title: `CI failed on ${opts.branch}`,
    detail: opts.detail,
    issueId: opts.issueId,
  });

  const prefs = await prefsFor(opts.user.id);
  if (!prefs.emailCiFailures) return;
  const tpl = ciFailedTemplate({ issueKey: opts.issueKey, branch: opts.branch, detail: opts.detail });
  if (await quiet(opts.user.id)) return;
  await sendMail({ to: opts.user.email, ...tpl });
}

/** Everyone who should hear about an issue: assignee + explicit watchers. */
export async function watchersOf(issueId: string) {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      assignee: { select: { id: true, email: true } },
      watchers: { include: { user: { select: { id: true, email: true } } } },
    },
  });
  if (!issue) return [];
  const map = new Map<string, { id: string; email: string }>();
  if (issue.assignee) map.set(issue.assignee.id, issue.assignee);
  for (const w of issue.watchers) map.set(w.user.id, w.user);
  return [...map.values()];
}

export async function addWatcher(issueId: string, userId: string) {
  await db.watcher.upsert({
    where: { issueId_userId: { issueId, userId } },
    create: { issueId, userId },
    update: {},
  });
}

import "server-only";
import { db } from "./db";
import { Urgency } from "./types";
import { sendMail } from "./mail";
import { digestTemplate } from "./email/templates";

/** Builds one person's morning digest from their live inbox. */
export async function buildDigest(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { prefs: true, memberships: { include: { org: true }, take: 1 } },
  });
  if (!user) return null;

  const notifications = await db.notification.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
    take: 12,
    include: {
      issue: {
        select: {
          key: true,
          estimate: true,
          sprint: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });

  if (notifications.length === 0) return null;

  const activeSprint = await db.sprint.findFirst({
    where: {
      status: "ACTIVE",
      project: { orgId: user.memberships[0]?.orgId ?? "" },
    },
    select: { name: true },
  });

  return {
    user,
    payload: {
      name: user.name,
      blockingCount: notifications.filter((n) => n.urgency === Urgency.BLOCKING).length,
      sprintName: activeSprint?.name ?? null,
      items: notifications.map((n) => ({
        key: n.issue?.key ?? "—",
        title: n.title,
        meta:
          n.detail ??
          [n.issue?.project.name, n.issue?.sprint?.name].filter(Boolean).join(" · "),
      })),
    },
    notificationIds: notifications.map((n) => n.id),
  };
}

export async function sendDigest(userId: string, { force = false } = {}) {
  const built = await buildDigest(userId);
  if (!built) return { sent: false, skipped: true as const };

  const wantsDigest = built.user.prefs?.emailDigest ?? true;
  if (!wantsDigest && !force) return { sent: false, skipped: true as const };

  const tpl = digestTemplate(built.payload);
  const result = await sendMail({ to: built.user.email, ...tpl });

  if (result.ok) {
    await db.notification.updateMany({
      where: { id: { in: built.notificationIds } },
      data: { emailedAt: new Date() },
    });
  }

  return { sent: result.ok, skipped: false as const, count: built.payload.items.length };
}

/** Everyone in the org who opted in and hasn't already had one today. */
export async function sendDigestsForAll() {
  const since = new Date(Date.now() - 20 * 3600e3);

  const users = await db.user.findMany({
    where: {
      memberships: { some: {} },
      OR: [{ prefs: { is: null } }, { prefs: { emailDigest: true } }],
      notifications: {
        some: { archivedAt: null, OR: [{ emailedAt: null }, { emailedAt: { lt: since } }] },
      },
    },
    select: { id: true },
  });

  let sent = 0;
  for (const user of users) {
    const result = await sendDigest(user.id);
    if (result.sent) sent += 1;
  }
  return { candidates: users.length, sent };
}

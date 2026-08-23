import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";

/**
 * What the notification centre shows: things waiting on an answer, then things
 * that have merely happened.
 *
 * Approvals come first because an assistant is blocked polling for one — a
 * notification nobody reads is an inconvenience, an approval nobody reads is a
 * stopped agent.
 */
export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);

  const [approvals, notifications, unread] = await Promise.all([
    db.agentApproval.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gt: new Date() },
        assistant: { orgId: ctx.orgId },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { assistant: { select: { id: true, name: true } } },
    }),
    db.notification.findMany({
      where: {
        userId: ctx.userId,
        archivedAt: null,
        // The approval cards above already say this, in a form you can act on.
        kind: { not: "APPROVAL" },
      },
      // Unread first: Postgres sorts NULLs last on ASC, which had it backwards.
      orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 40,
      include: {
        issue: { select: { key: true, title: true } },
        actor: { select: { name: true, isAgent: true } },
      },
    }),
    db.notification.count({ where: { userId: ctx.userId, readAt: null, archivedAt: null } }),
  ]);

  return json({
    approvals: approvals.map((a) => ({
      id: a.id,
      assistantId: a.assistantId,
      assistantName: a.assistant.name,
      tool: a.tool,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt.toISOString(),
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      kind: n.kind,
      urgency: n.urgency,
      title: n.title,
      detail: n.detail,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
      issueKey: n.issue?.key ?? null,
      actor: n.actor ? { name: n.actor.name, isAgent: n.actor.isAgent } : null,
    })),
    counts: { unread, approvals: approvals.length },
  });
});

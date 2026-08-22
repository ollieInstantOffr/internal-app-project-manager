import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { commentSchema } from "@/lib/validators";
import { ActivityType } from "@/lib/types";
import {
  logActivity,
  resolveMentions,
  notifyMention,
  addWatcher,
  watchersOf,
  notify,
} from "@/lib/activity";
import { NotificationKind, Urgency } from "@/lib/types";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);
  const comments = await db.comment.findMany({
    where: { issueId: issue.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, avatarHue: true } } },
  });
  return json({ comments });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);
  const { body, attachmentIds } = await parseBody(req, commentSchema);

  const comment = await db.comment.create({
    data: { issueId: issue.id, authorId: ctx.userId, body },
    include: { author: { select: { id: true, name: true, avatarHue: true } } },
  });

  // Files are uploaded before the comment exists, so they're claimed here.
  // Scoped to this issue, so a comment can't adopt somebody else's upload.
  if (attachmentIds?.length) {
    await db.attachment.updateMany({
      where: { id: { in: attachmentIds }, issueId: issue.id, commentId: null },
      data: { commentId: comment.id },
    });
  }

  await addWatcher(issue.id, ctx.userId);
  await logActivity({
    orgId: ctx.orgId,
    type: ActivityType.COMMENTED,
    message: `commented on ${issue.key}`,
    issueId: issue.id,
    actorId: ctx.userId,
  });

  const actorName = comment.author?.name ?? "Someone";
  const mentioned = await resolveMentions(body, ctx.orgId);
  const mentionedIds = new Set(mentioned.map((m) => m.id));

  for (const person of mentioned) {
    if (person.id === ctx.userId) continue;
    await addWatcher(issue.id, person.id);
    await notifyMention({
      user: person,
      actorName,
      actorId: ctx.userId,
      issueId: issue.id,
      issueKey: issue.key,
      issueTitle: issue.title,
      body,
    });
  }

  // Watchers who weren't named still get an inbox item, just no email.
  for (const watcher of await watchersOf(issue.id)) {
    if (watcher.id === ctx.userId || mentionedIds.has(watcher.id)) continue;
    await notify({
      userId: watcher.id,
      kind: NotificationKind.COMMENT,
      urgency: Urgency.LATER,
      title: `${actorName} commented on ${issue.key}`,
      detail: body.slice(0, 160),
      issueId: issue.id,
      actorId: ctx.userId,
    });
  }

  return json({ ok: true, comment }, { status: 201 });
});

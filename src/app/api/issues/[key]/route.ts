import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { issueUpdateSchema } from "@/lib/validators";
import { getIssue, updateIssue } from "@/lib/issues";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await getIssue(ctx.orgId, key);

  const [comments, activities] = await Promise.all([
    db.comment.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, avatarHue: true } } },
    }),
    db.activity.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { actor: { select: { id: true, name: true, avatarHue: true } } },
    }),
  ]);

  return json({ issue, comments, activities });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const found = await issueInOrg(ctx.orgId, key);
  const patch = await parseBody(req, issueUpdateSchema);

  const issue = await updateIssue({
    orgId: ctx.orgId,
    issueId: found.id,
    actorId: ctx.userId,
    patch,
  });

  return json({ ok: true, issue });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const found = await issueInOrg(ctx.orgId, key);

  // Archive rather than destroy — "e" on the queue should always be undoable.
  await db.issue.update({ where: { id: found.id }, data: { archivedAt: new Date() } });
  await db.notification.updateMany({
    where: { issueId: found.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return json({ ok: true });
});

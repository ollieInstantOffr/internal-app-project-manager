import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { issueUpdateSchema } from "@/lib/validators";
import { getIssue, updateIssue } from "@/lib/issues";
import { Role } from "@/lib/types";

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

/**
 * Archives by default — "e" on the queue has to be undoable. `?permanent=1`
 * destroys the issue and everything hanging off it, and needs admin rights.
 */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";
  const ctx = await requireApiContext(req, permanent ? Role.ADMIN : Role.MEMBER);
  const { key } = await params;
  const found = await issueInOrg(ctx.orgId, key);

  if (permanent) {
    // Comments, subtasks, links, branches and activity cascade from the schema.
    await db.issue.delete({ where: { id: found.id } });
    return json({ ok: true, deleted: "permanent", key: found.key });
  }

  await db.issue.update({ where: { id: found.id }, data: { archivedAt: new Date() } });
  await db.notification.updateMany({
    where: { issueId: found.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });

  return json({ ok: true, deleted: "archived", key: found.key });
});

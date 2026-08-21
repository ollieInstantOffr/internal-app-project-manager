import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { moveSchema } from "@/lib/validators";
import { updateIssue } from "@/lib/issues";
import { rankBetween } from "@/lib/rank";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, moveSchema);
  const issue = await issueInOrg(ctx.orgId, body.issueId);

  const [before, after] = await Promise.all([
    body.beforeId ? db.issue.findUnique({ where: { id: body.beforeId }, select: { rank: true } }) : null,
    body.afterId ? db.issue.findUnique({ where: { id: body.afterId }, select: { rank: true } }) : null,
  ]);

  const updated = await updateIssue({
    orgId: ctx.orgId,
    issueId: issue.id,
    actorId: ctx.userId,
    patch: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.sprintId !== undefined ? { sprintId: body.sprintId } : {}),
      rank: rankBetween(before?.rank, after?.rank),
    },
  });

  return json({ ok: true, issue: updated });
});

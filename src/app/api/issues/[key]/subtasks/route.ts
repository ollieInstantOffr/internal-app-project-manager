import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { subtaskSchema } from "@/lib/validators";
import { nextRank } from "@/lib/rank";

type Ctx = { params: Promise<{ key: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);
  const body = await parseBody(req, subtaskSchema);

  const siblings = await db.subtask.findMany({
    where: { issueId: issue.id },
    select: { position: true },
  });

  const subtask = await db.subtask.create({
    data: {
      issueId: issue.id,
      title: body.title,
      assigneeId: body.assigneeId ?? null,
      position: nextRank(siblings.map((s) => s.position)),
    },
    include: { assignee: { select: { id: true, name: true, avatarHue: true } } },
  });

  return json({ ok: true, subtask }, { status: 201 });
});

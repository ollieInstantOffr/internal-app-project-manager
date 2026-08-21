import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskSubtaskUpdateSchema } from "@/lib/validators";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function reachable(id: string, userId: string, orgId: string) {
  const subtask = await db.taskSubtask.findFirst({
    where: {
      id,
      task: { orgId, OR: [{ ownerId: userId }, { delegatedById: userId }] },
    },
  });
  if (!subtask) throw new HttpError(404, "Subtask not found");
  return subtask;
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await reachable(id, ctx.userId, ctx.orgId);
  const body = await parseBody(req, taskSubtaskUpdateSchema);
  const subtask = await db.taskSubtask.update({ where: { id }, data: body });
  return json({ ok: true, subtask });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await reachable(id, ctx.userId, ctx.orgId);
  await db.taskSubtask.delete({ where: { id } });
  return json({ ok: true });
});

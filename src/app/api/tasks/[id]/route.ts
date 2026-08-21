import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validators";
import { TASK_INCLUDE } from "@/lib/tasks/service";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** A task is reachable by the person it sits with, or the person who sent it. */
async function reachable(id: string, userId: string, orgId: string) {
  const task = await db.task.findFirst({
    where: { id, orgId, OR: [{ ownerId: userId }, { delegatedById: userId }] },
  });
  if (!task) throw new HttpError(404, "Task not found");
  return task;
}

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await reachable(id, ctx.userId, ctx.orgId);
  const task = await db.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  return json({ task });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await reachable(id, ctx.userId, ctx.orgId);
  const body = await parseBody(req, taskUpdateSchema);

  if (body.listId) {
    const list = await db.taskList.findFirst({
      where: { id: body.listId, ownerId: existing.ownerId },
    });
    if (!list) throw new HttpError(404, "List not found");
  }

  const task = await db.task.update({
    where: { id },
    data: {
      ...body,
      ...(body.status
        ? { completedAt: body.status === "DONE" ? new Date() : null }
        : {}),
    },
    include: TASK_INCLUDE,
  });

  return json({ ok: true, task });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await reachable(id, ctx.userId, ctx.orgId);
  await db.task.delete({ where: { id } });
  return json({ ok: true });
});

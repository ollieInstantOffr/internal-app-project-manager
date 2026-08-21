import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskListSchema } from "@/lib/validators";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function ownList(id: string, ownerId: string) {
  const list = await db.taskList.findFirst({ where: { id, ownerId } });
  if (!list) throw new HttpError(404, "List not found");
  return list;
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await ownList(id, ctx.userId);
  const body = await parseBody(req, taskListSchema.partial());
  const list = await db.taskList.update({ where: { id }, data: body });
  return json({ ok: true, list });
});

/** Deleting a list keeps its tasks — they just fall back to no list. */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await ownList(id, ctx.userId);
  await db.task.updateMany({ where: { listId: id }, data: { listId: null } });
  await db.taskList.delete({ where: { id } });
  return json({ ok: true });
});

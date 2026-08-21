import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskSubtaskCreateSchema } from "@/lib/validators";
import { nextRank } from "@/lib/rank";
import { HttpError } from "@/lib/auth";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;

  const task = await db.task.findFirst({
    where: { id, orgId: ctx.orgId, OR: [{ ownerId: ctx.userId }, { delegatedById: ctx.userId }] },
    include: { subtasks: { select: { position: true } } },
  });
  if (!task) throw new HttpError(404, "Task not found");

  const body = await parseBody(req, taskSubtaskCreateSchema);
  const subtask = await db.taskSubtask.create({
    data: {
      taskId: id,
      title: body.title,
      position: nextRank(task.subtasks.map((s) => s.position)),
    },
  });

  return json({ ok: true, subtask }, { status: 201 });
});

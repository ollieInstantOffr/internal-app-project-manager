import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { focusStartSchema } from "@/lib/validators";
import { HttpError } from "@/lib/auth";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const active = await db.focusSession.findFirst({
    where: { userId: ctx.userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: { task: { select: { id: true, title: true } } },
  });
  return json({ session: active });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, focusStartSchema);

  if (body.taskId) {
    const task = await db.task.findFirst({
      where: { id: body.taskId, ownerId: ctx.userId },
      select: { id: true },
    });
    if (!task) throw new HttpError(404, "Task not found");
  }

  // Only one clock runs at a time — starting a new one closes the last.
  const running = await db.focusSession.findFirst({
    where: { userId: ctx.userId, endedAt: null },
  });
  if (running) {
    const elapsed = Math.round((Date.now() - running.startedAt.getTime()) / 60000);
    await db.focusSession.update({
      where: { id: running.id },
      data: { endedAt: new Date(), minutes: Math.min(elapsed, running.plannedMinutes) },
    });
  }

  const session = await db.focusSession.create({
    data: {
      userId: ctx.userId,
      taskId: body.taskId ?? null,
      plannedMinutes: body.plannedMinutes,
    },
  });

  return json({ ok: true, session }, { status: 201 });
});

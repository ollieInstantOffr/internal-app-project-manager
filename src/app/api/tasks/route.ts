import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskCreateSchema } from "@/lib/validators";
import { createTask, resolveHandle, TASK_INCLUDE } from "@/lib/tasks/service";
import { parseTaskInput } from "@/lib/tasks/parse";
import { HttpError } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const view = new URL(req.url).searchParams.get("view") ?? "mine";

  const base: Prisma.TaskWhereInput =
    view === "delegated"
      ? { delegatedById: ctx.userId }
      : view === "received"
        ? { ownerId: ctx.userId, delegatedById: { not: null } }
        : { ownerId: ctx.userId };

  const tasks = await db.task.findMany({
    where: { ...base, orgId: ctx.orgId, status: view === "done" ? "DONE" : "OPEN" },
    include: TASK_INCLUDE,
    orderBy:
      view === "done"
        ? [{ completedAt: "desc" }]
        : [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    take: 500,
  });

  return json({ tasks });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, taskCreateSchema);
  const parsed = parseTaskInput(body.input);

  let delegateToId = body.delegateToId ?? null;
  if (!delegateToId && parsed.handle) {
    const person = await resolveHandle(ctx.orgId, parsed.handle);
    if (!person) throw new HttpError(404, `No one here goes by @${parsed.handle}`);
    delegateToId = person.id;
  }

  const task = await createTask({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    title: parsed.title,
    note: body.note,
    listId: body.listId,
    // An explicit field from the composer always beats what was typed inline.
    dueDate: body.dueDate !== undefined ? body.dueDate : parsed.dueDate,
    estimateMinutes:
      body.estimateMinutes !== undefined ? body.estimateMinutes : parsed.estimateMinutes,
    issueKey: body.issueKey ?? parsed.issueKey,
    delegateToId,
    canRenegotiate: body.canRenegotiate,
  });

  return json({ ok: true, task }, { status: 201 });
});

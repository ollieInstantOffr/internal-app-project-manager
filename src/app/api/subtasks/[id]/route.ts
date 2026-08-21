import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { subtaskUpdateSchema } from "@/lib/validators";
import { ActivityType } from "@/lib/types";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

async function owned(orgId: string, id: string) {
  return db.subtask.findFirst({
    where: { id, issue: { project: { orgId } } },
    include: { issue: { select: { id: true, key: true } } },
  });
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const subtask = await owned(ctx.orgId, id);
  if (!subtask) return fail(404, "Subtask not found");

  const body = await parseBody(req, subtaskUpdateSchema);

  const updated = await db.subtask.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
      ...(body.done !== undefined
        ? { done: body.done, completedAt: body.done ? new Date() : null }
        : {}),
    },
    include: { assignee: { select: { id: true, name: true, avatarHue: true } } },
  });

  if (body.done) {
    await logActivity({
      orgId: ctx.orgId,
      type: ActivityType.SUBTASK_DONE,
      message: `checked off “${updated.title}”`,
      issueId: subtask.issue.id,
      actorId: ctx.userId,
    });
  }

  return json({ ok: true, subtask: updated });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const subtask = await owned(ctx.orgId, id);
  if (!subtask) return fail(404, "Subtask not found");
  await db.subtask.delete({ where: { id } });
  return json({ ok: true });
});

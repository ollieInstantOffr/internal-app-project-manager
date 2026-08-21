import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { taskRespondSchema } from "@/lib/validators";
import { respondToDelegation } from "@/lib/tasks/service";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const body = await parseBody(req, taskRespondSchema);

  const task = await respondToDelegation({
    taskId: id,
    userId: ctx.userId,
    action: body.action,
    reason: body.reason,
    proposedDate: body.proposedDate,
  });

  return json({ ok: true, task });
});

import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { bulkUpdateSchema } from "@/lib/validators";
import { updateIssue } from "@/lib/issues";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const { issueIds, patch } = await parseBody(req, bulkUpdateSchema);

  const owned = await db.issue.findMany({
    where: { id: { in: issueIds }, project: { orgId: ctx.orgId } },
    select: { id: true, key: true },
  });

  // Snapshot enough to undo the bulk edit from the toast.
  const before = await db.issue.findMany({
    where: { id: { in: owned.map((i) => i.id) } },
    select: {
      id: true,
      status: true,
      priority: true,
      estimate: true,
      assigneeId: true,
      epicId: true,
      sprintId: true,
      archivedAt: true,
    },
  });

  const { addLabelId, ...fields } = patch;

  for (const issue of owned) {
    await updateIssue({
      orgId: ctx.orgId,
      issueId: issue.id,
      actorId: ctx.userId,
      patch: fields,
    });
    if (addLabelId) {
      await db.issueLabel.upsert({
        where: { issueId_labelId: { issueId: issue.id, labelId: addLabelId } },
        create: { issueId: issue.id, labelId: addLabelId },
        update: {},
      });
    }
  }

  return json({ ok: true, count: owned.length, undo: before });
});

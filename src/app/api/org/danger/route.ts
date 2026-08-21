import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.OWNER);
  const { action, confirm } = await parseBody(
    req,
    z.object({
      action: z.enum(["archive-done", "delete-org"]),
      confirm: z.string().optional(),
    }),
  );

  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });

  if (action === "archive-done") {
    const { count } = await db.issue.updateMany({
      where: { project: { orgId: ctx.orgId }, status: "DONE", archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return json({ ok: true, archived: count });
  }

  if (confirm !== org.slug) {
    return fail(400, `Type ${org.slug} to confirm`);
  }

  await db.organization.delete({ where: { id: ctx.orgId } });
  return json({ ok: true, deleted: true });
});

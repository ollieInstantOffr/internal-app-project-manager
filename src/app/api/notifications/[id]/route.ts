import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ read: z.boolean().optional(), archived: z.boolean().optional() });

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const item = await db.notification.findFirst({ where: { id, userId: ctx.userId } });
  if (!item) return fail(404, "Not found");

  const body = await parseBody(req, patchSchema);
  const updated = await db.notification.update({
    where: { id },
    data: {
      ...(body.read !== undefined ? { readAt: body.read ? new Date() : null } : {}),
      ...(body.archived !== undefined ? { archivedAt: body.archived ? new Date() : null } : {}),
    },
  });
  return json({ ok: true, item: updated });
});

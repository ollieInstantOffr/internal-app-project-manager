import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const { count } = await db.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, archivedAt: null },
    data: { readAt: new Date() },
  });
  return json({ ok: true, count });
});

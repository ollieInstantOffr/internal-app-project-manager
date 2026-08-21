import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { prefsSchema } from "@/lib/validators";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const prefs = await db.notificationPref.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId },
    update: {},
  });
  return json({ prefs });
});

export const PATCH = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, prefsSchema);
  const prefs = await db.notificationPref.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, ...body },
    update: body,
  });
  return json({ ok: true, prefs });
});

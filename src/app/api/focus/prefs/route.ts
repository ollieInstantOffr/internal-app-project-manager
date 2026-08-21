import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { focusPrefsSchema } from "@/lib/validators";
import { DEFAULT_PREFS } from "@/lib/focus";

export const PATCH = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, focusPrefsSchema);

  const prefs = await db.focusPref.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, ...DEFAULT_PREFS, ...body },
    update: body,
  });

  return json({ ok: true, prefs });
});

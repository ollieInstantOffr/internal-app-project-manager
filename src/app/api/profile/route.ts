import { db } from "@/lib/db";
import { handler, json, parseBody } from "@/lib/api";
import { profileSchema } from "@/lib/validators";
import { requireUser } from "@/lib/auth";

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const body = await parseBody(req, profileSchema);
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.githubLogin !== undefined ? { githubLogin: body.githubLogin || null } : {}),
    },
    select: { id: true, name: true, githubLogin: true },
  });
  return json({ ok: true, user: updated });
});

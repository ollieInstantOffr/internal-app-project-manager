import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { aiAccessSchema } from "@/lib/validators";
import { Role } from "@/lib/types";

/** The master switch. Off means no assistant can connect, whatever its level. */
export const PATCH = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { aiAccess } = await parseBody(req, aiAccessSchema);
  const org = await db.organization.update({
    where: { id: ctx.orgId },
    data: { aiAccess },
    select: { aiAccess: true },
  });
  return json({ ok: true, ...org });
});

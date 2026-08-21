import { db } from "@/lib/db";
import { handler, json, fail, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  const token = await db.apiToken.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!token) return fail(404, "Token not found");
  await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
  return json({ ok: true });
});

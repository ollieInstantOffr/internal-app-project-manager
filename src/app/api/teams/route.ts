import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, fail } from "@/lib/api";
import { teamSchema } from "@/lib/validators";
import { Role } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const teams = await db.team.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
    include: { members: { include: { user: { select: { id: true, name: true, avatarHue: true } } } } },
  });
  return json({ teams });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { name } = await parseBody(req, teamSchema);
  const clash = await db.team.findUnique({ where: { orgId_name: { orgId: ctx.orgId, name } } });
  if (clash) return fail(409, "A team with that name already exists");
  const team = await db.team.create({ data: { orgId: ctx.orgId, name } });
  return json({ ok: true, team });
});

import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  addUserId: z.string().optional(),
  removeUserId: z.string().optional(),
});

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireApiContext(req, Role.ADMIN);
    const { id } = await params;
    const body = await parseBody(req, patchSchema);

    const team = await db.team.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!team) return fail(404, "Team not found");

    if (body.name) await db.team.update({ where: { id }, data: { name: body.name } });
    if (body.addUserId) {
      await db.teamMember.upsert({
        where: { teamId_userId: { teamId: id, userId: body.addUserId } },
        create: { teamId: id, userId: body.addUserId },
        update: {},
      });
    }
    if (body.removeUserId) {
      await db.teamMember.deleteMany({ where: { teamId: id, userId: body.removeUserId } });
    }

    return json({ ok: true });
  },
);

export const DELETE = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireApiContext(req, Role.ADMIN);
    const { id } = await params;
    const team = await db.team.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!team) return fail(404, "Team not found");
    await db.team.delete({ where: { id } });
    return json({ ok: true });
  },
);

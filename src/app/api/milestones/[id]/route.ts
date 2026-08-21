import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { MilestoneStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const found = await db.milestone.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!found) return fail(404, "Milestone not found");

  const body = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      date: z.coerce.date().optional(),
      status: z.nativeEnum(MilestoneStatus).optional(),
    }),
  );

  const milestone = await db.milestone.update({ where: { id }, data: body });
  return json({ ok: true, milestone });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const found = await db.milestone.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!found) return fail(404, "Milestone not found");
  await db.milestone.delete({ where: { id } });
  return json({ ok: true });
});

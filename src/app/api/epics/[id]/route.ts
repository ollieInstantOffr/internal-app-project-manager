import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { EpicStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).optional().nullable(),
  color: z.string().optional(),
  status: z.nativeEnum(EpicStatus).optional(),
  startDate: z.coerce.date().optional().nullable(),
  targetDate: z.coerce.date().optional().nullable(),
  releaseId: z.string().optional().nullable(),
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const epic = await db.epic.findFirst({ where: { id, project: { orgId: ctx.orgId } } });
  if (!epic) return fail(404, "Epic not found");

  const body = await parseBody(req, patchSchema);
  const updated = await db.epic.update({ where: { id }, data: body });
  return json({ ok: true, epic: updated });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const epic = await db.epic.findFirst({ where: { id, project: { orgId: ctx.orgId } } });
  if (!epic) return fail(404, "Epic not found");

  // Issues survive their epic; they simply lose the grouping.
  await db.epic.delete({ where: { id } });
  return json({ ok: true });
});

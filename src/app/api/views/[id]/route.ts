import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { viewUpdateSchema } from "@/lib/validators";
import { HttpError } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/** A shared view is visible to everyone but only its owner may change it. */
async function ownView(id: string, userId: string, orgId: string) {
  const view = await db.savedView.findFirst({ where: { id, orgId } });
  if (!view) throw new HttpError(404, "View not found");
  if (view.ownerId !== userId) throw new HttpError(403, "That view belongs to someone else");
  return view;
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await ownView(id, ctx.userId, ctx.orgId);
  const body = await parseBody(req, viewUpdateSchema);

  if (body.isDefault) {
    await db.savedView.updateMany({
      where: { ownerId: ctx.userId, scope: existing.scope, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
  }

  const view = await db.savedView.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.shared !== undefined ? { shared: body.shared } : {}),
      ...(body.isDefault !== undefined ? { isDefault: body.isDefault } : {}),
      ...(body.filters !== undefined ? { filters: body.filters as Prisma.InputJsonValue } : {}),
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  return json({ ok: true, view });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  await ownView(id, ctx.userId, ctx.orgId);
  await db.savedView.delete({ where: { id } });
  return json({ ok: true });
});

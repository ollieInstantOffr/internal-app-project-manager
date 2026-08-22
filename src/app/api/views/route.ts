import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { viewCreateSchema } from "@/lib/validators";
import { nextRank } from "@/lib/rank";
import type { Prisma } from "@/generated/prisma/client";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const params = new URL(req.url).searchParams;

  const where: Prisma.SavedViewWhereInput = {
    orgId: ctx.orgId,
    // Yours, plus anything a colleague chose to share.
    OR: [{ ownerId: ctx.userId }, { shared: true }],
  };
  const scope = params.get("scope");
  if (scope) where.scope = scope as never;

  const projectId = params.get("projectId");
  // A view pinned to a project shows there; one with no project shows everywhere.
  if (projectId) where.AND = [{ OR: [{ projectId }, { projectId: null }] }];

  const views = await db.savedView.findMany({
    where,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { owner: { select: { id: true, name: true } } },
  });

  return json({ views });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, viewCreateSchema);

  if (body.projectId) {
    const project = await db.project.findFirst({
      where: { id: body.projectId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!project) body.projectId = null;
  }

  const siblings = await db.savedView.findMany({
    where: { ownerId: ctx.userId, scope: body.scope },
    select: { position: true },
  });

  // Only one default per person per screen.
  if (body.isDefault) {
    await db.savedView.updateMany({
      where: { ownerId: ctx.userId, scope: body.scope, isDefault: true },
      data: { isDefault: false },
    });
  }

  const view = await db.savedView.create({
    data: {
      orgId: ctx.orgId,
      ownerId: ctx.userId,
      name: body.name,
      scope: body.scope,
      projectId: body.projectId ?? null,
      filters: body.filters as Prisma.InputJsonValue,
      shared: body.shared ?? false,
      isDefault: body.isDefault ?? false,
      position: nextRank(siblings.map((s) => s.position)),
    },
    include: { owner: { select: { id: true, name: true } } },
  });

  return json({ ok: true, view }, { status: 201 });
});

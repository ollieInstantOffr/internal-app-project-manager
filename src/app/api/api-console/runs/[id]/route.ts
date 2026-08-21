import { db } from "@/lib/db";
import { handler, json, fail, requireApiContext } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;

  const run = await db.apiRun.findFirst({
    where: { id, project: { orgId: ctx.orgId } },
    include: {
      environment: true,
      collection: true,
      triggeredBy: { select: { id: true, name: true, avatarHue: true } },
      results: {
        orderBy: { createdAt: "asc" },
        include: { issue: { select: { key: true, title: true } } },
      },
    },
  });
  if (!run) return fail(404, "Run not found");

  // Previous run on the same target, for the "vs main" comparison.
  const previous = await db.apiRun.findFirst({
    where: {
      projectId: run.projectId,
      collectionId: run.collectionId,
      createdAt: { lt: run.createdAt },
      environment: { kind: "STATIC" },
    },
    orderBy: { createdAt: "desc" },
    select: { failed: true, p95Ms: true, environment: { select: { name: true } } },
  });

  return json({ run, previous });
});

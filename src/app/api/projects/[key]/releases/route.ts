import { db } from "@/lib/db";
import { handler, json, parseBody, projectInOrg, requireApiContext } from "@/lib/api";
import { releaseSchema } from "@/lib/validators";
import { sortReleases } from "@/lib/releases";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const project = await projectInOrg(ctx.orgId, key);

  const releases = await db.release.findMany({
    where: { projectId: project.id },
    include: { _count: { select: { issues: true, epics: true } } },
  });

  // Newest version first, which is what a picker wants at the top.
  return json({ releases: sortReleases(releases).reverse() });
});

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const project = await projectInOrg(ctx.orgId, key);
  const body = await parseBody(req, releaseSchema);

  // Upsert, so picking a name that already exists is the same as choosing it.
  const release = await db.release.upsert({
    where: { projectId_name: { projectId: project.id, name: body.name } },
    create: { projectId: project.id, name: body.name, notes: body.notes ?? null },
    update: {},
    include: { _count: { select: { issues: true, epics: true } } },
  });

  return json({ ok: true, release }, { status: 201 });
});

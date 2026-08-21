import { db } from "@/lib/db";
import { handler, json, parseBody, projectInOrg, requireApiContext } from "@/lib/api";
import { roadmapSettingsSchema } from "@/lib/validators";
import { ensureRoadmapPage } from "@/lib/roadmap";
import { Role } from "@/lib/types";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const project = await projectInOrg(ctx.orgId, key);

  const [page, epics] = await Promise.all([
    ensureRoadmapPage(project.id),
    db.epic.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, color: true, status: true, publicVisible: true },
    }),
  ]);

  return json({ page, epics });
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  // Publishing is an outward-facing act, so it's not a member-level change.
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { key } = await params;
  const project = await projectInOrg(ctx.orgId, key);
  await ensureRoadmapPage(project.id);

  const { epics, ...settings } = await parseBody(req, roadmapSettingsSchema);

  if (epics?.length) {
    const ids = epics.map((e) => e.id);
    const owned = await db.epic.findMany({
      where: { id: { in: ids }, projectId: project.id },
      select: { id: true },
    });
    const allowed = new Set(owned.map((e) => e.id));

    await db.$transaction(
      epics
        .filter((e) => allowed.has(e.id))
        .map((e) =>
          db.epic.update({ where: { id: e.id }, data: { publicVisible: e.publicVisible } }),
        ),
    );
  }

  const existing = await db.roadmapPage.findUniqueOrThrow({ where: { projectId: project.id } });

  const page = await db.roadmapPage.update({
    where: { projectId: project.id },
    data: {
      ...settings,
      // The first time it goes live is the date visitors see.
      ...(settings.enabled && !existing.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  return json({ ok: true, page });
});

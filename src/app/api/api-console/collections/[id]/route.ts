import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

async function owned(orgId: string, id: string) {
  return db.apiCollection.findFirst({
    where: { id, project: { orgId } },
    include: { _count: { select: { requests: true } } },
  });
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await owned(ctx.orgId, id);
  if (!existing) return fail(404, "Collection not found");

  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80) }));

  const clash = await db.apiCollection.findUnique({
    where: { projectId_name: { projectId: existing.projectId, name } },
  });
  if (clash && clash.id !== id) return fail(409, "A collection with that name already exists");

  // Renaming detaches it from the repo folder it came from, so the next sync
  // recreates that folder rather than silently reclaiming this one.
  const collection = await db.apiCollection.update({
    where: { id },
    data: { name, source: "MANUAL", repoPath: null },
  });

  return json({ ok: true, collection });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await owned(ctx.orgId, id);
  if (!existing) return fail(404, "Collection not found");

  await db.apiCollection.delete({ where: { id } });

  return json({
    ok: true,
    deleted: existing.name,
    requests: existing._count.requests,
    // A repo-derived folder comes back on the next sync — say so rather than
    // letting it reappear as a surprise.
    returnsOnSync: existing.source === "REPO",
  });
});

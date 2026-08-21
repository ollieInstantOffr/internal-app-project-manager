import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext, projectInOrg } from "@/lib/api";
import { collectionSchema } from "@/lib/api-console/validators";
import { nextRank } from "@/lib/rank";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, collectionSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const clash = await db.apiCollection.findUnique({
    where: { projectId_name: { projectId: project.id, name: body.name } },
  });
  if (clash) return fail(409, "A collection with that name already exists");

  const siblings = await db.apiCollection.findMany({
    where: { projectId: project.id },
    select: { position: true },
  });

  const collection = await db.apiCollection.create({
    data: {
      projectId: project.id,
      name: body.name,
      source: "MANUAL",
      position: nextRank(siblings.map((s) => s.position)),
    },
  });

  return json({ ok: true, collection }, { status: 201 });
});

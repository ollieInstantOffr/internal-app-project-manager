import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { requestCreateSchema } from "@/lib/api-console/validators";
import { nextRank } from "@/lib/rank";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, requestCreateSchema);

  const collection = await db.apiCollection.findFirst({
    where: { id: body.collectionId, project: { orgId: ctx.orgId } },
    include: { requests: { select: { position: true } } },
  });
  if (!collection) return fail(404, "Collection not found");

  const request = await db.apiRequest.create({
    data: {
      collectionId: collection.id,
      name: body.name,
      method: body.method,
      path: body.path,
      body: body.body ?? null,
      headers: (body.headers ?? undefined) as never,
      params: (body.params ?? undefined) as never,
      assertions: body.assertions ?? "status == 200",
      position: nextRank(collection.requests.map((r) => r.position)),
    },
  });

  return json({ ok: true, request }, { status: 201 });
});

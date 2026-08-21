import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { requestUpdateSchema } from "@/lib/api-console/validators";

type Ctx = { params: Promise<{ id: string }> };

async function owned(orgId: string, id: string) {
  return db.apiRequest.findFirst({
    where: { id, collection: { project: { orgId } } },
    include: { collection: true },
  });
}

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await owned(ctx.orgId, id);
  if (!existing) return fail(404, "Request not found");

  const body = await parseBody(req, requestUpdateSchema);
  const request = await db.apiRequest.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.method !== undefined ? { method: body.method } : {}),
      ...(body.path !== undefined ? { path: body.path } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.headers !== undefined ? { headers: (body.headers ?? undefined) as never } : {}),
      ...(body.params !== undefined ? { params: (body.params ?? undefined) as never } : {}),
      ...(body.assertions !== undefined ? { assertions: body.assertions } : {}),
    },
  });

  return json({ ok: true, request });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await owned(ctx.orgId, id);
  if (!existing) return fail(404, "Request not found");
  await db.apiRequest.delete({ where: { id } });
  return json({ ok: true });
});

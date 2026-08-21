import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { environmentUpdateSchema } from "@/lib/api-console/validators";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await db.apiEnvironment.findFirst({
    where: { id, project: { orgId: ctx.orgId } },
  });
  if (!existing) return fail(404, "Environment not found");

  const body = await parseBody(req, environmentUpdateSchema);
  const environment = await db.apiEnvironment.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.baseUrl ? { baseUrl: body.baseUrl.replace(/\/+$/, "") } : {}),
      ...(body.kind ? { kind: body.kind } : {}),
      ...(body.prNumber !== undefined ? { prNumber: body.prNumber } : {}),
      ...(body.color ? { color: body.color } : {}),
      ...(body.variables !== undefined
        ? { variables: (body.variables ?? undefined) as never }
        : {}),
    },
  });

  return json({ ok: true, environment });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const existing = await db.apiEnvironment.findFirst({
    where: { id, project: { orgId: ctx.orgId } },
  });
  if (!existing) return fail(404, "Environment not found");
  await db.apiEnvironment.delete({ where: { id } });
  return json({ ok: true });
});

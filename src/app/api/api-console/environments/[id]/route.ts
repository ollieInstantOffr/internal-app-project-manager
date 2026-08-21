import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { environmentUpdateSchema } from "@/lib/api-console/validators";
import { maskEnvironment } from "@/lib/api-console/sync";

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
      ...(body.authType ? { authType: body.authType } : {}),
      ...(body.authUsername !== undefined ? { authUsername: body.authUsername || null } : {}),
      ...(body.authName !== undefined ? { authName: body.authName || null } : {}),
      // Turning auth off discards the secret rather than leaving it lying about.
      ...(body.authType === "NONE"
        ? { authToken: null, authUsername: null, authName: null }
        : body.authToken === undefined
          ? // An omitted token keeps the stored one, so the edit form can leave it blank.
            {}
          : { authToken: body.authToken || null }),
    },
  });

  return json({ ok: true, environment: maskEnvironment(environment) });
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

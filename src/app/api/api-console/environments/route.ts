import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext, projectInOrg } from "@/lib/api";
import { environmentSchema } from "@/lib/api-console/validators";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, environmentSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const clash = await db.apiEnvironment.findUnique({
    where: { projectId_name: { projectId: project.id, name: body.name } },
  });
  if (clash) return fail(409, "An environment with that name already exists");

  const environment = await db.apiEnvironment.create({
    data: {
      projectId: project.id,
      name: body.name,
      baseUrl: body.baseUrl.replace(/\/+$/, ""),
      kind: body.kind,
      prNumber: body.prNumber ?? null,
      color: body.color ?? (body.kind === "PR_PREVIEW" ? "lime" : "amber"),
      variables: (body.variables ?? undefined) as never,
    },
  });

  return json({ ok: true, environment }, { status: 201 });
});

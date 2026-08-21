import { handler, json, parseBody, requireApiContext, projectInOrg } from "@/lib/api";
import { runSchema } from "@/lib/api-console/validators";
import { runCollection } from "@/lib/api-console/runner";

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, runSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const run = await runCollection({
    orgId: ctx.orgId,
    projectId: project.id,
    collectionId: body.collectionId ?? null,
    environmentId: body.environmentId,
    userId: ctx.userId,
  });

  return json({ ok: true, runId: run.id });
});

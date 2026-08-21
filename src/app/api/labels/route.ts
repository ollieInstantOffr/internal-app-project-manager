import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, projectInOrg } from "@/lib/api";
import { labelSchema } from "@/lib/validators";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const projectKey = new URL(req.url).searchParams.get("project");
  const labels = await db.label.findMany({
    where: {
      project: projectKey ? { orgId: ctx.orgId, key: projectKey.toUpperCase() } : { orgId: ctx.orgId },
    },
    orderBy: { name: "asc" },
  });
  return json({ labels });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, labelSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const label = await db.label.upsert({
    where: { projectId_name: { projectId: project.id, name: body.name } },
    create: { projectId: project.id, name: body.name, color: body.color ?? "slate" },
    update: {},
  });

  return json({ ok: true, label });
});

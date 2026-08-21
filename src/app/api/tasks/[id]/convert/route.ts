import { handler, json, parseBody, projectInOrg, requireApiContext } from "@/lib/api";
import { convertTaskSchema } from "@/lib/validators";
import { convertToIssue } from "@/lib/tasks/service";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const body = await parseBody(req, convertTaskSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const issue = await convertToIssue({
    taskId: id,
    userId: ctx.userId,
    orgId: ctx.orgId,
    projectId: project.id,
  });

  return json({ ok: true, issue: { key: issue.key, title: issue.title } }, { status: 201 });
});

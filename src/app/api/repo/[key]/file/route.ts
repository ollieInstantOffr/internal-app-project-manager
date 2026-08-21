import { handler, json, fail, requireApiContext } from "@/lib/api";
import { getFileContext, getRepoTree, requireRepoProject } from "@/lib/repo";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return fail(400, "A file path is required");

  const { project, repo, token } = await requireRepoProject(ctx.orgId, key, ctx.userId);
  const ref = url.searchParams.get("ref") ?? (await getRepoTree(repo, token)).ref;

  const file = await getFileContext({
    orgId: ctx.orgId,
    projectId: project.id,
    repo,
    token,
    path,
    ref,
  });

  return json({ file });
});

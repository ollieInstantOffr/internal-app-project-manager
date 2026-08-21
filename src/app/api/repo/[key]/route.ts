import { handler, json, requireApiContext } from "@/lib/api";
import { getRepoTree, getBranches, pathsWithIssues, requireRepoProject } from "@/lib/repo";

type Ctx = { params: Promise<{ key: string }> };

/** Tree, branches and which paths have open issues — everything the tree needs. */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const ref = new URL(req.url).searchParams.get("ref") ?? undefined;

  const { project, repo, token } = await requireRepoProject(ctx.orgId, key, ctx.userId);

  const [treeData, branches, flagged] = await Promise.all([
    getRepoTree(repo, token, ref),
    getBranches(repo, token),
    pathsWithIssues(ctx.orgId, repo),
  ]);

  return json({
    project: { id: project.id, key: project.key, name: project.name },
    repo,
    ...treeData,
    branches,
    flaggedPaths: flagged,
  });
});

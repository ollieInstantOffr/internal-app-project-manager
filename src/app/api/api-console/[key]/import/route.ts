import { db } from "@/lib/db";
import { handler, json, fail, requireApiContext, projectInOrg } from "@/lib/api";
import { syncCollectionsFromRepo, ensureDefaultEnvironments } from "@/lib/api-console/sync";
import { appUrl } from "@/lib/app-url";
import { githubTokenFor } from "@/lib/github-auth";

type Ctx = { params: Promise<{ key: string }> };

/** Rescans the repo's /api folder and rebuilds the derived collections. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const project = await projectInOrg(ctx.orgId, key);

  if (!project.repoFullName) {
    return fail(400, "This project has no repository linked — connect one first");
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const token = await githubTokenFor(user.id);
  if (!token) {
    return fail(400, "Connect your GitHub account to read the repository");
  }

  await ensureDefaultEnvironments(project.id, appUrl());

  const outcome = await syncCollectionsFromRepo({
    projectId: project.id,
    repoFullName: project.repoFullName,
    token,
  });

  if (!outcome.found) {
    return json({
      ok: true,
      ...outcome,
      message: `No /api folder found in ${project.repoFullName}`,
    });
  }

  return json({ ok: true, ...outcome });
});

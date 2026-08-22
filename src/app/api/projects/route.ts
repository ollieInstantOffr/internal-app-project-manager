import { db } from "@/lib/db";
import { handler, json, parseBody } from "@/lib/api";
import { projectSchema } from "@/lib/validators";
import { requireApiContext } from "@/lib/api";
import { createProject } from "@/lib/projects";
import { Role } from "@/lib/types";
import { githubTokenFor } from "@/lib/github-auth";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const projects = await db.project.findMany({
    where: { orgId: ctx.orgId, archived: false },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { issues: true } } },
  });
  return json({ projects });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.MEMBER);
  const body = await parseBody(req, projectSchema);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });

  const { project, imported } = await createProject({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    name: body.name,
    key: body.key,
    color: body.color,
    repoFullName: body.repoFullName,
    importIssues: body.importIssues,
    importLabels: body.importLabels,
    importClosed: body.importClosed,
    githubToken: await githubTokenFor(user.id),
  });

  return json({ ok: true, project, imported });
});

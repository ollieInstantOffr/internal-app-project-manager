import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, projectInOrg } from "@/lib/api";
import { epicSchema } from "@/lib/validators";
import { ActivityType, IssueStatus } from "@/lib/types";
import { logActivity } from "@/lib/activity";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const projectKey = new URL(req.url).searchParams.get("project");

  const epics = await db.epic.findMany({
    where: {
      project: projectKey
        ? { orgId: ctx.orgId, key: projectKey.toUpperCase() }
        : { orgId: ctx.orgId },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    include: {
      project: { select: { id: true, key: true, name: true, color: true } },
      issues: { select: { id: true, status: true, estimate: true } },
    },
  });

  return json({
    epics: epics.map((e) => {
      const done = e.issues.filter((i) => i.status === IssueStatus.DONE).length;
      return {
        id: e.id,
        key: e.key,
        name: e.name,
        description: e.description,
        color: e.color,
        status: e.status,
        startDate: e.startDate,
        targetDate: e.targetDate,
        project: e.project,
        issueCount: e.issues.length,
        doneCount: done,
        points: e.issues.reduce((n, i) => n + (i.estimate ?? 0), 0),
        progress: e.issues.length ? Math.round((done / e.issues.length) * 100) : 0,
      };
    }),
  });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, epicSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const org = await db.organization.update({
    where: { id: ctx.orgId },
    data: { epicCounter: { increment: 1 } },
    select: { epicCounter: true },
  });

  const epic = await db.epic.create({
    data: {
      projectId: project.id,
      key: `EPIC-${org.epicCounter}`,
      name: body.name,
      description: body.description ?? null,
      color: body.color ?? project.color,
      status: body.status,
      startDate: body.startDate ?? null,
      targetDate: body.targetDate ?? null,
    },
  });

  await logActivity({
    orgId: ctx.orgId,
    type: ActivityType.EPIC_CREATED,
    message: `created epic ${epic.name}`,
    actorId: ctx.userId,
  });

  return json({ ok: true, epic }, { status: 201 });
});

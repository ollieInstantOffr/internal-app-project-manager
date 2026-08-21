import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext, projectInOrg } from "@/lib/api";
import { sprintSchema } from "@/lib/validators";
import { IssueStatus, SprintStatus } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const projectKey = new URL(req.url).searchParams.get("project");

  const sprints = await db.sprint.findMany({
    where: {
      project: projectKey
        ? { orgId: ctx.orgId, key: projectKey.toUpperCase() }
        : { orgId: ctx.orgId },
    },
    orderBy: { number: "desc" },
    include: {
      project: { select: { id: true, key: true, name: true } },
      issues: { select: { id: true, status: true, estimate: true } },
    },
  });

  return json({
    sprints: sprints.map((s) => ({
      id: s.id,
      name: s.name,
      number: s.number,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      capacity: s.capacity,
      committedPoints: s.committedPoints,
      project: s.project,
      issueCount: s.issues.length,
      points: s.issues.reduce((n, i) => n + (i.estimate ?? 0), 0),
      donePoints: s.issues
        .filter((i) => i.status === IssueStatus.DONE)
        .reduce((n, i) => n + (i.estimate ?? 0), 0),
    })),
  });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, sprintSchema);
  const project = await projectInOrg(ctx.orgId, body.projectId);

  const last = await db.sprint.findFirst({
    where: { projectId: project.id },
    orderBy: { number: "desc" },
  });
  const number = (last?.number ?? 0) + 1;

  // Capacity defaults to what the team actually finished, not what they hoped for.
  const recent = await db.sprint.findMany({
    where: { projectId: project.id, status: SprintStatus.COMPLETED },
    orderBy: { number: "desc" },
    take: 3,
    include: { issues: { select: { status: true, estimate: true } } },
  });
  const velocities = recent.map((s) =>
    s.issues.filter((i) => i.status === IssueStatus.DONE).reduce((n, i) => n + (i.estimate ?? 0), 0),
  );
  const derivedCapacity = velocities.length
    ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
    : 40;

  const sprint = await db.sprint.create({
    data: {
      projectId: project.id,
      number,
      name: body.name || `Sprint ${number}`,
      startDate: body.startDate,
      endDate: body.endDate,
      capacity: body.capacity ?? derivedCapacity,
    },
  });

  return json({ ok: true, sprint }, { status: 201 });
});

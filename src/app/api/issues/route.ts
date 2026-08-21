import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { issueCreateSchema } from "@/lib/validators";
import { createIssue, ISSUE_INCLUDE } from "@/lib/issues";
import { IssueStatus } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const p = new URL(req.url).searchParams;

  const where: Prisma.IssueWhereInput = {
    project: { orgId: ctx.orgId },
    archivedAt: p.get("archived") === "1" ? { not: null } : null,
  };

  const projectKey = p.get("project");
  if (projectKey) where.project = { orgId: ctx.orgId, key: projectKey.toUpperCase() };

  const status = p.get("status");
  if (status) where.status = { in: status.split(",") as IssueStatus[] };

  const assignee = p.get("assignee");
  if (assignee) where.assigneeId = assignee === "none" ? null : assignee;

  const sprint = p.get("sprint");
  if (sprint) where.sprintId = sprint === "none" ? null : sprint;

  const epic = p.get("epic");
  if (epic) where.epicId = epic === "none" ? null : epic;

  const q = p.get("q");
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { key: { contains: q, mode: "insensitive" } },
    ];
  }

  const issues = await db.issue.findMany({
    where,
    include: ISSUE_INCLUDE,
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    take: Math.min(Number(p.get("limit") ?? 500), 1000),
  });

  return json({ issues });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, issueCreateSchema);

  const issue = await createIssue({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    projectId: body.projectId,
    title: body.title,
    description: body.description,
    status: body.status,
    priority: body.priority,
    estimate: body.estimate,
    assigneeId: body.assigneeId,
    epicId: body.epicId,
    sprintId: body.sprintId,
    labelIds: body.labelIds,
    dueDate: body.dueDate,
  });

  return json({ ok: true, issue }, { status: 201 });
});

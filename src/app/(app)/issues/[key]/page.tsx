import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { ISSUE_INCLUDE } from "@/lib/issues";
import { serializeIssue } from "@/lib/serialize";
import { IssueDetail } from "@/components/issue/IssueDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} · Arc` };
}

export default async function IssuePage({ params }: { params: Promise<{ key: string }> }) {
  const { org } = await requireOrg();
  const { key } = await params;

  const issue = await db.issue.findFirst({
    where: { project: { orgId: org.id }, key: key.toUpperCase() },
    include: ISSUE_INCLUDE,
  });
  if (!issue) notFound();

  const [comments, activities, epics, sprints, labels, siblings] = await Promise.all([
    db.comment.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, avatarHue: true } } },
    }),
    db.activity.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { id: true, name: true, avatarHue: true } } },
    }),
    db.epic.findMany({ where: { projectId: issue.projectId }, orderBy: { createdAt: "asc" } }),
    db.sprint.findMany({ where: { projectId: issue.projectId }, orderBy: { number: "desc" } }),
    db.label.findMany({ where: { projectId: issue.projectId }, orderBy: { name: "asc" } }),
    db.issue.findMany({
      where: { projectId: issue.projectId, archivedAt: null, status: issue.status },
      orderBy: { rank: "asc" },
      select: { key: true },
    }),
  ]);

  const index = siblings.findIndex((s) => s.key === issue.key);

  return (
    <IssueDetail
      issue={serializeIssue(issue)}
      projectName={issue.project.name}
      subtasks={issue.subtasks.map((s) => ({
        id: s.id,
        title: s.title,
        done: s.done,
        assignee: s.assignee,
      }))}
      comments={comments.map((c) => ({
        id: c.id,
        body: c.body,
        automated: c.automated,
        createdAt: c.createdAt.toISOString(),
        author: c.author,
      }))}
      activities={activities.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        automatic: a.automatic,
        createdAt: a.createdAt.toISOString(),
        actor: a.actor,
      }))}
      epics={epics.map((e) => ({
        id: e.id,
        key: e.key,
        name: e.name,
        color: e.color,
        status: e.status,
      }))}
      sprints={sprints.map((s) => ({
        id: s.id,
        name: s.name,
        number: s.number,
        status: s.status,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
        capacity: s.capacity,
      }))}
      labels={labels}
      neighbours={{
        prev: index > 0 ? siblings[index - 1].key : null,
        next: index !== -1 && index < siblings.length - 1 ? siblings[index + 1].key : null,
      }}
    />
  );
}

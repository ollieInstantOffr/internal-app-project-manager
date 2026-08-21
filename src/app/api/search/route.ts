import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/constants";
import { IssueStatus } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  if (!q) {
    // An empty palette still needs somewhere to go — most recently touched work.
    const recent = await db.issue.findMany({
      where: { project: { orgId: ctx.orgId }, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        assignee: { select: { id: true, name: true, avatarHue: true } },
        project: { select: { key: true, color: true } },
      },
    });
    return json({
      issues: recent.map(serializeIssue),
      epics: [],
      projects: [],
      members: [],
    });
  }

  const [issues, epics, projects, members] = await Promise.all([
    db.issue.findMany({
      where: {
        project: { orgId: ctx.orgId },
        archivedAt: null,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { key: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 8,
      include: {
        assignee: { select: { id: true, name: true, avatarHue: true } },
        project: { select: { key: true, color: true } },
      },
    }),
    db.epic.findMany({
      where: {
        project: { orgId: ctx.orgId },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { key: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 4,
      include: {
        project: { select: { key: true, name: true } },
        issues: { select: { status: true } },
      },
    }),
    db.project.findMany({
      where: { orgId: ctx.orgId, archived: false, name: { contains: q, mode: "insensitive" } },
      take: 4,
      select: { id: true, key: true, name: true, color: true },
    }),
    db.user.findMany({
      where: {
        memberships: { some: { orgId: ctx.orgId } },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 4,
      select: { id: true, name: true, email: true, avatarHue: true },
    }),
  ]);

  return json({
    issues: issues.map(serializeIssue),
    epics: epics.map((e) => {
      const done = e.issues.filter((i) => i.status === IssueStatus.DONE).length;
      return {
        id: e.id,
        key: e.key,
        name: e.name,
        projectKey: e.project.key,
        projectName: e.project.name,
        progress: e.issues.length ? Math.round((done / e.issues.length) * 100) : 0,
      };
    }),
    projects,
    members,
  });
});

function serializeIssue(issue: {
  id: string;
  key: string;
  title: string;
  status: IssueStatus;
  assignee: { id: string; name: string; avatarHue: number } | null;
  project: { key: string; color: string };
}) {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    status: issue.status,
    statusLabel: STATUS_LABEL[issue.status],
    assignee: issue.assignee,
    projectKey: issue.project.key,
    projectColor: issue.project.color,
  };
}

import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { IssueStatus, NotificationKind, Urgency } from "@/lib/types";
import { MyWork, type QueueItem } from "@/components/mywork/MyWork";

export const metadata = { title: "My work · Arc" };
export const dynamic = "force-dynamic";

const ISSUE_SHAPE = {
  id: true,
  key: true,
  title: true,
  description: true,
  status: true,
  estimate: true,
  sprint: { select: { name: true } },
  project: { select: { name: true } },
  assignee: { select: { id: true, name: true, avatarHue: true } },
  branches: { take: 1, orderBy: { createdAt: "desc" } },
  pullRequests: { take: 1, orderBy: { createdAt: "desc" } },
  comments: {
    take: 1,
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, avatarHue: true } } },
  },
} as const;

type IssueRow = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  estimate: number | null;
  sprint: { name: string } | null;
  project: { name: string };
  assignee: { id: string; name: string; avatarHue: number } | null;
  branches: { name: string; repo: string }[];
  pullRequests: { number: number; state: string; checksFailed: number }[];
  comments: { body: string; author: { name: string; avatarHue: number } | null }[];
};

function shapeIssue(issue: IssueRow | null): QueueItem["issue"] {
  if (!issue) return null;
  const comment = issue.comments[0];
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    estimate: issue.estimate,
    sprintName: issue.sprint?.name ?? null,
    projectName: issue.project.name,
    assignee: issue.assignee,
    branch: issue.branches[0] ? { name: issue.branches[0].name, repo: issue.branches[0].repo } : null,
    pr: issue.pullRequests[0]
      ? {
          number: issue.pullRequests[0].number,
          state: issue.pullRequests[0].state,
          checksFailed: issue.pullRequests[0].checksFailed,
        }
      : null,
    lastComment: comment
      ? {
          body: comment.body,
          author: comment.author?.name ?? "Arc",
          hue: comment.author?.avatarHue ?? 285,
        }
      : null,
  };
}

/** Issues become queue rows too, so "Assigned" and "Watching" read like the inbox. */
function issueAsItem(issue: IssueRow, kind: NotificationKind, urgency: Urgency): QueueItem {
  return {
    id: `issue-${issue.id}`,
    kind,
    urgency,
    title: issue.title,
    detail: [issue.key, issue.sprint?.name, issue.estimate ? `${issue.estimate} pts` : null]
      .filter(Boolean)
      .join(" · "),
    createdAt: new Date().toISOString(),
    read: true,
    issue: shapeIssue(issue),
  };
}

export default async function MyWorkPage() {
  const { org, user } = await requireOrg();

  const [notifications, assigned, watching, done] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      include: { issue: { select: ISSUE_SHAPE } },
    }),
    db.issue.findMany({
      where: {
        project: { orgId: org.id },
        assigneeId: user.id,
        archivedAt: null,
        status: { not: IssueStatus.DONE },
      },
      orderBy: [{ status: "asc" }, { rank: "asc" }],
      select: ISSUE_SHAPE,
    }),
    db.issue.findMany({
      where: {
        project: { orgId: org.id },
        archivedAt: null,
        watchers: { some: { userId: user.id } },
        status: { not: IssueStatus.DONE },
      },
      orderBy: { updatedAt: "desc" },
      select: ISSUE_SHAPE,
    }),
    db.issue.findMany({
      where: {
        project: { orgId: org.id },
        assigneeId: user.id,
        status: IssueStatus.DONE,
      },
      orderBy: { completedAt: "desc" },
      take: 25,
      select: ISSUE_SHAPE,
    }),
  ]);

  const needsMe: QueueItem[] = notifications.map((n) => ({
    id: n.id,
    kind: n.kind,
    urgency: n.urgency,
    title: n.title,
    detail: n.detail,
    createdAt: n.createdAt.toISOString(),
    read: !!n.readAt,
    issue: shapeIssue(n.issue as IssueRow | null),
  }));

  const items = {
    "needs-me": needsMe,
    assigned: (assigned as IssueRow[]).map((i) =>
      issueAsItem(
        i,
        NotificationKind.ASSIGNED,
        i.status === IssueStatus.IN_PROGRESS ? Urgency.TODAY : Urgency.LATER,
      ),
    ),
    watching: (watching as IssueRow[]).map((i) =>
      issueAsItem(i, NotificationKind.COMMENT, Urgency.LATER),
    ),
    done: (done as IssueRow[]).map((i) => issueAsItem(i, NotificationKind.ASSIGNED, Urgency.LATER)),
  };

  return (
    <MyWork
      items={items}
      counts={{
        "needs-me": items["needs-me"].length,
        assigned: items.assigned.length,
        watching: items.watching.length,
        done: items.done.length,
      }}
    />
  );
}

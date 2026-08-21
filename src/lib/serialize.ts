import type { IssueStatus } from "./types";

type RawIssue = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: string;
  estimate: number | null;
  rank: number;
  dueDate: Date | null;
  assignee: { id: string; name: string; avatarHue: number } | null;
  epic: { id: string; key: string; name: string; color: string } | null;
  sprint: { id: string; name: string; number: number } | null;
  labels: { label: { id: string; name: string; color: string } }[];
  branches: { id: string; name: string; repo: string }[];
  pullRequests: {
    id: string;
    number: number;
    state: string;
    approvals: number;
    checksPassed: number;
    checksFailed: number;
  }[];
  blockedBy?: { blocker: { key: string; status: IssueStatus } }[];
  blocks?: { blocked: { key: string; status: IssueStatus } }[];
  subtasks: { done: boolean }[];
  _count: { comments: number };
};

/** Flattens a Prisma issue into the shape the board, backlog and queue all render. */
export function serializeIssue(issue: RawIssue) {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority as never,
    estimate: issue.estimate,
    rank: issue.rank,
    dueDate: issue.dueDate ? issue.dueDate.toISOString() : null,
    assignee: issue.assignee,
    epic: issue.epic,
    sprint: issue.sprint,
    labels: issue.labels.map((l) => l.label),
    branches: issue.branches,
    pullRequests: issue.pullRequests as never,
    blockedBy: (issue.blockedBy ?? []).map((b) => b.blocker),
    blocks: (issue.blocks ?? []).map((b) => b.blocked),
    subtaskDone: issue.subtasks.filter((s) => s.done).length,
    subtaskTotal: issue.subtasks.length,
    commentCount: issue._count.comments,
  };
}

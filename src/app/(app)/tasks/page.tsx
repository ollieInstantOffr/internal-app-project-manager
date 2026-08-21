import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { focusThisWeek, TASK_INCLUDE } from "@/lib/tasks/service";
import { TasksPage } from "@/components/tasks/TasksPage";
import type { TaskItem, TasksData } from "@/components/tasks/types";

export const metadata = { title: "Tasks · Arc" };
export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof db.task.findFirst<{ include: typeof TASK_INCLUDE }>>>;

function shape(task: NonNullable<Row>): TaskItem {
  return {
    id: task.id,
    title: task.title,
    note: task.note,
    status: task.status,
    dueDate: task.dueDate?.toISOString() ?? null,
    estimateMinutes: task.estimateMinutes,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    list: task.list,
    owner: task.owner,
    delegatedBy: task.delegatedBy,
    delegationStatus: task.delegationStatus,
    delegationNote: task.delegationNote,
    declineReason: task.declineReason,
    proposedDate: task.proposedDate?.toISOString() ?? null,
    canRenegotiate: task.canRenegotiate,
    delegatedAt: task.delegatedAt?.toISOString() ?? null,
    nudgedAt: task.nudgedAt?.toISOString() ?? null,
    issue: task.issue,
    convertedIssueId: task.convertedIssueId,
    subtasks: task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
  };
}

export default async function Page() {
  const { org, user } = await requireOrg();
  const now = new Date();

  const [mine, delegated, done, lists, focus, activeSession, projects] = await Promise.all([
    db.task.findMany({
      where: { ownerId: user.id, orgId: org.id, status: "OPEN" },
      include: TASK_INCLUDE,
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }],
    }),
    // What I've sent out — it lives on their page, but I still watch it here.
    db.task.findMany({
      where: { delegatedById: user.id, orgId: org.id, status: "OPEN" },
      include: TASK_INCLUDE,
      orderBy: { delegatedAt: "desc" },
    }),
    db.task.findMany({
      where: { ownerId: user.id, orgId: org.id, status: "DONE" },
      include: TASK_INCLUDE,
      orderBy: { completedAt: "desc" },
      take: 50,
    }),
    db.taskList.findMany({
      where: { ownerId: user.id },
      orderBy: { position: "asc" },
      select: { id: true, name: true, color: true },
    }),
    focusThisWeek(user.id, now),
    db.focusSession.findFirst({
      where: { userId: user.id, endedAt: null },
      orderBy: { startedAt: "desc" },
    }),
    db.project.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, key: true, name: true },
    }),
  ]);

  const data: TasksData = {
    mine: mine.map(shape),
    delegated: delegated.map(shape),
    done: done.map(shape),
    lists,
    focus,
    activeSession: activeSession
      ? {
          id: activeSession.id,
          taskId: activeSession.taskId,
          plannedMinutes: activeSession.plannedMinutes,
          startedAt: activeSession.startedAt.toISOString(),
        }
      : null,
    projects,
    now: now.toISOString(),
  };

  return <TasksPage data={data} />;
}

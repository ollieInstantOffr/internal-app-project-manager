import "server-only";
import { db } from "./db";
import { ActivityType, IssueStatus, SprintStatus } from "./types";

const DAY = 864e5;

export type SprintVelocity = {
  id: string;
  name: string;
  short: string;
  committed: number;
  completed: number;
  active: boolean;
};

export type Insights = {
  velocity: { average: number; spread: number; sprints: SprintVelocity[] };
  cycleTimeDays: number;
  cycleTimeDelta: number;
  reviewWaitHours: number;
  scopeChangePct: number;
  timeInStatus: { status: IssueStatus; days: number; share: number }[];
  bottleneck: { status: IssueStatus; note: string } | null;
  stalePrCount: number;
};

/**
 * Everything on the Insights screen, derived from real issue timestamps and the
 * status-change activity trail rather than anything self-reported.
 */
export async function computeInsights(orgId: string, projectId?: string | null, sprintCount = 6): Promise<Insights> {
  const projectFilter = projectId ? { id: projectId } : { orgId };

  const sprints = await db.sprint.findMany({
    where: { project: projectFilter, status: { in: [SprintStatus.ACTIVE, SprintStatus.COMPLETED] } },
    orderBy: [{ startDate: "desc" }],
    take: sprintCount,
    include: { issues: { select: { estimate: true, status: true, completedAt: true } } },
  });
  sprints.reverse();

  const velocitySprints: SprintVelocity[] = sprints.map((s) => ({
    id: s.id,
    name: s.name,
    short: `S${s.number}`,
    committed: s.committedPoints || s.issues.reduce((n, i) => n + (i.estimate ?? 0), 0),
    completed: s.issues
      .filter((i) => i.status === IssueStatus.DONE)
      .reduce((n, i) => n + (i.estimate ?? 0), 0),
    active: s.status === SprintStatus.ACTIVE,
  }));

  const completedSprints = velocitySprints.filter((s) => !s.active);
  const average = completedSprints.length
    ? Math.round(completedSprints.reduce((n, s) => n + s.completed, 0) / completedSprints.length)
    : 0;
  const spread = completedSprints.length
    ? Math.round(
        Math.sqrt(
          completedSprints.reduce((n, s) => n + (s.completed - average) ** 2, 0) /
            completedSprints.length,
        ),
      )
    : 0;

  // ── cycle time: started → completed, this window vs the one before it
  const windowStart = new Date(Date.now() - 60 * DAY);
  const priorStart = new Date(Date.now() - 120 * DAY);

  const completedIssues = await db.issue.findMany({
    where: {
      project: projectFilter,
      completedAt: { gte: priorStart },
      startedAt: { not: null },
    },
    select: { startedAt: true, completedAt: true },
  });

  const cycleOf = (from: Date, to: Date) => {
    const rows = completedIssues.filter(
      (i) => i.completedAt && i.completedAt >= from && i.completedAt < to && i.startedAt,
    );
    if (!rows.length) return 0;
    const total = rows.reduce(
      (n, i) => n + (i.completedAt!.getTime() - i.startedAt!.getTime()),
      0,
    );
    return total / rows.length / DAY;
  };

  const cycleTimeDays = cycleOf(windowStart, new Date());
  const priorCycle = cycleOf(priorStart, windowStart);

  // ── time in status, reconstructed from the status-change trail
  const transitions = await db.activity.findMany({
    where: {
      orgId,
      type: ActivityType.STATUS_CHANGED,
      createdAt: { gte: windowStart },
      ...(projectId ? { issue: { projectId } } : {}),
    },
    select: { issueId: true, meta: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byIssue = new Map<string, { at: Date; from: string | null; to: string }[]>();
  for (const t of transitions) {
    if (!t.issueId) continue;
    const meta = (t.meta ?? {}) as { from?: string; to?: string };
    if (!meta.to) continue;
    const list = byIssue.get(t.issueId) ?? [];
    list.push({ at: t.createdAt, from: meta.from ?? null, to: meta.to });
    byIssue.set(t.issueId, list);
  }

  const durations: Record<string, number[]> = {};
  for (const list of byIssue.values()) {
    for (let i = 0; i < list.length - 1; i++) {
      const status = list[i].to;
      const ms = list[i + 1].at.getTime() - list[i].at.getTime();
      if (ms <= 0) continue;
      (durations[status] ??= []).push(ms);
    }
  }

  const avgDays = (status: IssueStatus) => {
    const rows = durations[status];
    if (!rows?.length) return 0;
    return rows.reduce((a, b) => a + b, 0) / rows.length / DAY;
  };

  const tracked: IssueStatus[] = [
    IssueStatus.IN_PROGRESS,
    IssueStatus.IN_REVIEW,
    IssueStatus.TODO,
    IssueStatus.TRIAGE,
  ];
  const rawTimes = tracked.map((status) => ({ status, days: avgDays(status) }));
  const totalDays = rawTimes.reduce((n, r) => n + r.days, 0);
  const timeInStatus = rawTimes.map((r) => ({
    ...r,
    share: totalDays ? r.days / totalDays : 0,
  }));

  const reviewWaitHours = avgDays(IssueStatus.IN_REVIEW) * 24;

  // ── mid-sprint scope: issues that joined an active sprint after it started
  const active = await db.sprint.findFirst({
    where: { project: projectFilter, status: SprintStatus.ACTIVE },
    include: { issues: { select: { estimate: true, createdAt: true } } },
  });
  let scopeChangePct = 0;
  if (active) {
    const added = active.issues.filter((i) => i.createdAt > active.startDate);
    const addedPoints = added.reduce((n, i) => n + (i.estimate ?? 0), 0);
    const committed =
      active.committedPoints || active.issues.reduce((n, i) => n + (i.estimate ?? 0), 0);
    scopeChangePct = committed ? Math.round((addedPoints / committed) * 100) : 0;
  }

  const stalePrCount = await db.pullRequest.count({
    where: {
      issue: { project: projectFilter },
      state: { in: ["OPEN", "DRAFT"] },
      createdAt: { lt: new Date(Date.now() - 2 * DAY) },
    },
  });

  const worst = [...timeInStatus].sort((a, b) => b.days - a.days)[0];
  const bottleneck =
    worst && worst.days > 0
      ? {
          status: worst.status,
          note:
            worst.status === IssueStatus.IN_REVIEW
              ? `${stalePrCount} PR${stalePrCount === 1 ? "" : "s"} older than 2 days`
              : `${worst.days.toFixed(1)}d average`,
        }
      : null;

  return {
    velocity: { average, spread, sprints: velocitySprints },
    cycleTimeDays: Number(cycleTimeDays.toFixed(1)),
    cycleTimeDelta: Number((cycleTimeDays - priorCycle).toFixed(1)),
    reviewWaitHours: Math.round(reviewWaitHours),
    scopeChangePct,
    timeInStatus,
    bottleneck,
    stalePrCount,
  };
}

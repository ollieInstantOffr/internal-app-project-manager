import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { EpicStatus, IssueStatus, MilestoneStatus } from "@/lib/types";
import { Roadmap } from "@/components/roadmap/Roadmap";

export const metadata = { title: "Roadmap · Arc" };
export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const { org } = await requireOrg();

  const [epics, milestones] = await Promise.all([
    db.epic.findMany({
      where: { project: { orgId: org.id } },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      include: {
        project: { select: { key: true, name: true } },
        issues: { select: { status: true } },
      },
    }),
    db.milestone.findMany({ where: { orgId: org.id }, orderBy: { date: "asc" } }),
  ]);

  const openEpics = epics.filter((e) => e.status !== EpicStatus.DONE);

  return (
    <Roadmap
      now={Date.now()}
      epics={epics.map((e) => {
        const done = e.issues.filter((i) => i.status === IssueStatus.DONE).length;
        return {
          id: e.id,
          key: e.key,
          name: e.name,
          color: e.color,
          status: e.status,
          startDate: e.startDate?.toISOString() ?? null,
          targetDate: e.targetDate?.toISOString() ?? null,
          projectKey: e.project.key,
          projectName: e.project.name,
          issueCount: e.issues.length,
          progress: e.issues.length ? Math.round((done / e.issues.length) * 100) : 0,
        };
      })}
      milestones={milestones.map((m) => {
        const late = openEpics.filter((e) => e.targetDate && e.targetDate > m.date).length;
        return {
          id: m.id,
          name: m.name,
          date: m.date.toISOString(),
          derivedStatus:
            m.status === MilestoneStatus.SHIPPED
              ? MilestoneStatus.SHIPPED
              : late > 0
                ? MilestoneStatus.AT_RISK
                : MilestoneStatus.ON_TRACK,
          lateEpics: late,
        };
      })}
    />
  );
}

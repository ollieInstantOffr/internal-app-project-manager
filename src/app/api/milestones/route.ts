import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { milestoneSchema } from "@/lib/validators";
import { EpicStatus, MilestoneStatus, Role } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const milestones = await db.milestone.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { date: "asc" },
  });

  // "At risk" is derived, never typed in: any epic due after the milestone puts it at risk.
  const epics = await db.epic.findMany({
    where: { project: { orgId: ctx.orgId }, status: { not: EpicStatus.DONE } },
    select: { targetDate: true },
  });

  return json({
    milestones: milestones.map((m) => {
      const late = epics.filter((e) => e.targetDate && e.targetDate > m.date).length;
      return {
        ...m,
        derivedStatus:
          m.status === MilestoneStatus.SHIPPED
            ? MilestoneStatus.SHIPPED
            : late > 0
              ? MilestoneStatus.AT_RISK
              : MilestoneStatus.ON_TRACK,
        lateEpics: late,
      };
    }),
  });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.MEMBER);
  const body = await parseBody(req, milestoneSchema);
  const milestone = await db.milestone.create({
    data: { orgId: ctx.orgId, name: body.name, date: body.date },
  });
  return json({ ok: true, milestone }, { status: 201 });
});

import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { ActivityType, IssueStatus, SprintStatus } from "@/lib/types";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  action: z.enum(["start", "complete"]).optional(),
});

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const sprint = await db.sprint.findFirst({
    where: { id, project: { orgId: ctx.orgId } },
    include: { issues: { select: { id: true, status: true, estimate: true } } },
  });
  if (!sprint) return fail(404, "Sprint not found");

  const body = await parseBody(req, patchSchema);

  if (body.action === "start") {
    const running = await db.sprint.findFirst({
      where: { projectId: sprint.projectId, status: SprintStatus.ACTIVE },
    });
    if (running && running.id !== sprint.id) {
      return fail(409, `${running.name} is still running — complete it first`);
    }
    await db.sprint.update({
      where: { id },
      data: {
        status: SprintStatus.ACTIVE,
        committedPoints: sprint.issues.reduce((n, i) => n + (i.estimate ?? 0), 0),
      },
    });
    await logActivity({
      orgId: ctx.orgId,
      type: ActivityType.SPRINT_STARTED,
      message: `${sprint.name} started`,
      actorId: ctx.userId,
    });
    return json({ ok: true });
  }

  if (body.action === "complete") {
    const unfinished = sprint.issues.filter((i) => i.status !== IssueStatus.DONE);

    const next = await db.sprint.findFirst({
      where: { projectId: sprint.projectId, status: SprintStatus.PLANNED },
      orderBy: { number: "asc" },
    });

    // Unfinished work carries over automatically — to the next sprint if one is
    // planned, otherwise back to the backlog.
    await db.issue.updateMany({
      where: { id: { in: unfinished.map((i) => i.id) } },
      data: { sprintId: next?.id ?? null },
    });

    await db.sprint.update({
      where: { id },
      data: { status: SprintStatus.COMPLETED, completedAt: new Date() },
    });
    await logActivity({
      orgId: ctx.orgId,
      type: ActivityType.SPRINT_COMPLETED,
      message: `${sprint.name} completed — ${unfinished.length} carried over`,
      actorId: ctx.userId,
    });

    return json({ ok: true, carriedOver: unfinished.length, into: next?.name ?? "Backlog" });
  }

  const updated = await db.sprint.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.startDate ? { startDate: body.startDate } : {}),
      ...(body.endDate ? { endDate: body.endDate } : {}),
      ...(body.capacity ? { capacity: body.capacity } : {}),
    },
  });
  return json({ ok: true, sprint: updated });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const sprint = await db.sprint.findFirst({ where: { id, project: { orgId: ctx.orgId } } });
  if (!sprint) return fail(404, "Sprint not found");
  if (sprint.status === SprintStatus.ACTIVE) return fail(409, "Complete the sprint before deleting it");
  await db.sprint.delete({ where: { id } });
  return json({ ok: true });
});

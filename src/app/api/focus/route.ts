import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { focusStartSchema } from "@/lib/validators";
import { currentSession, prefsFor, serializeSession, startSession, todayStats } from "@/lib/focus";
import { HttpError } from "@/lib/auth";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const [session, today, prefs] = await Promise.all([
    currentSession(ctx.userId),
    todayStats(ctx.userId),
    prefsFor(ctx.userId),
  ]);
  return json({ session: serializeSession(session), today, prefs });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const body = await parseBody(req, focusStartSchema);

  if (body.issueId) {
    const issue = await db.issue.findFirst({
      where: { id: body.issueId, project: { orgId: ctx.orgId } },
      select: { id: true },
    });
    if (!issue) throw new HttpError(404, "Issue not found");
  }
  if (body.taskId) {
    const task = await db.task.findFirst({
      where: { id: body.taskId, ownerId: ctx.userId },
      select: { id: true },
    });
    if (!task) throw new HttpError(404, "Task not found");
  }

  // Starting a session never changes issue status — timing and workflow stay apart.
  const session = await startSession({
    userId: ctx.userId,
    plannedMinutes: body.plannedMinutes,
    issueId: body.issueId,
    taskId: body.taskId,
    kind: body.kind,
    replace: body.replace,
  });

  const today = await todayStats(ctx.userId);
  return json({ ok: true, session: serializeSession(session), today }, { status: 201 });
});

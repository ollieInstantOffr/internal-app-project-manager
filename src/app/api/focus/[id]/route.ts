import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { focusActionSchema } from "@/lib/validators";
import {
  endSession,
  FOCUS_INCLUDE,
  logSession,
  serializeSession,
  pauseSession,
  resumeSession,
  skipLogging,
  todayStats,
} from "@/lib/focus";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;
  const body = await parseBody(req, focusActionSchema);

  let session;
  switch (body.action) {
    case "pause":
      session = await pauseSession(id, ctx.userId);
      break;
    case "resume":
      session = await resumeSession(id, ctx.userId);
      break;
    case "end":
      session = await endSession(id, ctx.userId);
      break;
    case "log":
      session = await logSession(id, ctx.userId);
      break;
    case "skip":
      session = await skipLogging(id, ctx.userId);
      break;
    case "extend": {
      const existing = await db.focusSession.findFirst({ where: { id, userId: ctx.userId } });
      if (!existing) throw new HttpError(404, "Session not found");
      if (existing.endedAt) throw new HttpError(409, "That session already ended");
      const next = Math.min(240, Math.max(5, existing.plannedMinutes + (body.step ?? 5)));
      session = await db.focusSession.update({
        where: { id },
        data: { plannedMinutes: next },
        include: FOCUS_INCLUDE,
      });
      break;
    }
  }

  return json({
    ok: true,
    session: serializeSession(session),
    today: await todayStats(ctx.userId),
  });
});

import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { focusEndSchema } from "@/lib/validators";
import { HttpError } from "@/lib/auth";

/** Stops a running session, recording the minutes actually spent. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;

  const session = await db.focusSession.findFirst({ where: { id, userId: ctx.userId } });
  if (!session) throw new HttpError(404, "Session not found");
  if (session.endedAt) throw new HttpError(409, "That session already ended");

  const body = await parseBody(req, focusEndSchema);
  const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 60000);

  const ended = await db.focusSession.update({
    where: { id },
    data: {
      endedAt: new Date(),
      // Trust the wall clock over the client, but never bill more than was planned.
      minutes: Math.min(body.minutes || elapsed, session.plannedMinutes),
    },
  });

  return json({ ok: true, session: ended });
});

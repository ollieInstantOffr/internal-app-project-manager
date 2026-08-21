import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";

/** A pause that's been left alone this long is a session the user walked away from. */
export const AUTO_END_PAUSED_MINUTES = 15;
export const BREAK_MINUTES = 10;

export const FOCUS_INCLUDE = {
  issue: {
    select: { id: true, key: true, title: true, status: true, project: { select: { color: true } } },
  },
  task: { select: { id: true, title: true, list: { select: { color: true } } } },
} as const;

export type FocusState = "IDLE" | "RUNNING" | "PAUSED" | "DONE";

export const DEFAULT_PREFS = {
  lastLengthMinutes: 45,
  pauseNotifications: true,
  suggestBreak: true,
  shareBadge: false,
};

export async function prefsFor(userId: string) {
  const row = await db.focusPref.findUnique({ where: { userId } });
  return row ?? { userId, ...DEFAULT_PREFS };
}

/** Seconds a session has actually been running, pauses deducted. */
export function elapsedSeconds(
  session: { startedAt: Date; pausedAt: Date | null; pausedSeconds: number; endedAt: Date | null },
  now = new Date(),
) {
  const stop = session.endedAt ?? session.pausedAt ?? now;
  const gross = Math.floor((stop.getTime() - session.startedAt.getTime()) / 1000);
  return Math.max(0, gross - session.pausedSeconds);
}

function pausedFor(session: { pausedAt: Date | null }, now: Date) {
  if (!session.pausedAt) return 0;
  return Math.floor((now.getTime() - session.pausedAt.getTime()) / 1000);
}

/**
 * The one place a session is read. It also closes anything that ran past its
 * planned length or has sat paused too long, so the timer stays honest across a
 * reload or a laptop that was shut overnight.
 */
export async function currentSession(userId: string, now = new Date()) {
  const session = await db.focusSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: FOCUS_INCLUDE,
  });
  if (!session) return null;

  if (session.pausedAt && pausedFor(session, now) >= AUTO_END_PAUSED_MINUTES * 60) {
    return endSession(session.id, userId, now);
  }

  const planned = session.plannedMinutes * 60;
  if (!session.pausedAt && elapsedSeconds(session, now) >= planned) {
    return endSession(session.id, userId, now);
  }

  return session;
}

export async function startSession(opts: {
  userId: string;
  plannedMinutes: number;
  issueId?: string | null;
  taskId?: string | null;
  kind?: "FOCUS" | "BREAK";
  /** Set once the user has agreed to end whatever is already running. */
  replace?: boolean;
}) {
  const running = await currentSession(opts.userId);
  if (running && !running.endedAt) {
    // One session at a time — the caller has to say so before we cut one short.
    if (!opts.replace) throw new HttpError(409, "A session is already running");
    await endSession(running.id, opts.userId);
  }

  const session = await db.focusSession.create({
    data: {
      userId: opts.userId,
      kind: opts.kind ?? "FOCUS",
      plannedMinutes: opts.plannedMinutes,
      issueId: opts.issueId ?? null,
      taskId: opts.taskId ?? null,
    },
    include: FOCUS_INCLUDE,
  });

  // Only a real focus block sets the length we'll offer next time.
  if ((opts.kind ?? "FOCUS") === "FOCUS") {
    await db.focusPref.upsert({
      where: { userId: opts.userId },
      create: { userId: opts.userId, lastLengthMinutes: opts.plannedMinutes },
      update: { lastLengthMinutes: opts.plannedMinutes },
    });
  }

  return session;
}

async function owned(id: string, userId: string) {
  const session = await db.focusSession.findFirst({ where: { id, userId } });
  if (!session) throw new HttpError(404, "Session not found");
  return session;
}

export async function pauseSession(id: string, userId: string, now = new Date()) {
  const session = await owned(id, userId);
  if (session.endedAt) throw new HttpError(409, "That session already ended");
  if (session.pausedAt) return db.focusSession.findUniqueOrThrow({ where: { id }, include: FOCUS_INCLUDE });

  return db.focusSession.update({
    where: { id },
    data: { pausedAt: now },
    include: FOCUS_INCLUDE,
  });
}

export async function resumeSession(id: string, userId: string, now = new Date()) {
  const session = await owned(id, userId);
  if (session.endedAt) throw new HttpError(409, "That session already ended");
  if (!session.pausedAt) return db.focusSession.findUniqueOrThrow({ where: { id }, include: FOCUS_INCLUDE });

  return db.focusSession.update({
    where: { id },
    // Bank the pause rather than moving startedAt, so the start time stays true.
    data: { pausedAt: null, pausedSeconds: session.pausedSeconds + pausedFor(session, now) },
    include: FOCUS_INCLUDE,
  });
}

export async function endSession(id: string, userId: string, now = new Date()) {
  const session = await owned(id, userId);
  if (session.endedAt) return db.focusSession.findUniqueOrThrow({ where: { id }, include: FOCUS_INCLUDE });

  const seconds = elapsedSeconds({ ...session, endedAt: null }, now);
  const minutes = Math.min(Math.round(seconds / 60), session.plannedMinutes);

  return db.focusSession.update({
    where: { id },
    data: { endedAt: now, pausedAt: null, minutes },
    include: FOCUS_INCLUDE,
  });
}

/** "Log 45m to WEB-408" — the session keeps its target and counts toward it. */
export async function logSession(id: string, userId: string) {
  const session = await owned(id, userId);
  if (!session.endedAt) throw new HttpError(409, "The session hasn't ended yet");
  if (!session.issueId && !session.taskId) throw new HttpError(400, "Nothing to log against");

  return db.focusSession.update({
    where: { id },
    data: { loggedAt: new Date() },
    include: FOCUS_INCLUDE,
  });
}

/** Skipping keeps the session in your own stats but detaches it from the work. */
export async function skipLogging(id: string, userId: string) {
  await owned(id, userId);
  return db.focusSession.update({
    where: { id },
    data: { loggedAt: null },
    include: FOCUS_INCLUDE,
  });
}

export async function todayStats(userId: string, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const sessions = await db.focusSession.findMany({
    where: { userId, kind: "FOCUS", startedAt: { gte: start }, endedAt: { not: null } },
    select: { minutes: true },
  });

  return {
    minutes: sessions.reduce((n, s) => n + s.minutes, 0),
    count: sessions.length,
  };
}

/** Minutes this person has logged against one issue — their own number, nobody else's. */
export async function loggedOnIssue(userId: string, issueId: string) {
  const result = await db.focusSession.aggregate({
    where: { userId, issueId, loggedAt: { not: null } },
    _sum: { minutes: true },
  });
  return result._sum.minutes ?? 0;
}

/**
 * Who's heads-down right now, among people who chose to show it. Used for the
 * "focusing" badge — it never reveals what they're focusing on.
 */
export async function focusingMembers(orgId: string, exceptUserId: string) {
  const sessions = await db.focusSession.findMany({
    where: {
      endedAt: null,
      kind: "FOCUS",
      userId: { not: exceptUserId },
      user: { focusPref: { shareBadge: true }, memberships: { some: { orgId } } },
    },
    select: { userId: true },
  });
  return new Set(sessions.map((s) => s.userId));
}

/** True when this person has asked for quiet and is mid-session. */
export async function isMuted(userId: string) {
  const [prefs, session] = await Promise.all([
    prefsFor(userId),
    db.focusSession.findFirst({ where: { userId, endedAt: null }, select: { id: true } }),
  ]);
  return prefs.pauseNotifications && !!session;
}

type SessionRow = NonNullable<Awaited<ReturnType<typeof currentSession>>>;

/** Dates to ISO strings, so the session can cross into the client. */
export function serializeSession(session: SessionRow | null) {
  if (!session) return null;
  return {
    id: session.id,
    kind: session.kind,
    plannedMinutes: session.plannedMinutes,
    minutes: session.minutes,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    pausedAt: session.pausedAt?.toISOString() ?? null,
    pausedSeconds: session.pausedSeconds,
    loggedAt: session.loggedAt?.toISOString() ?? null,
    issue: session.issue,
    task: session.task,
  };
}

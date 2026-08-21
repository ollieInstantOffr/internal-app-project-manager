/**
 * The composer accepts one line: "@dev send me the p95 numbers tue ~1h refs API-77".
 * Everything it recognises is stripped from the title, so what's left reads as
 * the task itself.
 */

export type ParsedTask = {
  title: string;
  handle: string | null;
  dueDate: Date | null;
  dueLabel: string | null;
  estimateMinutes: number | null;
  issueKey: string | null;
};

const WEEKDAYS = [
  ["sunday", "sun"],
  ["monday", "mon"],
  ["tuesday", "tue", "tues"],
  ["wednesday", "wed"],
  ["thursday", "thu", "thur", "thurs"],
  ["friday", "fri"],
  ["saturday", "sat"],
];

export function parseTaskInput(input: string, now = new Date()): ParsedTask {
  let text = ` ${input} `;

  const take = (pattern: RegExp): RegExpMatchArray | null => {
    const match = pattern.exec(text);
    if (match) text = text.replace(match[0], " ");
    return match;
  };

  // @handle — delegates the task
  const handle = take(/\s@([A-Za-z0-9._-]{2,40})\b/)?.[1] ?? null;

  // refs ABC-123, or a bare issue key
  const issueKey =
    take(/\s(?:refs?|re)\s+([A-Z][A-Z0-9]{1,5}-\d+)\b/i)?.[1] ??
    take(/\s([A-Z][A-Z0-9]{1,5}-\d+)\b/)?.[1] ??
    null;

  // ~1h, ~90m, ~1h30
  const estimate = take(/\s~\s*(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\b/i);
  let estimateMinutes: number | null = null;
  if (estimate) {
    const value = Number(estimate[1]);
    estimateMinutes = /^h/i.test(estimate[2]) ? value * 60 : value;
  }

  const { date, label } = takeDate(take, now);

  const title = text.replace(/\s+/g, " ").trim();

  return {
    title,
    handle,
    dueDate: date,
    dueLabel: label,
    estimateMinutes,
    issueKey: issueKey ? issueKey.toUpperCase() : null,
  };
}

function takeDate(
  take: (pattern: RegExp) => RegExpMatchArray | null,
  now: Date,
): { date: Date | null; label: string | null } {
  if (take(/\stoday\b/i)) return { date: endOfDay(now, 0), label: "today" };
  if (take(/\stomorrow\b/i)) return { date: endOfDay(now, 1), label: "tomorrow" };

  const inDays = take(/\sin\s+(\d+)\s*(d|day|days)\b/i);
  if (inDays) return { date: endOfDay(now, Number(inDays[1])), label: `in ${inDays[1]}d` };

  const inWeeks = take(/\sin\s+(\d+)\s*(w|week|weeks)\b/i);
  if (inWeeks) return { date: endOfDay(now, Number(inWeeks[1]) * 7), label: `in ${inWeeks[1]}w` };

  if (take(/\snext\s+week\b/i)) return { date: endOfDay(now, 7), label: "next week" };

  for (const [index, names] of WEEKDAYS.entries()) {
    const alternatives = names.join("|");
    const match = take(new RegExp(`\\s(?:next\\s+)?(${alternatives})\\b`, "i"));
    if (!match) continue;

    // Always the next occurrence — "tue" on a Tuesday means next Tuesday.
    const offset = (index - now.getDay() + 7) % 7 || 7;
    return { date: endOfDay(now, offset), label: capitalise(names[1] ?? names[0]) };
  }

  // 24/12 or 24-12
  const numeric = take(/\s(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const year = numeric[3] ? Number(numeric[3].padStart(4, "20")) : now.getFullYear();
    const date = new Date(year, month, day, 23, 59, 59, 999);
    if (!Number.isNaN(date.getTime())) {
      return { date, label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) };
    }
  }

  return { date: null, label: null };
}

function endOfDay(now: Date, addDays: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + addDays);
  date.setHours(23, 59, 59, 999);
  return date;
}

function capitalise(value: string) {
  return value[0].toUpperCase() + value.slice(1);
}

/** "in 2 days", "overdue 1d", "today" — how a due date reads in a row. */
export function describeDue(due: Date | string | null, now = new Date()) {
  if (!due) return null;
  const date = new Date(due);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfDue = new Date(date);
  startOfDue.setHours(0, 0, 0, 0);

  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 864e5);

  if (days < 0) return { label: `overdue ${Math.abs(days)}d`, tone: "overdue" as const };
  if (days === 0) return { label: "today", tone: "today" as const };
  if (days === 1) return { label: "tomorrow", tone: "soon" as const };
  if (days < 7)
    return {
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      tone: "soon" as const,
    };
  return {
    label: date.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    tone: "later" as const,
  };
}

export function formatEstimate(minutes: number | null) {
  if (!minutes) return null;
  if (minutes < 60) return `~${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `~${hours}h${rest}` : `~${hours}h`;
}

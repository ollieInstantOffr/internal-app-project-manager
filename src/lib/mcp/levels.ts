/**
 * The trust ladder. Each rung answers one of the three questions the settings
 * screen is built around: what can it read, what can it change without asking,
 * and — through the action log — what did it actually do.
 */
export const LEVELS = ["READ_ONLY", "HELPER", "FULL"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_COPY: Record<
  Level,
  { name: string; blurb: string; asks?: string; recommended?: boolean }
> = {
  READ_ONLY: {
    name: "Read only",
    blurb: "Looks at issues, boards, the roadmap and your code. Changes nothing.",
  },
  HELPER: {
    name: "Helper",
    blurb:
      "Adds: files new issues into Triage, comments, attaches files, creates labels, and drafts tasks on your list — without asking.",
    asks: "editing an issue someone else owns · moving cards on the board · opening or moving an epic on the roadmap · handing a task to a teammate",
    recommended: true,
  },
  FULL: {
    name: "Full teammate",
    blurb: "Adds: does all of the above without asking, including changes to many issues at once.",
  },
};

/** True at every rung, and not negotiable through per-tool overrides. */
export const OFF_LIMITS =
  "Starting or ending a sprint · deleting anything · publishing the public roadmap · your focus sessions, private tasks and time logs";

/**
 * Names an agent is likely to reach for that will never be allowed. They aren't
 * advertised in tools/list, but calling one gets a clear refusal and a log entry
 * rather than a puzzling "unknown tool".
 */
export const FORBIDDEN_TOOLS: Record<string, string> = {
  start_sprint: "Starting a sprint is off limits to assistants at every level.",
  end_sprint: "Ending a sprint is off limits to assistants at every level.",
  complete_sprint: "Closing a sprint is off limits to assistants at every level.",
  delete_issue: "Deleting is off limits to assistants at every level.",
  delete_epic: "Deleting is off limits to assistants at every level.",
  delete_task: "Deleting is off limits to assistants at every level.",
  delete_project: "Deleting is off limits to assistants at every level.",
  publish_roadmap: "Publishing the public roadmap is off limits to assistants at every level.",
  list_focus_sessions: "Focus sessions and time logs are private and never exposed to assistants.",
  start_focus: "Focus sessions and time logs are private and never exposed to assistants.",
  list_tasks: "Personal tasks are private; an assistant only sees tasks it drafted for you.",
};

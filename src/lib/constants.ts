import { IssueStatus, Priority, Role } from "./types";

export const STATUS_ORDER: IssueStatus[] = [
  IssueStatus.TRIAGE,
  IssueStatus.TODO,
  IssueStatus.IN_PROGRESS,
  IssueStatus.IN_REVIEW,
  IssueStatus.DONE,
];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  TRIAGE: "Triage",
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export const STATUS_SHORT: Record<IssueStatus, string> = {
  TRIAGE: "TRIAGE",
  TODO: "TODO",
  IN_PROGRESS: "IN PROGRESS",
  IN_REVIEW: "IN REVIEW",
  DONE: "DONE",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: "None",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const PRIORITY_ORDER: Priority[] = [
  Priority.URGENT,
  Priority.HIGH,
  Priority.MEDIUM,
  Priority.LOW,
  Priority.NONE,
];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

/** Accent hues used for projects, epics and labels — all oklch, all on the dark ground. */
export const ACCENTS = {
  lime: { base: "oklch(0.84 0.17 128)", soft: "oklch(0.40 0.06 128)", fg: "oklch(0.24 0.05 128)" },
  blue: { base: "oklch(0.72 0.13 230)", soft: "oklch(0.36 0.06 230)", fg: "oklch(0.20 0.05 230)" },
  amber: { base: "oklch(0.76 0.14 40)", soft: "oklch(0.36 0.06 40)", fg: "oklch(0.22 0.05 40)" },
  red: { base: "oklch(0.66 0.16 25)", soft: "oklch(0.36 0.09 25)", fg: "oklch(0.95 0.04 25)" },
  green: { base: "oklch(0.78 0.14 150)", soft: "oklch(0.36 0.07 150)", fg: "oklch(0.20 0.05 150)" },
  violet: { base: "oklch(0.70 0.13 300)", soft: "oklch(0.36 0.07 300)", fg: "oklch(0.20 0.05 300)" },
  slate: { base: "oklch(0.62 0.012 285)", soft: "oklch(0.33 0.014 285)", fg: "oklch(0.95 0.008 90)" },
} as const;

export type AccentName = keyof typeof ACCENTS;
export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

export function accent(name: string | null | undefined) {
  return ACCENTS[(name ?? "slate") as AccentName] ?? ACCENTS.slate;
}

/** Deterministic avatar hue so a person keeps the same colour everywhere. */
export function hueFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

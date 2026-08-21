export type TaskPerson = { id: string; name: string; avatarHue: number };

export type TaskListRef = { id: string; name: string; color: string };

export type TaskSubtask = { id: string; title: string; done: boolean };

export type TaskItem = {
  id: string;
  title: string;
  note: string | null;
  status: "OPEN" | "DONE";
  dueDate: string | null;
  estimateMinutes: number | null;
  snoozedUntil: string | null;
  completedAt: string | null;
  list: TaskListRef | null;
  owner: TaskPerson;
  delegatedBy: TaskPerson | null;
  delegationStatus: "NONE" | "PENDING" | "ACCEPTED" | "DECLINED";
  delegationNote: string | null;
  declineReason: string | null;
  proposedDate: string | null;
  canRenegotiate: boolean;
  delegatedAt: string | null;
  nudgedAt: string | null;
  issue: { key: string; title: string; status: string } | null;
  convertedIssueId: string | null;
  subtasks: TaskSubtask[];
};

export type FocusDay = { label: string; minutes: number; isToday: boolean };

export type TasksData = {
  mine: TaskItem[];
  delegated: TaskItem[];
  done: TaskItem[];
  lists: TaskListRef[];
  focus: { days: FocusDay[]; totalMinutes: number };
  projects: { id: string; key: string; name: string }[];
  now: string;
};

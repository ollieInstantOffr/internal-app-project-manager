import type { IssueStatus, Priority, PrState, SprintStatus, EpicStatus } from "@/lib/types";

export type BoardIssue = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: Priority;
  estimate: number | null;
  rank: number;
  dueDate: string | null;
  assignee: { id: string; name: string; avatarHue: number } | null;
  epic: { id: string; key: string; name: string; color: string } | null;
  sprint: { id: string; name: string; number: number } | null;
  release: { id: string; name: string; shipped: boolean } | null;
  labels: { id: string; name: string; color: string }[];
  branches: { id: string; name: string; repo: string }[];
  pullRequests: {
    id: string;
    number: number;
    state: PrState;
    approvals: number;
    checksPassed: number;
    checksFailed: number;
  }[];
  blockedBy: { key: string; status: IssueStatus }[];
  blocks: { key: string; status: IssueStatus }[];
  subtaskDone: number;
  subtaskTotal: number;
  commentCount: number;
};

export type BoardEpic = {
  id: string;
  key: string;
  name: string;
  color: string;
  status: EpicStatus;
};

export type BoardSprint = {
  id: string;
  name: string;
  number: number;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  capacity: number;
};

export type BoardLabel = { id: string; name: string; color: string };

export type BoardProject = {
  id: string;
  key: string;
  name: string;
  color: string;
  repoFullName: string | null;
};

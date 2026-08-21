import { z } from "zod";
import {
  IssueStatus,
  Priority,
  Role,
  SprintStatus,
  EpicStatus,
  RuleTrigger,
  RuleAction,
} from "./types";

export const email = z.string().trim().toLowerCase().email("Enter a valid email address");

/** The only way in besides GitHub: an address, and optionally a name for new accounts. */
export const magicLinkSchema = z.object({
  email,
  name: z.string().trim().min(1).max(80).optional(),
  redirectTo: z
    .string()
    .trim()
    .max(512)
    // Relative paths only — an open redirect here would be a phishing vector.
    .regex(/^\/(?!\/)[^\s]*$/, "Must be a relative path")
    .optional(),
});

export const orgSchema = z.object({
  name: z.string().trim().min(1, "Name your organization").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "At least 2 characters")
    .max(48)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  githubOrg: z.string().trim().max(80).optional().nullable(),
});

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Name your project").max(80),
  key: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(6)
    .regex(/^[A-Z][A-Z0-9]+$/, "2–6 letters or digits, starting with a letter")
    .optional(),
  color: z.string().default("lime"),
  repoFullName: z.string().trim().max(140).optional().nullable(),
  seedFromRepo: z.boolean().optional(),
  importIssues: z.boolean().optional(),
  importLabels: z.boolean().optional(),
  importClosed: z.boolean().optional(),
});

/** Radical minimalism: an issue needs only a title to exist. */
export const issueCreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "An issue needs a title").max(300),
  description: z.string().max(20000).optional().nullable(),
  status: z.nativeEnum(IssueStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  estimate: z.number().int().min(0).max(100).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  sprintId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const issueUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20000).optional().nullable(),
  status: z.nativeEnum(IssueStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  estimate: z.number().int().min(0).max(100).optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  epicId: z.string().optional().nullable(),
  sprintId: z.string().optional().nullable(),
  labelIds: z.array(z.string()).optional(),
  dueDate: z.coerce.date().optional().nullable(),
  rank: z.number().optional(),
  archived: z.boolean().optional(),
});

export const bulkUpdateSchema = z.object({
  issueIds: z.array(z.string().min(1)).min(1, "Select at least one issue").max(500),
  patch: z.object({
    status: z.nativeEnum(IssueStatus).optional(),
    priority: z.nativeEnum(Priority).optional(),
    estimate: z.number().int().min(0).max(100).optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    epicId: z.string().optional().nullable(),
    sprintId: z.string().optional().nullable(),
    addLabelId: z.string().optional().nullable(),
    archived: z.boolean().optional(),
  }),
});

export const moveSchema = z.object({
  issueId: z.string().min(1),
  status: z.nativeEnum(IssueStatus).optional(),
  sprintId: z.string().optional().nullable(),
  beforeId: z.string().optional().nullable(),
  afterId: z.string().optional().nullable(),
});

export const subtaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  assigneeId: z.string().optional().nullable(),
});

export const subtaskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  done: z.boolean().optional(),
  assigneeId: z.string().optional().nullable(),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(10000) });

export const epicSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional().nullable(),
  color: z.string().optional(),
  status: z.nativeEnum(EpicStatus).optional(),
  startDate: z.coerce.date().optional().nullable(),
  targetDate: z.coerce.date().optional().nullable(),
});

export const sprintSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().max(80).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  capacity: z.number().int().min(1).max(500).optional(),
});

export const inviteSchema = z.object({
  emails: z.array(email).min(1, "Add at least one email").max(50),
  role: z.nativeEnum(Role).default(Role.MEMBER),
});

export const memberUpdateSchema = z.object({ role: z.nativeEnum(Role) });

export const teamSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const labelSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  color: z.string().optional(),
});

export const ruleSchema = z.object({
  trigger: z.nativeEnum(RuleTrigger),
  action: z.nativeEnum(RuleAction),
  label: z.string().trim().min(1).max(160).optional(),
  enabled: z.boolean().optional(),
});

export const milestoneSchema = z.object({
  name: z.string().trim().min(1).max(80),
  date: z.coerce.date(),
});

export const prefsSchema = z.object({
  emailMentions: z.boolean().optional(),
  emailAssigned: z.boolean().optional(),
  emailBlocking: z.boolean().optional(),
  emailCiFailures: z.boolean().optional(),
  emailDigest: z.boolean().optional(),
});

export const sprintActionSchema = z.object({
  action: z.enum(["start", "complete"]),
});

export const blockSchema = z.object({ blockedKey: z.string().trim().min(1).max(40) });

export const tokenSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  githubLogin: z.string().trim().max(60).optional().nullable(),
});

export type SprintStatusType = SprintStatus;

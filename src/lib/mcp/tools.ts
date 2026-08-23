import "server-only";
import { db } from "../db";
import { HttpError } from "../auth";
import { IssueStatus } from "../types";
import { createIssue, updateIssue } from "../issues";
import { nextRank } from "../rank";
import { loadPublicRoadmap } from "../roadmap";
import type { Level } from "./levels";

export type ToolMode = "ALLOW" | "ASK" | "DENY";

export type ToolContext = {
  assistantId: string;
  orgId: string;
  /** The agent's own member row — everything it does is attributed here. */
  actorId: string;
  /** The person who connected it; approvals and drafted tasks belong to them. */
  ownerId: string;
  /** Empty means every project in the org. */
  projectIds: string[];
};

type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

/** A content block in a tool result, as the MCP spec shapes them. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type Tool = {
  name: string;
  title: string;
  description: string;
  group: "Read" | "Write" | "Coordinate";
  inputSchema: JsonSchema;
  /** What each rung of the ladder does with this tool. */
  modes: Record<Level, ToolMode>;
  /** Plain English, for the approval card and the action log. */
  summarise: (args: Record<string, unknown>) => string;
  run: (
    ctx: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<{ text: string; blocks?: ContentBlock[]; targetKey?: string }>;
};

const READ: Record<Level, ToolMode> = { READ_ONLY: "ALLOW", HELPER: "ALLOW", FULL: "ALLOW" };
const HELPER_FREE: Record<Level, ToolMode> = { READ_ONLY: "DENY", HELPER: "ALLOW", FULL: "ALLOW" };
const HELPER_ASKS: Record<Level, ToolMode> = { READ_ONLY: "DENY", HELPER: "ASK", FULL: "ALLOW" };
const FULL_ONLY: Record<Level, ToolMode> = { READ_ONLY: "DENY", HELPER: "ASK", FULL: "ALLOW" };
/**
 * Asks a person every time, at every level. For the one destructive thing an
 * assistant can reach: "does all of the above without asking" was never meant to
 * cover deletion. Overridable per tool for anyone who disagrees.
 */
const ALWAYS_ASK: Record<Level, ToolMode> = { READ_ONLY: "DENY", HELPER: "ASK", FULL: "ASK" };

const str = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
};
const num = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  return typeof value === "number" ? value : undefined;
};

/**
 * The real statuses, taken from the enum rather than typed out — the tool
 * descriptions once claimed a BLOCKED column that does not exist, which made
 * move_issue fail on a value it had advertised itself.
 */
const STATUSES = Object.values(IssueStatus);
const STATUS_LIST = STATUSES.join(", ");

/** Types worth handing back as text rather than describing. */
const TEXTUAL = new Set(["text/plain", "text/csv", "application/json"]);

const COLOURS = ["lime", "blue", "amber", "violet", "red", "slate"];

/** Falls back rather than rejecting, so a wrong colour never fails a write. */
function colourOr(value: string, fallback: string) {
  return COLOURS.includes(value.toLowerCase()) ? value.toLowerCase() : fallback;
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Restricts every query to the projects this assistant was given. */
function projectScope(ctx: ToolContext) {
  return ctx.projectIds.length ? { orgId: ctx.orgId, id: { in: ctx.projectIds } } : { orgId: ctx.orgId };
}

async function issueFor(ctx: ToolContext, key: string) {
  const issue = await db.issue.findFirst({
    where: { key: key.toUpperCase(), project: projectScope(ctx), archivedAt: null },
    include: {
      project: { select: { id: true, key: true, name: true } },
      assignee: { select: { id: true, name: true } },
      epic: { select: { name: true } },
      sprint: { select: { name: true } },
      release: { select: { id: true, name: true } },
      labels: { include: { label: true } },
    },
  });
  if (!issue) throw new HttpError(404, `No issue ${key.toUpperCase()} in the projects you can see`);
  return issue;
}

async function epicFor(ctx: ToolContext, name: string) {
  const epic = await db.epic.findFirst({
    where: { project: projectScope(ctx), name: { contains: name, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });
  if (!epic) throw new HttpError(404, `No epic matching "${name}"`);
  return epic;
}

async function projectFor(ctx: ToolContext, key: string) {
  const project = await db.project.findFirst({
    where: { ...projectScope(ctx), key: key.toUpperCase() },
  });
  if (!project) throw new HttpError(404, `No project ${key.toUpperCase()} you can see`);
  return project;
}

function line(issue: {
  key: string;
  title: string;
  status: string;
  priority: string;
  estimate: number | null;
  assignee: { name: string } | null;
}) {
  return [
    issue.key,
    issue.title,
    `status=${issue.status}`,
    `priority=${issue.priority}`,
    issue.estimate != null ? `points=${issue.estimate}` : null,
    issue.assignee ? `assignee=${issue.assignee.name}` : "unassigned",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const TOOLS: Tool[] = [
  /* ── read ────────────────────────────────────────────────── */
  {
    name: "list_projects",
    title: "List projects",
    description: "Every project this assistant can see, with its key and issue counts.",
    group: "Read",
    inputSchema: { type: "object", properties: {} },
    modes: READ,
    summarise: () => "list projects",
    run: async (ctx) => {
      const projects = await db.project.findMany({
        where: { ...projectScope(ctx), archived: false },
        select: { key: true, name: true, repoFullName: true, _count: { select: { issues: true } } },
        orderBy: { createdAt: "asc" },
      });
      if (!projects.length) return { text: "No projects." };
      return {
        text: projects
          .map(
            (p) =>
              `${p.key} · ${p.name} · ${p._count.issues} issues${p.repoFullName ? ` · repo ${p.repoFullName}` : ""}`,
          )
          .join("\n"),
      };
    },
  },
  {
    name: "list_issues",
    title: "List issues",
    description:
      "Issues, optionally filtered by project, status, assignee, sprint or free text. Returns at most 50.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project key, e.g. WEB" },
        status: {
          type: "string",
          description: `One of ${STATUS_LIST}`,
        },
        assignee: { type: "string", description: "Member name or email, or 'none'" },
        query: { type: "string", description: "Free text over titles and keys" },
        limit: { type: "number", description: "1–50, default 25" },
      },
    },
    modes: READ,
    summarise: (a) => `list issues${str(a, "project") ? ` in ${str(a, "project")}` : ""}`,
    run: async (ctx, args) => {
      const where: Record<string, unknown> = { project: projectScope(ctx), archivedAt: null };
      if (str(args, "project")) {
        const project = await projectFor(ctx, str(args, "project"));
        where.projectId = project.id;
      }
      if (str(args, "status")) where.status = str(args, "status").toUpperCase();
      if (str(args, "query")) {
        where.OR = [
          { title: { contains: str(args, "query"), mode: "insensitive" } },
          { key: { contains: str(args, "query"), mode: "insensitive" } },
        ];
      }
      const assignee = str(args, "assignee");
      if (assignee === "none") where.assigneeId = null;
      else if (assignee) {
        const person = await db.user.findFirst({
          where: {
            memberships: { some: { orgId: ctx.orgId } },
            OR: [
              { name: { contains: assignee, mode: "insensitive" } },
              { email: { equals: assignee, mode: "insensitive" } },
            ],
          },
        });
        if (!person) throw new HttpError(404, `No member matching "${assignee}"`);
        where.assigneeId = person.id;
      }

      const issues = await db.issue.findMany({
        where,
        include: { assignee: { select: { name: true } } },
        orderBy: [{ status: "asc" }, { rank: "asc" }],
        take: Math.min(Math.max(num(args, "limit") ?? 25, 1), 50),
      });
      if (!issues.length) return { text: "No issues matched." };
      return { text: issues.map(line).join("\n") };
    },
  },
  {
    name: "get_issue",
    title: "Get an issue",
    description: "One issue in full: description, status, people, labels, links, branches and PRs.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "Issue key, e.g. WEB-408" } },
      required: ["key"],
    },
    modes: READ,
    summarise: (a) => `read ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const [comments, blocks, blockedBy] = await Promise.all([
        db.comment.count({ where: { issueId: issue.id } }),
        db.issueLink.findMany({
          where: { blockerId: issue.id },
          include: { blocked: { select: { key: true } } },
        }),
        db.issueLink.findMany({
          where: { blockedId: issue.id },
          include: { blocker: { select: { key: true } } },
        }),
      ]);

      const parts = [
        `${issue.key} — ${issue.title}`,
        `project: ${issue.project.key} (${issue.project.name})`,
        `status: ${issue.status} · priority: ${issue.priority}${issue.estimate != null ? ` · points: ${issue.estimate}` : ""}`,
        `assignee: ${issue.assignee?.name ?? "unassigned"}`,
        issue.epic ? `epic: ${issue.epic.name}` : null,
        issue.sprint ? `sprint: ${issue.sprint.name}` : null,
        issue.release ? `release: ${issue.release.name}` : null,
        issue.labels.length ? `labels: ${issue.labels.map((l) => l.label.name).join(", ")}` : null,
        blocks.length ? `blocks: ${blocks.map((b) => b.blocked.key).join(", ")}` : null,
        blockedBy.length ? `blocked by: ${blockedBy.map((b) => b.blocker.key).join(", ")}` : null,
        `comments: ${comments}`,
        "",
        issue.description || "(no description)",
      ];
      return { text: parts.filter((p) => p !== null).join("\n"), targetKey: issue.key };
    },
  },
  {
    name: "list_comments",
    title: "Read the discussion",
    description: "Comments on an issue, oldest first.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" }, limit: { type: "number" } },
      required: ["key"],
    },
    modes: READ,
    summarise: (a) => `read the discussion on ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const comments = await db.comment.findMany({
        where: { issueId: issue.id },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
        take: Math.min(num(args, "limit") ?? 30, 100),
      });
      if (!comments.length) return { text: "No comments yet.", targetKey: issue.key };
      return {
        text: comments
          .map(
            (c) =>
              `${c.author?.name ?? "Arc"} · ${c.createdAt.toISOString().slice(0, 16).replace("T", " ")}\n${c.body}`,
          )
          .join("\n\n"),
        targetKey: issue.key,
      };
    },
  },
  {
    name: "get_board",
    title: "Get the board",
    description: "A project's board, grouped by column, with counts and points per column.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" } },
      required: ["project"],
    },
    modes: READ,
    summarise: (a) => `look at the ${str(a, "project").toUpperCase()} board`,
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const issues = await db.issue.findMany({
        where: { projectId: project.id, archivedAt: null },
        include: { assignee: { select: { name: true } } },
        orderBy: { rank: "asc" },
      });

      const columns = STATUSES;
      const out = columns.map((column) => {
        const inColumn = issues.filter((i) => i.status === column);
        const points = inColumn.reduce((n, i) => n + (i.estimate ?? 0), 0);
        const body = inColumn.length
          ? inColumn.map((i) => `  ${line(i)}`).join("\n")
          : "  (empty)";
        return `${column} — ${inColumn.length} issues, ${points} pts\n${body}`;
      });
      return { text: out.join("\n\n") };
    },
  },
  {
    name: "list_epics",
    title: "List epics",
    description: "Epics with their dates, status and progress.",
    group: "Read",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
    modes: READ,
    summarise: () => "list epics",
    run: async (ctx, args) => {
      const where: Record<string, unknown> = { project: projectScope(ctx) };
      if (str(args, "project")) {
        where.projectId = (await projectFor(ctx, str(args, "project"))).id;
      }
      const epics = await db.epic.findMany({
        where,
        include: { issues: { select: { status: true } }, project: { select: { key: true } } },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      });
      if (!epics.length) return { text: "No epics." };
      return {
        text: epics
          .map((e) => {
            const done = e.issues.filter((i) => i.status === "DONE").length;
            const pct = e.issues.length ? Math.round((done / e.issues.length) * 100) : 0;
            const window = [e.startDate, e.targetDate]
              .map((d) => (d ? d.toISOString().slice(0, 10) : "—"))
              .join(" → ");
            return `${e.project.key} · ${e.name} · ${e.status} · ${pct}% (${done}/${e.issues.length}) · ${window}`;
          })
          .join("\n"),
      };
    },
  },
  {
    name: "list_sprints",
    title: "List sprints",
    description: "Sprints with dates, capacity and committed points. Read-only at every level.",
    group: "Read",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
    modes: READ,
    summarise: () => "list sprints",
    run: async (ctx, args) => {
      const where: Record<string, unknown> = { project: projectScope(ctx) };
      if (str(args, "project")) {
        where.projectId = (await projectFor(ctx, str(args, "project"))).id;
      }
      const sprints = await db.sprint.findMany({
        where,
        include: { issues: { select: { estimate: true, status: true } } },
        orderBy: { startDate: "desc" },
        take: 12,
      });
      if (!sprints.length) return { text: "No sprints." };
      return {
        text: sprints
          .map((s) => {
            const done = s.issues
              .filter((i) => i.status === "DONE")
              .reduce((n, i) => n + (i.estimate ?? 0), 0);
            const total = s.issues.reduce((n, i) => n + (i.estimate ?? 0), 0);
            return `${s.name} · ${s.status} · ${s.startDate.toISOString().slice(0, 10)} → ${s.endDate.toISOString().slice(0, 10)} · ${done}/${total} pts · capacity ${s.capacity}`;
          })
          .join("\n"),
      };
    },
  },
  {
    name: "list_members",
    title: "List members",
    description: "People in the org, with their role and open issue count.",
    group: "Read",
    inputSchema: { type: "object", properties: {} },
    modes: READ,
    summarise: () => "list members",
    run: async (ctx) => {
      const members = await db.membership.findMany({
        where: { orgId: ctx.orgId },
        include: { user: { select: { id: true, name: true, email: true, isAgent: true } } },
      });
      const counts = await db.issue.groupBy({
        by: ["assigneeId"],
        where: { project: { orgId: ctx.orgId }, archivedAt: null, status: { not: "DONE" } },
        _count: { _all: true },
      });
      const open = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
      return {
        text: members
          .map(
            (m) =>
              `${m.user.name}${m.user.isAgent ? " (assistant)" : ""} · ${m.user.email} · ${m.role} · ${open.get(m.user.id) ?? 0} open`,
          )
          .join("\n"),
      };
    },
  },
  {
    name: "list_labels",
    title: "List labels",
    description: "Labels available in a project.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" } },
      required: ["project"],
    },
    modes: READ,
    summarise: () => "list labels",
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const labels = await db.label.findMany({ where: { projectId: project.id } });
      return { text: labels.length ? labels.map((l) => l.name).join("\n") : "No labels." };
    },
  },
  {
    name: "get_roadmap",
    title: "Get the roadmap",
    description: "Epics and milestones over time, the way the roadmap shows them.",
    group: "Read",
    inputSchema: { type: "object", properties: {} },
    modes: READ,
    summarise: () => "look at the roadmap",
    run: async (ctx) => {
      const [epics, milestones] = await Promise.all([
        db.epic.findMany({
          where: { project: projectScope(ctx) },
          include: { project: { select: { key: true } } },
          orderBy: [{ startDate: "asc" }],
        }),
        db.milestone.findMany({ where: { orgId: ctx.orgId }, orderBy: { date: "asc" } }),
      ]);
      const lines = [
        "EPICS",
        ...epics.map(
          (e) =>
            `  ${e.project.key} · ${e.name} · ${e.status} · ${e.startDate?.toISOString().slice(0, 10) ?? "—"} → ${e.targetDate?.toISOString().slice(0, 10) ?? "—"}`,
        ),
        "",
        "MILESTONES",
        ...milestones.map((m) => `  ${m.name} · ${m.date.toISOString().slice(0, 10)} · ${m.status}`),
      ];
      return { text: lines.join("\n") };
    },
  },
  {
    name: "get_public_roadmap",
    title: "Get the published roadmap",
    description: "What outsiders see on a project's public roadmap page, if it has one.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" } },
      required: ["project"],
    },
    modes: READ,
    summarise: (a) => `read the public roadmap for ${str(a, "project").toUpperCase()}`,
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const org = await db.organization.findUniqueOrThrow({
        where: { id: ctx.orgId },
        select: { slug: true },
      });
      const roadmap = await loadPublicRoadmap(org.slug, project.key);
      if (!roadmap?.page.enabled) return { text: "That project has no published roadmap." };
      return {
        text: [
          roadmap.page.headline,
          ...roadmap.items.map((i) => `  ${i.name} · ${i.state} · ${i.timing}`),
        ].join("\n"),
      };
    },
  },
  {
    name: "list_activity",
    title: "Recent activity",
    description: "What has happened lately across the projects this assistant can see.",
    group: "Read",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    modes: READ,
    summarise: () => "read recent activity",
    run: async (ctx, args) => {
      const activities = await db.activity.findMany({
        where: { orgId: ctx.orgId },
        include: {
          actor: { select: { name: true } },
          issue: { select: { key: true } },
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(num(args, "limit") ?? 25, 100),
      });
      return {
        text: activities
          .map(
            (a) =>
              `${a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · ${a.actor?.name ?? "Arc"} ${a.message}${a.issue ? ` (${a.issue.key})` : ""}`,
          )
          .join("\n"),
      };
    },
  },
  {
    name: "list_files",
    title: "List repository files",
    description: "The file tree of a project's connected repository.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" }, path: { type: "string" } },
      required: ["project"],
    },
    modes: READ,
    summarise: (a) => `list files in ${str(a, "project").toUpperCase()}`,
    run: async (ctx, args) => {
      const { listRepoFiles } = await import("./repo-tools");
      return listRepoFiles(ctx, str(args, "project"), str(args, "path"));
    },
  },
  {
    name: "read_file",
    title: "Read a repository file",
    description: "The contents of one file in a project's connected repository.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" }, path: { type: "string" } },
      required: ["project", "path"],
    },
    modes: READ,
    summarise: (a) => `read ${str(a, "path")}`,
    run: async (ctx, args) => {
      const { readRepoFile } = await import("./repo-tools");
      return readRepoFile(ctx, str(args, "project"), str(args, "path"));
    },
  },

  {
    name: "list_attachments",
    title: "List an issue's files",
    description: "The files attached to an issue, with their type and size.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
    modes: READ,
    summarise: (a) => `list files on ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const files = await db.attachment.findMany({
        where: { issueId: issue.id },
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { name: true } } },
      });
      if (!files.length) return { text: `No files on ${issue.key}.`, targetKey: issue.key };

      return {
        text: files
          .map(
            (f) =>
              `${f.filename} · ${f.mimeType} · ${Math.round(f.size / 1024)} KB · added by ${f.uploadedBy?.name ?? "someone"}`,
          )
          .join("\n"),
        targetKey: issue.key,
      };
    },
  },
  {
    name: "read_attachment",
    title: "Read a file on an issue",
    description:
      "Returns a file attached to an issue. Images come back as images; text comes back as text. Identify it by filename.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        filename: { type: "string", description: "As shown by list_attachments" },
      },
      required: ["key", "filename"],
    },
    modes: READ,
    summarise: (a) => `read ${str(a, "filename")} on ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const wanted = str(args, "filename").toLowerCase();
      const files = await db.attachment.findMany({ where: { issueId: issue.id } });
      const file =
        files.find((f) => f.filename.toLowerCase() === wanted) ??
        files.find((f) => f.filename.toLowerCase().includes(wanted));
      if (!file) throw new HttpError(404, `No file called "${str(args, "filename")}" on ${issue.key}`);

      const { load, canRenderInline } = await import("../attachments");
      const bytes = await load(ctx.orgId, file.storageKey, file.storage);

      if (canRenderInline(file.mimeType)) {
        // Inlining a large image would blow up the JSON-RPC response for no gain.
        if (bytes.byteLength > 5 * 1024 * 1024) {
          return {
            text: `${file.filename} is ${Math.round(file.size / 1024 / 1024)} MB — too large to read inline.`,
            targetKey: issue.key,
          };
        }
        return {
          text: `${file.filename} (${file.mimeType}) from ${issue.key}`,
          blocks: [{ type: "image", data: bytes.toString("base64"), mimeType: file.mimeType }],
          targetKey: issue.key,
        };
      }

      if (TEXTUAL.has(file.mimeType)) {
        const text = bytes.toString("utf8");
        const clipped = text.length > 100_000;
        return {
          text: `${file.filename}\n\n${clipped ? `${text.slice(0, 100_000)}\n\n… truncated at 100 KB` : text}`,
          targetKey: issue.key,
        };
      }

      return {
        text: `${file.filename} is ${file.mimeType}, which can't be read as text or shown as an image.`,
        targetKey: issue.key,
      };
    },
  },
  {
    name: "add_attachment",
    title: "Attach a file to an issue",
    description:
      "Attaches a file to an issue — a log, a diff, a generated report. Content must be base64. Same 10 MB limit and allowed types as the app.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        filename: { type: "string" },
        mimeType: { type: "string", description: "e.g. text/plain, application/json, image/png" },
        contentBase64: { type: "string", description: "The file's bytes, base64 encoded" },
      },
      required: ["key", "filename", "mimeType", "contentBase64"],
    },
    modes: HELPER_FREE,
    summarise: (a) => `attach ${str(a, "filename")} to ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const { store, isAllowed, safeFilename, MAX_BYTES } = await import("../attachments");

      const mimeType = str(args, "mimeType");
      if (!isAllowed(mimeType)) throw new HttpError(415, `${mimeType} isn't an allowed file type`);

      const raw = str(args, "contentBase64").replace(/^data:[^,]+,/, "");
      const bytes = Buffer.from(raw, "base64");
      if (!bytes.byteLength) throw new HttpError(400, "That base64 content decoded to nothing");
      if (bytes.byteLength > MAX_BYTES) throw new HttpError(413, "That file is over 10 MB");

      // Goes to whichever backend the org is configured for, same as an upload
      // through the app.
      const stored = await store(ctx.orgId, bytes, mimeType);
      const attachment = await db.attachment.create({
        data: {
          filename: safeFilename(str(args, "filename")),
          mimeType,
          size: stored.size,
          storageKey: stored.storageKey,
          storage: stored.storage,
          issueId: issue.id,
          uploadedById: ctx.actorId,
        },
      });

      return {
        text: `Attached ${attachment.filename} (${Math.round(attachment.size / 1024)} KB) to ${issue.key}.`,
        targetKey: issue.key,
      };
    },
  },

  {
    name: "list_releases",
    title: "List versions",
    description: "The versions a project tags work with, newest first, and how much is in each.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: { project: { type: "string" } },
      required: ["project"],
    },
    modes: READ,
    summarise: (a) => `list versions in ${str(a, "project").toUpperCase()}`,
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const { sortReleases } = await import("../releases");
      const releases = await db.release.findMany({
        where: { projectId: project.id },
        include: { _count: { select: { issues: true, epics: true } } },
      });
      if (!releases.length) return { text: `No versions in ${project.key} yet.` };

      return {
        text: sortReleases(releases)
          .reverse()
          .map(
            (r) =>
              `${r.name} · ${r._count.issues} issue${r._count.issues === 1 ? "" : "s"}, ${r._count.epics} epic${r._count.epics === 1 ? "" : "s"}${r.releasedAt ? ` · shipped ${r.releasedAt.toISOString().slice(0, 10)}` : ""}`,
          )
          .join("\n"),
      };
    },
  },
  {
    name: "set_release",
    title: "Tag work with a version",
    description:
      "Tags an issue or an epic with a release version, creating the version if it doesn't exist yet. Pass an empty name to clear it.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "An issue key, or an epic name" },
        version: { type: "string", description: "Any name: 1, 1.1.1, v2-beta. Empty clears it." },
      },
      required: ["key"],
    },
    modes: HELPER_ASKS,
    summarise: (a) =>
      str(a, "version")
        ? `tag ${str(a, "key").toUpperCase()} for ${str(a, "version")}`
        : `clear the version on ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const name = str(args, "version");
      const key = str(args, "key");

      // An issue key, or failing that an epic by name.
      const issue = await db.issue.findFirst({
        where: { key: key.toUpperCase(), project: projectScope(ctx), archivedAt: null },
        include: { project: { select: { id: true, key: true } } },
      });
      const epic = issue
        ? null
        : await db.epic.findFirst({
            where: { project: projectScope(ctx), name: { contains: key, mode: "insensitive" } },
            include: { project: { select: { id: true, key: true } } },
          });

      const target = issue ?? epic;
      if (!target) throw new HttpError(404, `No issue or epic matching "${key}"`);

      let releaseId: string | null = null;
      if (name) {
        const release = await db.release.upsert({
          where: { projectId_name: { projectId: target.project.id, name } },
          create: { projectId: target.project.id, name },
          update: {},
        });
        releaseId = release.id;
      }

      if (issue) {
        await updateIssue({
          orgId: ctx.orgId,
          issueId: issue.id,
          actorId: ctx.actorId,
          patch: { releaseId },
        });
        return {
          text: name ? `${issue.key} is tagged for ${name}.` : `Cleared the version on ${issue.key}.`,
          targetKey: issue.key,
        };
      }

      await db.epic.update({ where: { id: epic!.id }, data: { releaseId } });
      return {
        text: name ? `"${epic!.name}" is tagged for ${name}.` : `Cleared the version on "${epic!.name}".`,
      };
    },
  },

  {
    name: "close_epic",
    title: "Close or reopen an epic",
    description:
      "Marks an epic done, or puts it back to planned or in progress. Identify it by name.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        epic: { type: "string" },
        status: {
          type: "string",
          description: "DONE to close, or PLANNED / IN_PROGRESS to reopen. Defaults to DONE.",
        },
      },
      required: ["epic"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => {
      const status = str(a, "status").toUpperCase() || "DONE";
      return status === "DONE"
        ? `close the epic "${str(a, "epic")}"`
        : `reopen the epic "${str(a, "epic")}" as ${status}`;
    },
    run: async (ctx, args) => {
      const epic = await epicFor(ctx, str(args, "epic"));
      const status = (str(args, "status").toUpperCase() || "DONE") as
        | "PLANNED"
        | "IN_PROGRESS"
        | "DONE";
      if (!["PLANNED", "IN_PROGRESS", "DONE"].includes(status)) {
        throw new HttpError(400, "Status must be PLANNED, IN_PROGRESS or DONE");
      }

      await db.epic.update({ where: { id: epic.id }, data: { status } });
      await db.activity.create({
        data: {
          orgId: ctx.orgId,
          actorId: ctx.actorId,
          type: "EPIC_UPDATED" as const,
          message: status === "DONE" ? `closed epic ${epic.name}` : `reopened epic ${epic.name}`,
        },
      });

      const open = await db.issue.count({
        where: { epicId: epic.id, status: { not: "DONE" }, archivedAt: null },
      });
      return {
        text:
          status === "DONE"
            ? `Closed "${epic.name}".${open ? ` ${open} issue${open === 1 ? " is" : "s are"} still open in it.` : ""}`
            : `"${epic.name}" is ${status.toLowerCase().replace("_", " ")} again.`,
      };
    },
  },
  {
    name: "delete_epic",
    title: "Delete an epic",
    description:
      "Removes an epic. Its issues survive and simply lose the grouping — that part can't be undone. A person confirms this every time.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: { epic: { type: "string" } },
      required: ["epic"],
    },
    modes: ALWAYS_ASK,
    summarise: (a) => `delete the epic "${str(a, "epic")}"`,
    run: async (ctx, args) => {
      const epic = await epicFor(ctx, str(args, "epic"));
      // Counted before the delete, since afterwards there is nothing to count.
      const orphaned = await db.issue.count({ where: { epicId: epic.id } });

      await db.epic.delete({ where: { id: epic.id } });
      await db.activity.create({
        data: {
          orgId: ctx.orgId,
          actorId: ctx.actorId,
          type: "EPIC_UPDATED" as const,
          message: `deleted epic ${epic.name}`,
        },
      });

      return {
        text: `Deleted "${epic.name}".${orphaned ? ` ${orphaned} issue${orphaned === 1 ? "" : "s"} kept, now without an epic.` : ""}`,
      };
    },
  },

  {
    name: "list_notifications",
    title: "Read the notification centre",
    description:
      "What is waiting on the person who set this assistant up: approvals you have asked for, and notifications they have received. Read-only — only a person can answer an approval.",
    group: "Read",
    inputSchema: {
      type: "object",
      properties: {
        unreadOnly: { type: "boolean", description: "Only notifications they haven't read" },
        limit: { type: "number", description: "1–50, default 20" },
      },
    },
    modes: READ,
    summarise: () => "read the notification centre",
    run: async (ctx, args) => {
      const take = Math.min(Math.max(num(args, "limit") ?? 20, 1), 50);

      const [approvals, notifications] = await Promise.all([
        // Only this assistant's own requests — it has no business reading what
        // anyone else has been asked to approve.
        db.agentApproval.findMany({
          where: { assistantId: ctx.assistantId, status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take,
        }),
        db.notification.findMany({
          where: {
            userId: ctx.ownerId,
            archivedAt: null,
            ...(args.unreadOnly === true ? { readAt: null } : {}),
          },
          orderBy: { createdAt: "desc" },
          take,
          include: { issue: { select: { key: true } } },
        }),
      ]);

      const lines: string[] = [];

      if (approvals.length) {
        lines.push("WAITING ON A PERSON — your requests, unanswered:");
        for (const a of approvals) {
          lines.push(`  ${a.id} · ${a.summary} · asked ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")}`);
        }
        lines.push("Use check_approval with an id once one is answered.", "");
      }

      if (!notifications.length) {
        lines.push("No notifications.");
      } else {
        lines.push("NOTIFICATIONS:");
        for (const n of notifications) {
          lines.push(
            `  ${n.readAt ? " " : "•"} ${n.title}${n.detail ? ` — ${n.detail}` : ""}${n.issue ? ` (${n.issue.key})` : ""}`,
          );
        }
      }

      return { text: lines.join("\n") };
    },
  },

  /* ── writes a Helper makes on its own ────────────────────── */
  {
    name: "create_issue",
    title: "File an issue",
    description:
      "Files a new issue into Triage. Never assigns it or puts it in a sprint — a person does that.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", description: "NONE, LOW, MEDIUM, HIGH or URGENT" },
      },
      required: ["project", "title"],
    },
    modes: HELPER_FREE,
    summarise: (a) => `file "${str(a, "title")}" into ${str(a, "project").toUpperCase()} Triage`,
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const issue = await createIssue({
        orgId: ctx.orgId,
        projectId: project.id,
        actorId: ctx.actorId,
        title: str(args, "title"),
        description: str(args, "description") || null,
        priority: (str(args, "priority").toUpperCase() || undefined) as never,
      });
      return { text: `Filed ${issue.key} — ${issue.title}`, targetKey: issue.key };
    },
  },
  {
    name: "add_comment",
    title: "Comment on an issue",
    description: "Adds a comment. It appears under the assistant's own name.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" }, body: { type: "string" } },
      required: ["key", "body"],
    },
    modes: HELPER_FREE,
    summarise: (a) => `comment on ${str(a, "key").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      await db.comment.create({
        data: { issueId: issue.id, authorId: ctx.actorId, body: str(args, "body") },
      });
      await db.activity.create({
        data: {
          orgId: ctx.orgId,
          issueId: issue.id,
          actorId: ctx.actorId,
          type: "COMMENTED",
          message: "commented",
        },
      });
      return { text: `Commented on ${issue.key}.`, targetKey: issue.key };
    },
  },
  {
    name: "draft_task",
    title: "Draft a task for you",
    description:
      "Adds a private task to the list of the person who connected this assistant. Never sends it to anyone else.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        note: { type: "string" },
        issueKey: { type: "string", description: "Optional issue to reference for context" },
      },
      required: ["title"],
    },
    modes: HELPER_FREE,
    summarise: (a) => `draft the task "${str(a, "title")}" on your list`,
    run: async (ctx, args) => {
      const issue = str(args, "issueKey") ? await issueFor(ctx, str(args, "issueKey")) : null;
      const siblings = await db.task.findMany({
        where: { ownerId: ctx.ownerId, status: "OPEN" },
        select: { position: true },
      });
      const task = await db.task.create({
        data: {
          orgId: ctx.orgId,
          ownerId: ctx.ownerId,
          title: str(args, "title"),
          note: str(args, "note") || null,
          issueId: issue?.id ?? null,
          position: nextRank(siblings.map((s) => s.position)),
        },
      });
      return { text: `Drafted "${task.title}" on your task list.` };
    },
  },

  {
    name: "create_label",
    title: "Create a label",
    description:
      "Adds a label to a project's vocabulary. Returns the existing one if that name is already taken.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name: { type: "string" },
        color: {
          type: "string",
          description: "lime, blue, amber, violet, red or slate. Defaults to slate.",
        },
      },
      required: ["project", "name"],
    },
    modes: HELPER_FREE,
    summarise: (a) => `create the label "${str(a, "name")}" in ${str(a, "project").toUpperCase()}`,
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const name = str(args, "name");
      if (!name) throw new HttpError(400, "A label needs a name");

      // Upsert rather than fail: an agent asking twice should be harmless.
      const label = await db.label.upsert({
        where: { projectId_name: { projectId: project.id, name } },
        create: { projectId: project.id, name, color: colourOr(str(args, "color"), "slate") },
        update: {},
      });

      return { text: `Label "${label.name}" is available in ${project.key}.` };
    },
  },

  /* ── writes a Helper must ask about ──────────────────────── */
  {
    name: "create_epic",
    title: "Create an epic",
    description:
      "Opens a new epic in a project. An epic shows on the roadmap, so a helper asks first.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        color: {
          type: "string",
          description: "lime, blue, amber, violet, red or slate. Defaults to the project's colour.",
        },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        targetDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["project", "name"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => `create the epic "${str(a, "name")}" in ${str(a, "project").toUpperCase()}`,
    run: async (ctx, args) => {
      const project = await projectFor(ctx, str(args, "project"));
      const name = str(args, "name");
      if (!name) throw new HttpError(400, "An epic needs a name");

      // Epic keys come off an org-wide counter, the same as the app's own form.
      const org = await db.organization.update({
        where: { id: ctx.orgId },
        data: { epicCounter: { increment: 1 } },
        select: { epicCounter: true },
      });

      const epic = await db.epic.create({
        data: {
          projectId: project.id,
          key: `EPIC-${org.epicCounter}`,
          name,
          description: str(args, "description") || null,
          color: colourOr(str(args, "color"), project.color),
          startDate: parseDate(str(args, "startDate")),
          targetDate: parseDate(str(args, "targetDate")),
        },
      });

      await db.activity.create({
        data: {
          orgId: ctx.orgId,
          actorId: ctx.actorId,
          type: "EPIC_CREATED",
          message: `created epic ${epic.name}`,
        },
      });

      return { text: `Created epic "${epic.name}" (${epic.key}) in ${project.key}.` };
    },
  },

  {
    name: "update_issue",
    title: "Edit an issue",
    description:
      "Changes an issue's title, description, priority or estimate. Asks first unless the assistant is a full teammate.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "string" },
        estimate: { type: "number" },
      },
      required: ["key"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => {
      const fields = ["title", "description", "priority", "estimate"].filter(
        (f) => a[f] !== undefined,
      );
      return `edit ${str(a, "key").toUpperCase()} (${fields.join(", ") || "no fields"})`;
    },
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      await updateIssue({
        orgId: ctx.orgId,
        issueId: issue.id,
        actorId: ctx.actorId,
        patch: {
          ...(args.title !== undefined ? { title: str(args, "title") } : {}),
          ...(args.description !== undefined ? { description: str(args, "description") } : {}),
          ...(args.priority !== undefined
            ? { priority: str(args, "priority").toUpperCase() as never }
            : {}),
          ...(args.estimate !== undefined ? { estimate: num(args, "estimate") ?? null } : {}),
        },
      });
      return { text: `Updated ${issue.key}.`, targetKey: issue.key };
    },
  },
  {
    name: "move_issue",
    title: "Move a card",
    description: "Moves an issue to another board column.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        status: {
          type: "string",
          description: `One of ${STATUS_LIST}`,
        },
      },
      required: ["key", "status"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => `move ${str(a, "key").toUpperCase()} to ${str(a, "status").toUpperCase()}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      await updateIssue({
        orgId: ctx.orgId,
        issueId: issue.id,
        actorId: ctx.actorId,
        patch: { status: str(args, "status").toUpperCase() as never },
      });
      return { text: `Moved ${issue.key} to ${str(args, "status").toUpperCase()}.`, targetKey: issue.key };
    },
  },
  {
    name: "assign_issue",
    title: "Assign an issue",
    description: "Puts an issue on someone's plate, or takes it off.",
    group: "Coordinate",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        assignee: { type: "string", description: "Member name or email, or 'none'" },
      },
      required: ["key", "assignee"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => `assign ${str(a, "key").toUpperCase()} to ${str(a, "assignee")}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const target = str(args, "assignee");
      let assigneeId: string | null = null;
      if (target !== "none") {
        const person = await db.user.findFirst({
          where: {
            memberships: { some: { orgId: ctx.orgId } },
            OR: [
              { name: { contains: target, mode: "insensitive" } },
              { email: { equals: target, mode: "insensitive" } },
            ],
          },
        });
        if (!person) throw new HttpError(404, `No member matching "${target}"`);
        assigneeId = person.id;
      }
      await updateIssue({
        orgId: ctx.orgId,
        issueId: issue.id,
        actorId: ctx.actorId,
        patch: { assigneeId },
      });
      return { text: `${issue.key} is now ${assigneeId ? `assigned to ${target}` : "unassigned"}.`, targetKey: issue.key };
    },
  },
  {
    name: "set_labels",
    title: "Label an issue",
    description: "Replaces an issue's labels with the ones given.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        labels: { type: "array", items: { type: "string" }, description: "Label names" },
      },
      required: ["key", "labels"],
    },
    modes: HELPER_ASKS,
    summarise: (a) =>
      `label ${str(a, "key").toUpperCase()} with ${(Array.isArray(a.labels) ? a.labels : []).join(", ") || "nothing"}`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      const names = Array.isArray(args.labels) ? (args.labels as string[]) : [];
      const labels = await db.label.findMany({
        where: { projectId: issue.projectId, name: { in: names } },
      });
      await updateIssue({
        orgId: ctx.orgId,
        issueId: issue.id,
        actorId: ctx.actorId,
        patch: { labelIds: labels.map((l) => l.id) },
      });
      return { text: `${issue.key} now has: ${labels.map((l) => l.name).join(", ") || "no labels"}.`, targetKey: issue.key };
    },
  },
  {
    name: "link_issues",
    title: "Link two issues",
    description: "Records that one issue blocks another.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        blocker: { type: "string", description: "The issue that must land first" },
        blocked: { type: "string" },
      },
      required: ["blocker", "blocked"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => `make ${str(a, "blocker").toUpperCase()} block ${str(a, "blocked").toUpperCase()}`,
    run: async (ctx, args) => {
      const blocker = await issueFor(ctx, str(args, "blocker"));
      const blocked = await issueFor(ctx, str(args, "blocked"));
      if (blocker.id === blocked.id) throw new HttpError(400, "An issue can't block itself");
      await db.issueLink.upsert({
        where: { blockerId_blockedId: { blockerId: blocker.id, blockedId: blocked.id } },
        create: { blockerId: blocker.id, blockedId: blocked.id },
        update: {},
      });
      return { text: `${blocker.key} now blocks ${blocked.key}.`, targetKey: blocker.key };
    },
  },
  {
    name: "set_epic",
    title: "Put an issue in an epic",
    description: "Groups an issue under an epic, or removes it from one.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" }, epic: { type: "string", description: "Epic name, or 'none'" } },
      required: ["key", "epic"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => `put ${str(a, "key").toUpperCase()} in the epic "${str(a, "epic")}"`,
    run: async (ctx, args) => {
      const issue = await issueFor(ctx, str(args, "key"));
      let epicId: string | null = null;
      if (str(args, "epic") !== "none") {
        const epic = await db.epic.findFirst({
          where: { projectId: issue.projectId, name: { contains: str(args, "epic"), mode: "insensitive" } },
        });
        if (!epic) throw new HttpError(404, `No epic matching "${str(args, "epic")}"`);
        epicId = epic.id;
      }
      await updateIssue({ orgId: ctx.orgId, issueId: issue.id, actorId: ctx.actorId, patch: { epicId } });
      return { text: `${issue.key} updated.`, targetKey: issue.key };
    },
  },
  {
    name: "move_epic",
    title: "Reschedule an epic",
    description: "Changes an epic's start or target date on the roadmap.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        epic: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD, or empty to clear" },
        targetDate: { type: "string", description: "YYYY-MM-DD, or empty to clear" },
      },
      required: ["epic"],
    },
    modes: HELPER_ASKS,
    summarise: (a) =>
      `move the epic "${str(a, "epic")}" to ${str(a, "startDate") || "—"} → ${str(a, "targetDate") || "—"}`,
    run: async (ctx, args) => {
      const epic = await db.epic.findFirst({
        where: { project: projectScope(ctx), name: { contains: str(args, "epic"), mode: "insensitive" } },
      });
      if (!epic) throw new HttpError(404, `No epic matching "${str(args, "epic")}"`);
      await db.epic.update({
        where: { id: epic.id },
        data: {
          ...(args.startDate !== undefined
            ? { startDate: str(args, "startDate") ? new Date(str(args, "startDate")) : null }
            : {}),
          ...(args.targetDate !== undefined
            ? { targetDate: str(args, "targetDate") ? new Date(str(args, "targetDate")) : null }
            : {}),
        },
      });
      return { text: `Rescheduled "${epic.name}".` };
    },
  },
  {
    name: "delegate_task",
    title: "Hand a task to a teammate",
    description:
      "Sends a task to someone. It lands on their Tasks page and nowhere else, and they can decline it.",
    group: "Coordinate",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        to: { type: "string", description: "Member name or email" },
        note: { type: "string" },
      },
      required: ["title", "to"],
    },
    modes: HELPER_ASKS,
    summarise: (a) => `hand "${str(a, "title")}" to ${str(a, "to")}`,
    run: async (ctx, args) => {
      const { createTask } = await import("../tasks/service");
      const person = await db.user.findFirst({
        where: {
          memberships: { some: { orgId: ctx.orgId } },
          isAgent: false,
          OR: [
            { name: { contains: str(args, "to"), mode: "insensitive" } },
            { email: { equals: str(args, "to"), mode: "insensitive" } },
          ],
        },
      });
      if (!person) throw new HttpError(404, `No member matching "${str(args, "to")}"`);

      const task = await createTask({
        orgId: ctx.orgId,
        actorId: ctx.ownerId,
        title: str(args, "title"),
        note: str(args, "note") || null,
        delegateToId: person.id,
      });
      return { text: `Sent "${task.title}" to ${person.name}.` };
    },
  },

  /* ── full teammate only ──────────────────────────────────── */
  {
    name: "bulk_update_issues",
    title: "Change many issues at once",
    description:
      "Applies the same change to several issues. A helper must ask first; a full teammate does it directly.",
    group: "Write",
    inputSchema: {
      type: "object",
      properties: {
        keys: { type: "array", items: { type: "string" }, description: "Issue keys" },
        status: { type: "string" },
        priority: { type: "string" },
        estimate: { type: "number" },
      },
      required: ["keys"],
    },
    modes: FULL_ONLY,
    summarise: (a) => {
      const keys = Array.isArray(a.keys) ? (a.keys as string[]) : [];
      const fields = ["status", "priority", "estimate"].filter((f) => a[f] !== undefined);
      return `change ${keys.length} issue${keys.length === 1 ? "" : "s"} (${fields.join(", ")}) — ${keys.join(", ")}`;
    },
    run: async (ctx, args) => {
      const keys = Array.isArray(args.keys) ? (args.keys as string[]) : [];
      if (keys.length > 50) throw new HttpError(400, "That's more than 50 issues at once");

      const done: string[] = [];
      for (const key of keys) {
        const issue = await issueFor(ctx, key);
        await updateIssue({
          orgId: ctx.orgId,
          issueId: issue.id,
          actorId: ctx.actorId,
          patch: {
            ...(args.status !== undefined
              ? { status: str(args, "status").toUpperCase() as never }
              : {}),
            ...(args.priority !== undefined
              ? { priority: str(args, "priority").toUpperCase() as never }
              : {}),
            ...(args.estimate !== undefined ? { estimate: num(args, "estimate") ?? null } : {}),
          },
        });
        done.push(issue.key);
      }
      return { text: `Updated ${done.length}: ${done.join(", ")}` };
    },
  },
];

/**
 * Approvals are asynchronous: the call that needed one returns an id, and the
 * agent collects the answer here once a person has decided.
 */
TOOLS.push({
  name: "check_approval",
  title: "Check an approval",
  description:
    "Looks up an approval you were given an id for. Tells you whether a person approved it, said no, or hasn't answered yet.",
  group: "Read",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "The approval id you were given" } },
    required: ["id"],
  },
  modes: READ,
  summarise: () => "check an approval",
  run: async (ctx, args) => {
    const approval = await db.agentApproval.findFirst({
      where: { id: str(args, "id"), assistantId: ctx.assistantId },
    });
    if (!approval) throw new HttpError(404, "No approval with that id");

    if (approval.status === "PENDING") {
      const stale = approval.expiresAt < new Date();
      return {
        text: stale
          ? `That request expired without an answer. Ask again if it still matters.`
          : `Still waiting on a person. Asked to ${approval.summary}.`,
      };
    }
    if (approval.status === "DENIED") {
      return { text: `A person said no to: ${approval.summary}` };
    }
    if (approval.error) {
      return { text: `Approved, but it failed: ${approval.error}` };
    }
    const result = approval.result as { text?: string } | null;
    return { text: `Approved. ${result?.text ?? "Done."}` };
  },
});

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

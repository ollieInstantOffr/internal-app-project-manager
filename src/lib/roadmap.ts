import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import type { RoadmapDetail } from "@/generated/prisma/enums";

/** The three plain states an outsider gets instead of a percentage. */
export type PublicState = "IN_PROGRESS" | "PLANNED" | "EXPLORING";

export type TimelineColumn = { label: string; start: Date; end: Date };

export type RoadmapItem = {
  id: string;
  name: string;
  summary: string | null;
  state: PublicState;
  /** Percent offset and width across the whole window, or null when undated. */
  bar: { left: number; width: number } | null;
  timing: string;
  /** Which column this belongs under on the phone layout. */
  group: string;
  progress: number | null;
  issues: { key: string; title: string; done: boolean }[];
  assignees: { id: string; name: string; avatarHue: number }[];
};

export type ShippedItem = {
  id: string;
  name: string;
  summary: string | null;
  shippedAt: string;
};

export type PublicRoadmap = {
  org: { name: string; slug: string };
  project: { key: string; name: string; color: string };
  page: {
    headline: string;
    intro: string | null;
    detail: RoadmapDetail;
    showShipped: boolean;
    showSubscribe: boolean;
    showProgress: boolean;
    showIssues: boolean;
    showAssignees: boolean;
    enabled: boolean;
  };
  updatedAt: string;
  columns: { label: string }[];
  items: RoadmapItem[];
  /** Phone layout: the same items, gathered under their timing headings. */
  groups: { label: string; items: RoadmapItem[] }[];
  milestones: { id: string; name: string; date: string; timing: string; passed: boolean }[];
  shipped: ShippedItem[];
};

const QUARTER_LABEL = (date: Date) => `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
const MONTH_LABEL = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
const DATE_LABEL = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function startOfQuarter(date: Date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

/**
 * The window the bars are drawn against. Quarters keep the promise vague;
 * months and dates are progressively more of a commitment.
 */
export function windowFor(detail: RoadmapDetail, now: Date) {
  if (detail === "QUARTERS") {
    const first = startOfQuarter(now);
    const columns: TimelineColumn[] = Array.from({ length: 4 }, (_, i) => {
      const start = new Date(first.getFullYear(), first.getMonth() + i * 3, 1);
      const end = new Date(first.getFullYear(), first.getMonth() + (i + 1) * 3, 1);
      return { label: QUARTER_LABEL(start), start, end };
    });
    return { columns, start: columns[0].start, end: columns[columns.length - 1].end };
  }

  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const columns: TimelineColumn[] = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(first.getFullYear(), first.getMonth() + i, 1);
    const end = new Date(first.getFullYear(), first.getMonth() + i + 1, 1);
    return { label: start.toLocaleDateString("en-US", { month: "short" }), start, end };
  });
  return { columns, start: columns[0].start, end: columns[columns.length - 1].end };
}

function labelFor(detail: RoadmapDetail, date: Date) {
  if (detail === "QUARTERS") return QUARTER_LABEL(date);
  if (detail === "MONTHS") return MONTH_LABEL(date);
  return DATE_LABEL(date);
}

/** "Q4 2026 — Q1 2027", or a single label when both ends agree. */
function rangeLabel(detail: RoadmapDetail, start: Date | null, end: Date | null) {
  const a = start ? labelFor(detail, start) : null;
  const b = end ? labelFor(detail, end) : null;
  if (a && b) return a === b ? a : `${a} — ${b}`;
  return a ?? b ?? "";
}

function stateOf(epic: { status: string; startDate: Date | null; targetDate: Date | null }) {
  if (epic.status === "IN_PROGRESS") return "IN_PROGRESS" as const;
  // No dates at all is the honest definition of "we're still looking at it".
  if (!epic.startDate && !epic.targetDate) return "EXPLORING" as const;
  return "PLANNED" as const;
}

export async function loadPublicRoadmap(
  orgSlug: string,
  projectKey: string,
  now = new Date(),
): Promise<PublicRoadmap | null> {
  const project = await db.project.findFirst({
    where: {
      key: projectKey.toUpperCase(),
      archived: false,
      org: { slug: orgSlug.toLowerCase() },
    },
    include: { org: true, roadmapPage: true },
  });
  if (!project?.roadmapPage) return null;

  const page = project.roadmapPage;

  const epics = await db.epic.findMany({
    where: { projectId: project.id, publicVisible: true },
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: {
      issues: {
        where: { archivedAt: null },
        select: {
          key: true,
          title: true,
          status: true,
          assignee: { select: { id: true, name: true, avatarHue: true } },
        },
      },
    },
  });

  const milestones = await db.milestone.findMany({
    where: { orgId: project.orgId },
    orderBy: { date: "asc" },
  });

  const { columns, start, end } = windowFor(page.detail, now);
  const span = end.getTime() - start.getTime();
  const quarterEnd = new Date(startOfQuarter(now).getFullYear(), startOfQuarter(now).getMonth() + 3, 1);

  const live = epics.filter((e) => e.status !== "DONE");

  const items: RoadmapItem[] = live.map((epic) => {
    const state = stateOf(epic);
    const from = epic.startDate ?? epic.targetDate;
    const to = epic.targetDate ?? epic.startDate;

    // Undated work sits at the tail of the window rather than pretending to a date.
    let bar: { left: number; width: number } | null = null;
    if (from && to) {
      const left = ((from.getTime() - start.getTime()) / span) * 100;
      const width = ((to.getTime() - from.getTime()) / span) * 100;
      bar = {
        left: Math.max(1, Math.min(94, left)),
        width: Math.max(12, Math.min(97 - Math.max(1, Math.min(94, left)), width)),
      };
    }

    const done = epic.issues.filter((i) => i.status === "DONE").length;
    const shipsThisQuarter =
      state === "IN_PROGRESS" && !!epic.targetDate && epic.targetDate < quarterEnd;

    const timing =
      state === "EXPLORING"
        ? "No date yet"
        : shipsThisQuarter
          ? "Ships this quarter"
          : rangeLabel(page.detail, epic.startDate, epic.targetDate);

    const assignees = page.showAssignees
      ? [
          ...new Map(
            epic.issues
              .map((i) => i.assignee)
              .filter((a): a is NonNullable<typeof a> => !!a)
              .map((a) => [a.id, a]),
          ).values(),
        ]
      : [];

    return {
      id: epic.id,
      name: epic.name,
      summary: epic.publicSummary ?? epic.description,
      state,
      bar,
      timing,
      group:
        state === "EXPLORING"
          ? "Later"
          : rangeLabel("QUARTERS", epic.startDate ?? epic.targetDate, epic.targetDate),
      progress: page.showProgress && epic.issues.length ? Math.round((done / epic.issues.length) * 100) : null,
      issues: page.showIssues
        ? epic.issues.map((i) => ({ key: i.key, title: i.title, done: i.status === "DONE" }))
        : [],
      assignees,
    };
  });

  // Phone layout groups by timing, keeping the timeline's order.
  const groups: { label: string; items: RoadmapItem[] }[] = [];
  for (const item of items) {
    const existing = groups.find((g) => g.label === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }

  const shipped: ShippedItem[] = page.showShipped
    ? epics
        .filter((e) => e.status === "DONE")
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((e) => ({
          id: e.id,
          name: e.name,
          summary: e.publicSummary ?? e.description,
          shippedAt: e.updatedAt.toISOString(),
        }))
    : [];

  return {
    org: { name: project.org.name, slug: project.org.slug },
    project: { key: project.key, name: project.name, color: project.color },
    page: {
      headline: page.headline,
      intro: page.intro,
      detail: page.detail,
      showShipped: page.showShipped,
      showSubscribe: page.showSubscribe,
      showProgress: page.showProgress,
      showIssues: page.showIssues,
      showAssignees: page.showAssignees,
      enabled: page.enabled,
    },
    updatedAt: (page.publishedAt ?? page.updatedAt).toISOString(),
    columns: columns.map((c) => ({ label: c.label })),
    items,
    groups,
    milestones: milestones.map((m) => ({
      id: m.id,
      name: m.name,
      date: m.date.toISOString(),
      timing: labelFor(page.detail === "DATES" ? "DATES" : "MONTHS", m.date),
      passed: m.status === "SHIPPED" || m.date < now,
    })),
    shipped,
  };
}

/**
 * A digest of exactly what a visitor sees. Subscribers hear from us when this
 * moves and at no other time.
 */
export function hashRoadmap(roadmap: PublicRoadmap) {
  const shape = {
    headline: roadmap.page.headline,
    intro: roadmap.page.intro,
    items: roadmap.items.map((i) => [i.name, i.summary, i.state, i.timing]),
    shipped: roadmap.shipped.map((s) => [s.name, s.summary]),
    milestones: roadmap.milestones.map((m) => [m.name, m.date]),
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

/** Creates the page row on first use, so the share sheet always has something to edit. */
export async function ensureRoadmapPage(projectId: string) {
  return db.roadmapPage.upsert({
    where: { projectId },
    create: { projectId },
    update: {},
  });
}

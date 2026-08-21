import "dotenv/config";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  Role,
  IssueStatus,
  Priority,
  SprintStatus,
  EpicStatus,
  PrState,
  ActivityType,
  NotificationKind,
  Urgency,
  MilestoneStatus,
} from "../src/generated/prisma/enums";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DAY = 864e5;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY);

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

const PASSWORD = "arcdemo123";

async function main() {
  console.log("Seeding Arc…");

  await db.organization.deleteMany({ where: { slug: "acme-eng" } });
  await db.user.deleteMany({ where: { email: { endsWith: "@acme.dev" } } });

  /* ── people ─────────────────────────────────────────────── */

  const password = hashPassword(PASSWORD);

  const sam = await db.user.create({
    data: {
      email: "sam@acme.dev",
      name: "Sam Okafor",
      passwordHash: password,
      githubLogin: "samok",
      avatarHue: 285,
      emailVerified: ago(40),
      prefs: { create: {} },
    },
  });
  const mira = await db.user.create({
    data: {
      email: "mira@acme.dev",
      name: "Mira Chen",
      passwordHash: password,
      githubLogin: "mirac",
      avatarHue: 230,
      emailVerified: ago(38),
      prefs: { create: {} },
    },
  });
  const dev = await db.user.create({
    data: {
      email: "dev@acme.dev",
      name: "Dev Patel",
      passwordHash: password,
      githubLogin: "devp",
      avatarHue: 40,
      emailVerified: ago(30),
      prefs: { create: {} },
    },
  });
  const ana = await db.user.create({
    data: {
      email: "ana@acme.dev",
      name: "Ana Ruiz",
      passwordHash: password,
      githubLogin: "anaruiz",
      avatarHue: 150,
      emailVerified: ago(12),
      prefs: { create: {} },
    },
  });

  const org = await db.organization.create({
    data: {
      name: "Acme Engineering",
      slug: "acme-eng",
      githubOrg: "acme",
      members: {
        create: [
          { userId: sam.id, role: Role.OWNER },
          { userId: mira.id, role: Role.ADMIN },
          { userId: dev.id, role: Role.MEMBER },
          { userId: ana.id, role: Role.MEMBER },
        ],
      },
      integrations: {
        create: { provider: "github", connected: true, account: "github.com/acme" },
      },
    },
  });

  const teams = await Promise.all(
    [
      { name: "Web", users: [sam.id, mira.id, ana.id] },
      { name: "API", users: [dev.id, sam.id] },
      { name: "Mobile", users: [ana.id] },
    ].map((t) =>
      db.team.create({
        data: { orgId: org.id, name: t.name, members: { create: t.users.map((userId) => ({ userId })) } },
      }),
    ),
  );
  console.log(`  ${teams.length} teams`);

  await db.invite.create({
    data: {
      orgId: org.id,
      email: "kit@acme.dev",
      role: Role.MEMBER,
      token: crypto.randomBytes(24).toString("base64url"),
      invitedById: sam.id,
      expiresAt: ahead(12),
      createdAt: ago(2),
    },
  });

  await db.automationRule.createMany({
    data: [
      {
        orgId: org.id,
        trigger: "BRANCH_PUSHED",
        action: "SET_IN_PROGRESS",
        label: "Branch `*WEB-123*` pushed → **In progress**",
        enabled: true,
        builtIn: true,
      },
      {
        orgId: org.id,
        trigger: "PR_OPENED",
        action: "SET_IN_REVIEW",
        label: "PR opened → **In review**, reviewers become watchers",
        enabled: true,
        builtIn: true,
      },
      {
        orgId: org.id,
        trigger: "PR_MERGED",
        action: "SET_DONE",
        label: "PR merged → **Done**, closes subtasks",
        enabled: true,
        builtIn: true,
      },
      {
        orgId: org.id,
        trigger: "CI_FAILED",
        action: "COMMENT_ON_ISSUE",
        label: "CI red → comment on the issue",
        enabled: false,
        builtIn: true,
      },
    ],
  });

  /* ── projects ───────────────────────────────────────────── */

  const web = await db.project.create({
    data: {
      orgId: org.id,
      name: "Web App",
      key: "WEB",
      color: "lime",
      repoFullName: "acme/web-app",
      createdAt: ago(120),
    },
  });
  const apiProject = await db.project.create({
    data: {
      orgId: org.id,
      name: "API",
      key: "API",
      color: "blue",
      repoFullName: "acme/api",
      createdAt: ago(90),
    },
  });
  const mobile = await db.project.create({
    data: { orgId: org.id, name: "Mobile", key: "MOB", color: "amber", createdAt: ago(30) },
  });

  const labels: Record<string, string> = {};
  for (const [name, color] of [
    ["bug", "red"],
    ["auth", "slate"],
    ["performance", "blue"],
    ["ux", "violet"],
    ["infra", "slate"],
  ] as const) {
    const label = await db.label.create({ data: { projectId: web.id, name, color } });
    labels[name] = label.id;
  }

  /* ── epics ──────────────────────────────────────────────── */

  let epicNo = 0;
  const makeEpic = async (
    projectId: string,
    name: string,
    opts: { start?: number; target?: number; color?: string; status?: EpicStatus } = {},
  ) => {
    epicNo += 1;
    return db.epic.create({
      data: {
        projectId,
        key: `EPIC-${epicNo + 11}`,
        name,
        color: opts.color ?? "lime",
        status: opts.status ?? EpicStatus.IN_PROGRESS,
        startDate: opts.start !== undefined ? ago(opts.start) : null,
        targetDate: opts.target !== undefined ? ahead(opts.target) : null,
      },
    });
  };

  const epicAuth = await makeEpic(web.id, "Auth hardening", { start: 40, target: 45 });
  const epicPerf = await makeEpic(web.id, "Board performance", { start: 5, target: 80, color: "lime" });
  const epicApi = await makeEpic(apiProject.id, "Public API v2", {
    start: -20,
    target: 150,
    color: "blue",
    status: EpicStatus.PLANNED,
  });
  const epicMobile = await makeEpic(mobile.id, "Mobile beta", {
    start: -60,
    target: 210,
    color: "amber",
    status: EpicStatus.PLANNED,
  });
  const epicInsights = await makeEpic(web.id, "Insights & velocity", {
    start: -120,
    target: 280,
    status: EpicStatus.PLANNED,
  });

  /* ── sprints ────────────────────────────────────────────── */

  const sprints: Record<number, { id: string; name: string }> = {};
  for (let n = 9; n <= 15; n++) {
    const isActive = n === 14;
    const isFuture = n === 15;
    const startOffset = (14 - n) * 14;
    const sprint = await db.sprint.create({
      data: {
        projectId: web.id,
        number: n,
        name: `Sprint ${n}`,
        status: isFuture
          ? SprintStatus.PLANNED
          : isActive
            ? SprintStatus.ACTIVE
            : SprintStatus.COMPLETED,
        startDate: isFuture ? ahead(4) : ago(startOffset + 10),
        endDate: isFuture ? ahead(16) : ago(startOffset - 4),
        capacity: 40,
        committedPoints: [0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 31, 35, 33, 40, 41, 40][n] ?? 40,
        completedAt: isActive || isFuture ? null : ago(startOffset - 4),
      },
    });
    sprints[n] = { id: sprint.id, name: sprint.name };
  }

  const apiSprint = await db.sprint.create({
    data: {
      projectId: apiProject.id,
      number: 9,
      name: "Sprint 9",
      status: SprintStatus.ACTIVE,
      startDate: ago(6),
      endDate: ahead(8),
      capacity: 30,
      committedPoints: 22,
    },
  });

  /* ── issues ─────────────────────────────────────────────── */

  let webNo = 0;
  let rank = 1024;

  type Spec = {
    title: string;
    status: IssueStatus;
    estimate?: number | null;
    assignee?: string | null;
    epic?: string | null;
    sprint?: number | null;
    priority?: Priority;
    labels?: string[];
    description?: string;
    startedDaysAgo?: number;
    doneDaysAgo?: number;
    number?: number;
    /** Added after the sprint was already running — this is what scope change measures. */
    midSprint?: boolean;
  };

  const sprintStartDays: Record<number, number> = {};
  for (let n = 9; n <= 15; n++) {
    sprintStartDays[n] = n === 15 ? -4 : (14 - n) * 14 + 10;
  }

  const makeWebIssue = async (spec: Spec) => {
    webNo = spec.number ?? webNo + 1;
    rank += 1024;
    // Planned work predates its sprint; only `midSprint` items arrive after kickoff.
    const createdDaysAgo = spec.sprint
      ? spec.midSprint
        ? Math.max(sprintStartDays[spec.sprint] - 4, 0)
        : sprintStartDays[spec.sprint] + 5
      : (spec.startedDaysAgo ?? 10) + 3;
    const issue = await db.issue.create({
      data: {
        projectId: web.id,
        number: webNo,
        key: `WEB-${webNo}`,
        title: spec.title,
        description: spec.description ?? null,
        status: spec.status,
        priority: spec.priority ?? Priority.NONE,
        estimate: spec.estimate ?? null,
        assigneeId: spec.assignee ?? null,
        epicId: spec.epic ?? null,
        sprintId: spec.sprint ? sprints[spec.sprint].id : null,
        createdById: sam.id,
        rank,
        startedAt: spec.startedDaysAgo !== undefined ? ago(spec.startedDaysAgo) : null,
        completedAt: spec.doneDaysAgo !== undefined ? ago(spec.doneDaysAgo) : null,
        createdAt: ago(createdDaysAgo),
        labels: spec.labels?.length
          ? { create: spec.labels.map((name) => ({ labelId: labels[name] })) }
          : undefined,
      },
    });
    return issue;
  };

  // The historical sprints — enough for velocity, cycle time and flow to be real.
  for (let n = 9; n <= 13; n++) {
    const completedPoints = [0, 0, 0, 0, 0, 0, 0, 0, 0, 23, 29, 25, 32, 38][n];
    let remaining = completedPoints;
    let i = 0;
    while (remaining > 0) {
      const estimate = Math.min(remaining, [2, 3, 5, 3, 2][i % 5]);
      remaining -= estimate;
      i += 1;
      const startedDaysAgo = (14 - n) * 14 + 8;
      await makeWebIssue({
        title: `${["Polish", "Refactor", "Fix", "Add", "Tidy"][i % 5]} ${
          ["column headers", "filter chips", "sprint rollover", "keyboard focus ring", "empty states"][i % 5]
        } (S${n})`,
        status: IssueStatus.DONE,
        estimate,
        assignee: [sam.id, mira.id, dev.id, ana.id][i % 4],
        sprint: n,
        epic: i % 3 === 0 ? epicAuth.id : null,
        startedDaysAgo,
        doneDaysAgo: startedDaysAgo - 3,
      });
    }
  }

  // Jump the counter so the headline issues carry the keys from the design.
  webNo = 399;

  const web399 = await makeWebIssue({
    title: "Filter chips wrap awkwardly at narrow widths",
    status: IssueStatus.DONE,
    estimate: 2,
    assignee: ana.id,
    sprint: 13,
    number: 399,
    startedDaysAgo: 20,
    doneDaysAgo: 17,
  });

  const web402 = await makeWebIssue({
    title: "Board column virtualization",
    status: IssueStatus.IN_REVIEW,
    estimate: 5,
    assignee: mira.id,
    epic: epicPerf.id,
    sprint: 14,
    number: 402,
    startedDaysAgo: 6,
    labels: ["performance"],
  });

  const web408 = await makeWebIssue({
    midSprint: true,
    title: "Refactor auth middleware to share session logic",
    description:
      "Session parsing is duplicated across three middlewares. Consolidate into one module so cookie flags and expiry live in one place.",
    status: IssueStatus.IN_PROGRESS,
    estimate: 3,
    priority: Priority.HIGH,
    assignee: sam.id,
    epic: epicAuth.id,
    sprint: 14,
    number: 408,
    startedDaysAgo: 1,
    labels: ["bug", "auth"],
  });

  const web409 = await makeWebIssue({
    title: "Session cookie flags for staging",
    status: IssueStatus.TODO,
    estimate: 2,
    assignee: sam.id,
    epic: epicAuth.id,
    sprint: 14,
    number: 409,
    labels: ["auth"],
  });

  await makeWebIssue({
    title: "Rotate refresh tokens on password change",
    status: IssueStatus.TODO,
    estimate: 5,
    epic: epicAuth.id,
    number: 411,
    labels: ["auth"],
  });

  await makeWebIssue({
    title: "Audit log for admin actions",
    status: IssueStatus.TODO,
    estimate: 3,
    epic: epicAuth.id,
    number: 414,
  });

  await makeWebIssue({
    title: "Empty state for zero projects",
    status: IssueStatus.TODO,
    estimate: 2,
    number: 415,
  });

  await makeWebIssue({
    title: "2FA recovery codes",
    status: IssueStatus.TODO,
    epic: epicAuth.id,
    number: 416,
    labels: ["auth"],
  });

  const web419 = await makeWebIssue({
    title: "Single sign-on for the admin console",
    status: IssueStatus.TODO,
    estimate: 5,
    assignee: mira.id,
    epic: epicAuth.id,
    sprint: 14,
    number: 419,
    labels: ["auth"],
  });

  await makeWebIssue({
    title: "Virtualize long columns",
    status: IssueStatus.TODO,
    estimate: 5,
    epic: epicPerf.id,
    number: 420,
    labels: ["performance"],
  });

  await makeWebIssue({
    title: "Cache epic rollups",
    status: IssueStatus.TODO,
    estimate: 3,
    epic: epicPerf.id,
    number: 421,
    labels: ["performance"],
  });

  const web423 = await makeWebIssue({
    title: "Multi-select on backlog rows",
    status: IssueStatus.IN_PROGRESS,
    estimate: 3,
    assignee: ana.id,
    epic: epicPerf.id,
    sprint: 14,
    number: 423,
    startedDaysAgo: 3,
    labels: ["ux"],
  });

  await makeWebIssue({
    title: "Sprint burndown chart",
    status: IssueStatus.TODO,
    estimate: 5,
    epic: epicInsights.id,
    sprint: 15,
    number: 425,
  });

  await makeWebIssue({
    title: "Notification digest email",
    status: IssueStatus.TODO,
    estimate: 3,
    epic: epicInsights.id,
    sprint: 15,
    number: 427,
  });

  await makeWebIssue({
    title: "Bulk edit undo toast",
    status: IssueStatus.TODO,
    estimate: 2,
    epic: epicPerf.id,
    sprint: 15,
    number: 428,
  });

  await makeWebIssue({
    title: "Add rate limit headers to public API",
    status: IssueStatus.TRIAGE,
    number: 430,
  });

  const web431 = await makeWebIssue({
    title: "Fix flaky auth e2e",
    status: IssueStatus.TRIAGE,
    assignee: dev.id,
    epic: epicAuth.id,
    number: 431,
    labels: ["bug", "auth"],
  });

  await makeWebIssue({
    title: "Search returns stale results after filter change",
    status: IssueStatus.TRIAGE,
    number: 432,
    labels: ["bug"],
  });

  await makeWebIssue({
    title: "Keyboard nav for board columns",
    status: IssueStatus.TODO,
    number: 433,
    labels: ["ux"],
  });

  await makeWebIssue({
    title: "Timeline drag handles",
    status: IssueStatus.IN_PROGRESS,
    estimate: 3,
    assignee: mira.id,
    sprint: 14,
    number: 418,
    startedDaysAgo: 4,
  });

  // Sprint 14 has real completed work behind it.
  const sprint14Done: [string, number, string][] = [
    ["Sticky column headers on scroll", 8, mira.id],
    ["Debounce the board filter input", 5, ana.id],
    ["Persist collapsed epic groups", 5, sam.id],
    ["Inline compose on every column", 8, mira.id],
    ["Range-select with shift-click", 8, ana.id],
    ["Undo toast for bulk edits", 5, dev.id],
  ];
  let extraNo = 433;
  for (const [title, estimate, assignee] of sprint14Done) {
    extraNo += 1;
    await makeWebIssue({
      number: extraNo,
      title,
      status: IssueStatus.DONE,
      estimate,
      assignee,
      sprint: 14,
      epic: epicPerf.id,
      startedDaysAgo: 3,
      doneDaysAgo: 1,
    });
  }

  await makeWebIssue({
    title: "Invite-by-link flow",
    status: IssueStatus.IN_REVIEW,
    estimate: 3,
    assignee: ana.id,
    sprint: 14,
    number: 410,
    startedDaysAgo: 7,
  });

  // API project
  let apiNo = 51;
  const makeApiIssue = async (spec: Spec) => {
    apiNo = spec.number ?? apiNo + 1;
    rank += 1024;
    return db.issue.create({
      data: {
        projectId: apiProject.id,
        number: apiNo,
        key: `API-${apiNo}`,
        title: spec.title,
        status: spec.status,
        estimate: spec.estimate ?? null,
        assigneeId: spec.assignee ?? null,
        epicId: spec.epic ?? null,
        sprintId: spec.sprint ? apiSprint.id : null,
        createdById: dev.id,
        rank,
        createdAt: ago(14),
        startedAt: spec.startedDaysAgo !== undefined ? ago(spec.startedDaysAgo) : null,
      },
    });
  };

  await makeApiIssue({ title: "Rate-limit auth endpoints", status: IssueStatus.TODO, estimate: 3, number: 52, epic: epicApi.id });
  const api77 = await makeApiIssue({
    title: "Review PR #219 — pagination cursor",
    status: IssueStatus.IN_REVIEW,
    estimate: 5,
    assignee: sam.id,
    sprint: 9,
    number: 77,
    startedDaysAgo: 4,
    epic: epicApi.id,
  });
  for (let i = 0; i < 9; i++) {
    await makeApiIssue({
      title: [
        "Cursor pagination for /issues",
        "Idempotency keys on writes",
        "OpenAPI spec generation",
        "Webhook retry backoff",
        "Bulk endpoints",
        "Field-level filtering",
        "Deprecate v1 tokens",
        "Rate-limit headers",
        "SDK smoke tests",
      ][i],
      status: i < 2 ? IssueStatus.TODO : IssueStatus.TRIAGE,
      estimate: [3, 5, 2, 3, 5, 2, 1, 2, 3][i],
      epic: epicApi.id,
      sprint: i < 2 ? 9 : null,
    });
  }

  // Mobile backlog
  for (let i = 0; i < 9; i++) {
    rank += 1024;
    await db.issue.create({
      data: {
        projectId: mobile.id,
        number: i + 1,
        key: `MOB-${i + 1}`,
        title: [
          "Design system on React Native",
          "Offline issue cache",
          "Push notifications",
          "Biometric unlock",
          "Board gestures",
          "Deep links from email",
          "Crash reporting",
          "App Store listing",
          "TestFlight build pipeline",
        ][i],
        status: IssueStatus.TRIAGE,
        epicId: epicMobile.id,
        createdById: ana.id,
        rank,
        createdAt: ago(20),
      },
    });
  }
  // The counter must sit above every number actually used, whatever order they were created in.
  for (const project of [web, apiProject, mobile]) {
    const top = await db.issue.aggregate({
      where: { projectId: project.id },
      _max: { number: true },
    });
    await db.project.update({
      where: { id: project.id },
      data: { issueCounter: top._max.number ?? 0 },
    });
  }

  /* ── the WEB-408 story ──────────────────────────────────── */

  await db.subtask.createMany({
    data: [
      { issueId: web408.id, title: "Extract cookie parser", done: true, position: 1024, completedAt: ago(1) },
      { issueId: web408.id, title: "Unit tests for parser", done: true, position: 2048, completedAt: ago(1) },
      { issueId: web408.id, title: "Swap middlewares to shared module", done: false, position: 3072, assigneeId: sam.id },
      { issueId: web408.id, title: "Delete the old copies", done: false, position: 4096 },
    ],
  });

  await db.issueLink.create({ data: { blockerId: web408.id, blockedId: web419.id } });
  await db.issueLink.create({ data: { blockerId: web408.id, blockedId: web431.id } });

  await db.gitBranch.create({
    data: { issueId: web408.id, repo: "acme/web-app", name: "fix/408-auth", commits: 4, ahead: 4 },
  });
  await db.pullRequest.create({
    data: {
      issueId: web408.id,
      repo: "acme/web-app",
      number: 418,
      title: "WEB-408 share session logic",
      branch: "fix/408-auth",
      state: PrState.DRAFT,
      checksPassed: 2,
      checksFailed: 1,
      createdAt: ago(1),
    },
  });
  await db.pullRequest.create({
    data: {
      issueId: web402.id,
      repo: "acme/web-app",
      number: 412,
      title: "WEB-402 virtualize board columns",
      branch: "feat/402-virtualize",
      state: PrState.OPEN,
      checksPassed: 3,
      approvals: 2,
      createdAt: ago(3),
    },
  });
  await db.pullRequest.create({
    data: {
      issueId: api77.id,
      repo: "acme/api",
      number: 219,
      title: "API-77 pagination cursor",
      branch: "feat/77-cursor",
      state: PrState.OPEN,
      checksPassed: 4,
      createdAt: ago(2),
    },
  });
  await db.gitBranch.create({
    data: { issueId: web423.id, repo: "acme/web-app", name: "feat/423-multiselect", commits: 6, ahead: 6 },
  });

  await db.watcher.createMany({
    data: [
      { issueId: web408.id, userId: sam.id },
      { issueId: web408.id, userId: mira.id },
      { issueId: web402.id, userId: sam.id },
      { issueId: api77.id, userId: sam.id },
    ],
    skipDuplicates: true,
  });

  await db.comment.createMany({
    data: [
      {
        issueId: web408.id,
        authorId: mira.id,
        body: "The staging cookie flag is the risky bit. Let's ship it behind a flag.",
        createdAt: ago(0.08),
      },
      {
        issueId: web408.id,
        authorId: mira.id,
        body: "@samok any update? WEB-419 is waiting.",
        createdAt: ago(0.04),
      },
      {
        issueId: web399.id,
        authorId: ana.id,
        body: "@samok this also affects the backlog rows — worth a follow-up?",
        createdAt: ago(0.05),
      },
    ],
  });

  /* ── activity trail (drives Insights) ───────────────────── */

  const transitions: {
    issueId: string;
    from: IssueStatus;
    to: IssueStatus;
    daysAgo: number;
  }[] = [];

  const doneIssues = await db.issue.findMany({
    where: { projectId: web.id, status: IssueStatus.DONE, startedAt: { not: null } },
    select: { id: true, startedAt: true, completedAt: true },
    take: 60,
  });

  for (const issue of doneIssues) {
    const started = (Date.now() - issue.startedAt!.getTime()) / DAY;
    const completed = issue.completedAt ? (Date.now() - issue.completedAt.getTime()) / DAY : started - 3;
    transitions.push(
      { issueId: issue.id, from: IssueStatus.TRIAGE, to: IssueStatus.TODO, daysAgo: started + 1.4 },
      { issueId: issue.id, from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, daysAgo: started },
      { issueId: issue.id, from: IssueStatus.IN_PROGRESS, to: IssueStatus.IN_REVIEW, daysAgo: completed + 0.8 },
      { issueId: issue.id, from: IssueStatus.IN_REVIEW, to: IssueStatus.DONE, daysAgo: completed },
    );
  }

  transitions.push(
    { issueId: web408.id, from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, daysAgo: 1 },
    { issueId: web402.id, from: IssueStatus.IN_PROGRESS, to: IssueStatus.IN_REVIEW, daysAgo: 3 },
    { issueId: web423.id, from: IssueStatus.TODO, to: IssueStatus.IN_PROGRESS, daysAgo: 3 },
  );

  const STATUS_TEXT: Record<string, string> = {
    TRIAGE: "Triage",
    TODO: "Todo",
    IN_PROGRESS: "In progress",
    IN_REVIEW: "In review",
    DONE: "Done",
  };

  await db.activity.createMany({
    data: transitions.map((t) => ({
      orgId: org.id,
      type: ActivityType.STATUS_CHANGED,
      message: `moved to ${STATUS_TEXT[t.to]}`,
      issueId: t.issueId,
      actorId: null,
      automatic: true,
      meta: { from: t.from, to: t.to },
      createdAt: ago(t.daysAgo),
    })),
  });

  await db.activity.createMany({
    data: [
      {
        orgId: org.id,
        type: ActivityType.PR_MERGED,
        message: "merged PR #412 → Done",
        actorId: mira.id,
        issueId: web402.id,
        automatic: true,
        createdAt: ago(0.008),
      },
      {
        orgId: org.id,
        type: ActivityType.BRANCH_PUSHED,
        message: "pushed fix/408-auth",
        actorId: dev.id,
        issueId: web408.id,
        automatic: true,
        createdAt: ago(0.028),
      },
      {
        orgId: org.id,
        type: ActivityType.COMMENTED,
        message: "commented on WEB-399",
        actorId: ana.id,
        issueId: web399.id,
        createdAt: ago(0.042),
      },
      {
        orgId: org.id,
        type: ActivityType.CI_FAILED,
        message: "CI failed on fix/408-auth",
        issueId: web408.id,
        automatic: true,
        meta: { check: "auth e2e" },
        createdAt: ago(0.05),
      },
      {
        orgId: org.id,
        type: ActivityType.SPRINT_STARTED,
        message: "Sprint 14 started",
        actorId: sam.id,
        createdAt: ago(3),
      },
    ],
  });

  /* ── Sam's inbox ────────────────────────────────────────── */

  await db.notification.createMany({
    data: [
      {
        userId: sam.id,
        kind: NotificationKind.BLOCKING,
        urgency: Urgency.BLOCKING,
        title: "Refactor auth middleware",
        detail: "WEB-419 blocked on this · Mira asked for an update",
        issueId: web408.id,
        createdAt: ago(0.08),
      },
      {
        userId: sam.id,
        kind: NotificationKind.REVIEW_REQUESTED,
        urgency: Urgency.BLOCKING,
        title: "Review PR #219 — pagination cursor",
        detail: "Requested by Dev · checks green",
        issueId: api77.id,
        createdAt: ago(0.2),
      },
      {
        userId: sam.id,
        kind: NotificationKind.ASSIGNED,
        urgency: Urgency.TODAY,
        title: "Session cookie flags for staging",
        detail: "WEB-409 · Sprint 14 · 2 pts",
        issueId: web409.id,
        createdAt: ago(0.5),
      },
      {
        userId: sam.id,
        kind: NotificationKind.MENTION,
        urgency: Urgency.TODAY,
        title: "Ana mentioned you on WEB-399",
        detail: "this also affects the backlog rows — worth a follow-up?",
        issueId: web399.id,
        createdAt: ago(0.04),
      },
      {
        userId: sam.id,
        kind: NotificationKind.CI_FAILED,
        urgency: Urgency.TODAY,
        title: "CI failed on fix/408-auth",
        detail: "auth e2e · 20m ago",
        issueId: web408.id,
        createdAt: ago(0.014),
      },
      {
        userId: sam.id,
        kind: NotificationKind.COMMENT,
        urgency: Urgency.LATER,
        title: "Multi-select on backlog rows",
        detail: "WEB-423 · next sprint",
        issueId: web423.id,
        createdAt: ago(1.2),
      },
      {
        userId: sam.id,
        kind: NotificationKind.SPRINT,
        urgency: Urgency.LATER,
        title: "Sprint 15 planning opens Monday",
        detail: "29 of 40 points already drafted",
        createdAt: ago(1.4),
      },
    ],
  });

  await db.milestone.createMany({
    data: [
      { orgId: org.id, name: "v2.0 launch", date: ahead(54), status: MilestoneStatus.ON_TRACK },
      { orgId: org.id, name: "Mobile beta", date: ahead(152), status: MilestoneStatus.ON_TRACK },
    ],
  });

  const issueCount = await db.issue.count();
  console.log(`✓ Seeded ${issueCount} issues across 3 projects`);
  console.log(`  Sign in: sam@acme.dev / ${PASSWORD}  (also mira@, dev@, ana@)`);
}

export { main as seed };

// Only self-run when invoked as a script; `seed-if-empty` imports it instead.
if (process.argv[1] && /seed\.ts$/.test(process.argv[1])) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}

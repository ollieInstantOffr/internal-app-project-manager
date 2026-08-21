import "server-only";
import { db } from "./db";
import { ActivityType, IssueStatus, PrState, RuleAction, RuleTrigger } from "./types";
import { logActivity, addWatcher, notifyCiFailed, watchersOf } from "./activity";
import { updateIssue } from "./issues";

/** The four rules every new org starts with — three on, CI comments off. */
export const DEFAULT_RULES = [
  {
    trigger: RuleTrigger.BRANCH_PUSHED,
    action: RuleAction.SET_IN_PROGRESS,
    label: "Branch `*WEB-123*` pushed → **In progress**",
    enabled: true,
    builtIn: true,
  },
  {
    trigger: RuleTrigger.PR_OPENED,
    action: RuleAction.SET_IN_REVIEW,
    label: "PR opened → **In review**, reviewers become watchers",
    enabled: true,
    builtIn: true,
  },
  {
    trigger: RuleTrigger.PR_MERGED,
    action: RuleAction.SET_DONE,
    label: "PR merged → **Done**, closes subtasks",
    enabled: true,
    builtIn: true,
  },
  {
    trigger: RuleTrigger.CI_FAILED,
    action: RuleAction.COMMENT_ON_ISSUE,
    label: "CI red → comment on the issue",
    enabled: false,
    builtIn: true,
  },
];

export async function seedDefaultRules(orgId: string) {
  const existing = await db.automationRule.count({ where: { orgId } });
  if (existing) return;
  await db.automationRule.createMany({ data: DEFAULT_RULES.map((r) => ({ ...r, orgId })) });
}

async function ruleEnabled(orgId: string, trigger: RuleTrigger) {
  const rules = await db.automationRule.findMany({ where: { orgId, trigger, enabled: true } });
  return rules;
}

/** Pulls every issue key mentioned in a branch name, PR title or commit message. */
export function extractIssueKeys(text: string): string[] {
  return [...text.toUpperCase().matchAll(/\b([A-Z][A-Z0-9]{1,5})-(\d+)\b/g)].map(
    (m) => `${m[1]}-${m[2]}`,
  );
}

async function issuesForKeys(orgId: string, keys: string[]) {
  if (!keys.length) return [];
  return db.issue.findMany({
    where: { project: { orgId }, key: { in: keys } },
    include: { project: true, assignee: { select: { id: true, email: true } } },
  });
}

/* ── branch pushed ─────────────────────────────────────────── */

export async function handleBranchPush(opts: {
  orgId: string;
  repo: string;
  branch: string;
  commits?: number;
  actorId?: string | null;
  actorLogin?: string | null;
}) {
  const keys = extractIssueKeys(opts.branch);
  const issues = await issuesForKeys(opts.orgId, keys);
  const rules = await ruleEnabled(opts.orgId, RuleTrigger.BRANCH_PUSHED);
  const touched: string[] = [];

  for (const issue of issues) {
    await db.gitBranch.upsert({
      where: { repo_name: { repo: opts.repo, name: opts.branch } },
      create: {
        repo: opts.repo,
        name: opts.branch,
        issueId: issue.id,
        commits: opts.commits ?? 1,
        ahead: opts.commits ?? 1,
      },
      update: { commits: { increment: opts.commits ?? 1 }, ahead: { increment: opts.commits ?? 1 } },
    });

    await logActivity({
      orgId: opts.orgId,
      type: ActivityType.BRANCH_PUSHED,
      message: `pushed ${opts.branch}`,
      issueId: issue.id,
      actorId: opts.actorId ?? null,
      automatic: true,
      meta: { branch: opts.branch, repo: opts.repo },
    });

    for (const rule of rules) {
      if (rule.action === RuleAction.SET_IN_PROGRESS && issue.status !== IssueStatus.DONE) {
        await updateIssue({
          orgId: opts.orgId,
          issueId: issue.id,
          actorId: opts.actorId ?? null,
          patch: { status: IssueStatus.IN_PROGRESS },
          automatic: true,
        });
      }
      if (rule.action === RuleAction.ASSIGN_TO_ACTOR && opts.actorId && !issue.assigneeId) {
        await updateIssue({
          orgId: opts.orgId,
          issueId: issue.id,
          actorId: opts.actorId,
          patch: { assigneeId: opts.actorId },
          automatic: true,
        });
      }
    }
    touched.push(issue.key);
  }

  return touched;
}

/* ── pull requests ─────────────────────────────────────────── */

export async function handlePullRequest(opts: {
  orgId: string;
  repo: string;
  number: number;
  title: string;
  branch: string;
  url?: string | null;
  state: PrState;
  draft?: boolean;
  approvals?: number;
  reviewerIds?: string[];
  actorId?: string | null;
}) {
  const keys = [...extractIssueKeys(opts.branch), ...extractIssueKeys(opts.title)];
  const issues = await issuesForKeys(opts.orgId, [...new Set(keys)]);
  const touched: string[] = [];

  for (const issue of issues) {
    const state = opts.draft && opts.state === PrState.OPEN ? PrState.DRAFT : opts.state;

    await db.pullRequest.upsert({
      where: { repo_number: { repo: opts.repo, number: opts.number } },
      create: {
        repo: opts.repo,
        number: opts.number,
        title: opts.title,
        url: opts.url ?? null,
        branch: opts.branch,
        state,
        approvals: opts.approvals ?? 0,
        issueId: issue.id,
        mergedAt: state === PrState.MERGED ? new Date() : null,
      },
      update: {
        title: opts.title,
        state,
        approvals: opts.approvals ?? undefined,
        mergedAt: state === PrState.MERGED ? new Date() : null,
      },
    });

    if (state === PrState.MERGED) {
      const rules = await ruleEnabled(opts.orgId, RuleTrigger.PR_MERGED);
      await logActivity({
        orgId: opts.orgId,
        type: ActivityType.PR_MERGED,
        message: `merged PR #${opts.number}`,
        issueId: issue.id,
        actorId: opts.actorId ?? null,
        automatic: true,
        meta: { pr: opts.number, repo: opts.repo },
      });
      for (const rule of rules) {
        if (rule.action === RuleAction.SET_DONE) {
          await updateIssue({
            orgId: opts.orgId,
            issueId: issue.id,
            actorId: opts.actorId ?? null,
            patch: { status: IssueStatus.DONE },
            automatic: true,
          });
          // merging closes the checklist too
          await db.subtask.updateMany({
            where: { issueId: issue.id, done: false },
            data: { done: true, completedAt: new Date() },
          });
        }
      }
    } else if (state === PrState.OPEN || state === PrState.DRAFT) {
      const rules = await ruleEnabled(opts.orgId, RuleTrigger.PR_OPENED);
      await logActivity({
        orgId: opts.orgId,
        type: ActivityType.PR_OPENED,
        message: `opened PR #${opts.number}`,
        issueId: issue.id,
        actorId: opts.actorId ?? null,
        automatic: true,
        meta: { pr: opts.number, repo: opts.repo, draft: !!opts.draft },
      });
      for (const rule of rules) {
        if (rule.action === RuleAction.SET_IN_REVIEW && !opts.draft) {
          await updateIssue({
            orgId: opts.orgId,
            issueId: issue.id,
            actorId: opts.actorId ?? null,
            patch: { status: IssueStatus.IN_REVIEW },
            automatic: true,
          });
        }
        if (
          rule.action === RuleAction.SET_IN_REVIEW ||
          rule.action === RuleAction.ADD_WATCHERS
        ) {
          for (const reviewerId of opts.reviewerIds ?? []) {
            await addWatcher(issue.id, reviewerId);
          }
        }
      }
    }
    touched.push(issue.key);
  }

  return touched;
}

/* ── CI ────────────────────────────────────────────────────── */

export async function handleCheckRun(opts: {
  orgId: string;
  repo: string;
  branch: string;
  name: string;
  passed: boolean;
}) {
  const keys = extractIssueKeys(opts.branch);
  const issues = await issuesForKeys(opts.orgId, keys);
  const touched: string[] = [];

  for (const issue of issues) {
    const pr = await db.pullRequest.findFirst({
      where: { issueId: issue.id, branch: opts.branch },
      orderBy: { createdAt: "desc" },
    });
    if (pr) {
      await db.pullRequest.update({
        where: { id: pr.id },
        data: opts.passed
          ? { checksPassed: { increment: 1 } }
          : { checksFailed: { increment: 1 } },
      });
    }

    if (opts.passed) {
      touched.push(issue.key);
      continue;
    }

    await logActivity({
      orgId: opts.orgId,
      type: ActivityType.CI_FAILED,
      message: `CI failed on ${opts.branch}`,
      issueId: issue.id,
      automatic: true,
      meta: { check: opts.name, branch: opts.branch },
    });

    const rules = await ruleEnabled(opts.orgId, RuleTrigger.CI_FAILED);
    for (const rule of rules) {
      if (rule.action === RuleAction.COMMENT_ON_ISSUE) {
        await db.comment.create({
          data: {
            issueId: issue.id,
            body: `CI failed on \`${opts.branch}\` — **${opts.name}**.`,
            automated: true,
          },
        });
      }
    }

    for (const user of await watchersOf(issue.id)) {
      await notifyCiFailed({
        user,
        issueId: issue.id,
        issueKey: issue.key,
        branch: opts.branch,
        detail: opts.name,
      });
    }
    touched.push(issue.key);
  }

  return touched;
}

import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { PrState, Role } from "@/lib/types";
import { handleBranchPush, handlePullRequest, handleCheckRun } from "@/lib/automation";

const schema = z.object({
  issueKey: z.string().min(1),
  event: z.enum(["push", "pr-open", "pr-merge", "ci-fail", "ci-pass"]),
});

/**
 * Fires the same automation path a real GitHub delivery would, against an issue
 * you name. Lets a team see the rules work before wiring the webhook up.
 */
export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { issueKey, event } = await parseBody(req, schema);

  const issue = await issueInOrg(ctx.orgId, issueKey);
  const project = await db.project.findUniqueOrThrow({ where: { id: issue.projectId } });
  const repo = project.repoFullName ?? `${project.key.toLowerCase()}/local`;
  const branch = `feat/${issue.number}-${issue.key.toLowerCase()}`;

  if (event === "push") {
    return json({ ok: true, touched: await handleBranchPush({ orgId: ctx.orgId, repo, branch, commits: 1, actorId: ctx.userId }) });
  }

  if (event === "pr-open" || event === "pr-merge") {
    const existing = await db.pullRequest.findFirst({ where: { issueId: issue.id } });
    const number = existing?.number ?? Math.floor(400 + Math.random() * 200);
    return json({
      ok: true,
      touched: await handlePullRequest({
        orgId: ctx.orgId,
        repo,
        number,
        title: `${issue.key} ${issue.title}`,
        branch,
        state: event === "pr-merge" ? PrState.MERGED : PrState.OPEN,
        actorId: ctx.userId,
      }),
    });
  }

  if (event === "ci-fail" || event === "ci-pass") {
    const known = await db.gitBranch.findFirst({ where: { issueId: issue.id } });
    if (!known) return fail(409, "Push a branch for this issue first");
    return json({
      ok: true,
      touched: await handleCheckRun({
        orgId: ctx.orgId,
        repo,
        branch: known.name,
        name: "auth e2e",
        passed: event === "ci-pass",
      }),
    });
  }

  return fail(400, "Unknown event");
});

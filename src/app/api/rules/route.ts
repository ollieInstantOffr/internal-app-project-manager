import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { ruleSchema } from "@/lib/validators";
import { Role } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  SET_IN_PROGRESS: "**In progress**",
  SET_IN_REVIEW: "**In review**",
  SET_DONE: "**Done**",
  COMMENT_ON_ISSUE: "comment on the issue",
  ADD_WATCHERS: "add reviewers as watchers",
  ASSIGN_TO_ACTOR: "assign to whoever pushed",
};

const TRIGGER_LABEL: Record<string, string> = {
  BRANCH_PUSHED: "Branch `*WEB-123*` pushed",
  PR_OPENED: "PR opened",
  PR_MERGED: "PR merged",
  CI_FAILED: "CI red",
  ISSUE_CREATED: "Issue created",
};

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const rules = await db.automationRule.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "asc" },
  });
  return json({ rules });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const body = await parseBody(req, ruleSchema);

  const rule = await db.automationRule.create({
    data: {
      orgId: ctx.orgId,
      trigger: body.trigger,
      action: body.action,
      enabled: body.enabled ?? true,
      label:
        body.label ||
        `${TRIGGER_LABEL[body.trigger] ?? body.trigger} → ${ACTION_LABEL[body.action] ?? body.action}`,
    },
  });

  return json({ ok: true, rule }, { status: 201 });
});

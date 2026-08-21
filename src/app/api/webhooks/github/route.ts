import crypto from "node:crypto";
import { db } from "@/lib/db";
import { json, fail } from "@/lib/api";
import { PrState } from "@/lib/types";
import { handleBranchPush, handlePullRequest, handleCheckRun } from "@/lib/automation";

/** Constant-time HMAC check against GITHUB_WEBHOOK_SECRET. */
function verify(raw: string, signature: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Maps a repo back to the org that linked it. */
async function orgForRepo(fullName: string) {
  const project = await db.project.findFirst({
    where: { repoFullName: fullName },
    select: { orgId: true },
  });
  return project?.orgId ?? null;
}

async function userForLogin(login: string | undefined, orgId: string) {
  if (!login) return null;
  const user = await db.user.findFirst({
    where: { githubLogin: login, memberships: { some: { orgId } } },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const event = req.headers.get("x-github-event");

  if (!process.env.GITHUB_WEBHOOK_SECRET) {
    return fail(503, "Webhooks are not configured on this deployment");
  }
  if (!verify(raw, signature)) return fail(401, "Bad signature");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail(400, "Malformed payload");
  }

  const repo = (payload.repository as { full_name?: string } | undefined)?.full_name;
  if (!repo) return json({ ok: true, ignored: "no repository" });

  const orgId = await orgForRepo(repo);
  if (!orgId) return json({ ok: true, ignored: "repo not linked to a project" });

  try {
    if (event === "push") {
      const ref = String(payload.ref ?? "");
      if (!ref.startsWith("refs/heads/")) return json({ ok: true, ignored: "not a branch" });
      const branch = ref.slice("refs/heads/".length);
      const commits = Array.isArray(payload.commits) ? payload.commits.length : 1;
      const login = (payload.sender as { login?: string } | undefined)?.login;

      const touched = await handleBranchPush({
        orgId,
        repo,
        branch,
        commits,
        actorId: await userForLogin(login, orgId),
        actorLogin: login ?? null,
      });
      return json({ ok: true, touched });
    }

    if (event === "pull_request") {
      const action = String(payload.action ?? "");
      const pr = payload.pull_request as {
        number: number;
        title: string;
        html_url?: string;
        draft?: boolean;
        merged?: boolean;
        state?: string;
        head?: { ref?: string };
        requested_reviewers?: { login: string }[];
      };
      if (!pr) return json({ ok: true, ignored: "no pull_request" });

      const state = pr.merged
        ? PrState.MERGED
        : pr.state === "closed"
          ? PrState.CLOSED
          : pr.draft
            ? PrState.DRAFT
            : PrState.OPEN;

      if (!["opened", "reopened", "ready_for_review", "closed", "edited", "synchronize"].includes(action)) {
        return json({ ok: true, ignored: action });
      }

      const reviewerIds = (
        await Promise.all((pr.requested_reviewers ?? []).map((r) => userForLogin(r.login, orgId)))
      ).filter(Boolean) as string[];

      const login = (payload.sender as { login?: string } | undefined)?.login;

      const touched = await handlePullRequest({
        orgId,
        repo,
        number: pr.number,
        title: pr.title,
        branch: pr.head?.ref ?? "",
        url: pr.html_url ?? null,
        state,
        draft: pr.draft,
        reviewerIds,
        actorId: await userForLogin(login, orgId),
      });
      return json({ ok: true, touched });
    }

    if (event === "check_run" || event === "workflow_run") {
      const run = (payload.check_run ?? payload.workflow_run) as {
        name?: string;
        conclusion?: string;
        status?: string;
        head_branch?: string;
        check_suite?: { head_branch?: string };
      };
      if (!run || run.status !== "completed") return json({ ok: true, ignored: "still running" });

      const branch = run.head_branch ?? run.check_suite?.head_branch ?? "";
      if (!branch) return json({ ok: true, ignored: "no branch" });

      const touched = await handleCheckRun({
        orgId,
        repo,
        branch,
        name: run.name ?? "checks",
        passed: run.conclusion === "success",
      });
      return json({ ok: true, touched });
    }

    return json({ ok: true, ignored: event });
  } catch (err) {
    console.error("[webhook:github]", err);
    return fail(500, "Webhook handling failed");
  }
}

import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { issueFromFailureSchema } from "@/lib/api-console/validators";
import { createIssue } from "@/lib/issues";
import { IssueStatus, Priority } from "@/lib/types";
import type { AssertionResult } from "@/lib/api-console/assertions";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Turns one failed result into an issue, with the exact request and response
 * attached so it can be reproduced without guesswork.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;

  const result = await db.apiRunResult.findFirst({
    where: { id, run: { project: { orgId: ctx.orgId } } },
    include: { run: { include: { environment: true, project: true } } },
  });
  if (!result) return fail(404, "Result not found");
  if (result.issueId) return fail(409, "An issue was already created from this failure");

  const body = await parseBody(req, issueFromFailureSchema);
  const failures = ((result.assertions as AssertionResult[] | null) ?? []).filter((a) => !a.ok);

  const title =
    body.title ??
    (failures[0]
      ? `${result.method} ${pathOf(result.url)} — ${failures[0].source}`
      : `${result.method} ${pathOf(result.url)} failed`);

  const description = [
    failures.length
      ? `Failing assertion${failures.length === 1 ? "" : "s"}:`
      : "The request errored:",
    ...(failures.length
      ? failures.map((f) => `- \`${f.source}\` — ${f.detail}`)
      : [`- ${result.error ?? "no response"}`]),
    "",
    "**Request**",
    "```http",
    `${result.method} ${result.url}`,
    result.requestBody ? `\n${result.requestBody}` : "",
    "```",
    "",
    "**Response**",
    "```http",
    `${result.status ?? "—"} ${result.statusText ?? ""} · ${result.durationMs}ms`,
    truncate(result.responseBody ?? result.error ?? "", 4000),
    "```",
    "",
    `_Captured from the API console against **${result.run.environment?.name ?? "an environment"}**._`,
  ].join("\n");

  const issue = await createIssue({
    orgId: ctx.orgId,
    projectId: result.run.projectId,
    actorId: ctx.userId,
    title: title.slice(0, 300),
    description,
    status: IssueStatus.TRIAGE,
    priority: Priority.HIGH,
    assigneeId: body.assigneeId ?? null,
    epicId: body.epicId ?? null,
    sprintId: body.sprintId ?? null,
    labelIds: body.labelIds,
  });

  await db.apiRunResult.update({ where: { id }, data: { issueId: issue.id } });

  return json({ ok: true, issue: { key: issue.key, title: issue.title } }, { status: 201 });
});

function pathOf(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}\n… truncated` : value;
}

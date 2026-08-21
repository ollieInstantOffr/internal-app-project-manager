import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { requireRepoProject } from "@/lib/repo";
import { createIssue } from "@/lib/issues";
import { IssueStatus } from "@/lib/types";

type Ctx = { params: Promise<{ key: string }> };

const schema = z.object({
  path: z.string().min(1).max(500),
  ref: z.string().max(200).optional(),
  startLine: z.number().int().positive().optional().nullable(),
  endLine: z.number().int().positive().optional().nullable(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).optional().nullable(),
  epicId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  /** Attach the range to an existing issue instead of creating one. */
  issueKey: z.string().optional().nullable(),
});

/**
 * Opens an issue against an exact range of lines, or attaches that range to an
 * existing issue. The range is stored, so it survives the file being edited.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const { project, repo } = await requireRepoProject(ctx.orgId, key, ctx.userId);
  const body = await parseBody(req, schema);

  const range =
    body.startLine && body.endLine
      ? `lines ${body.startLine}–${body.endLine}`
      : body.startLine
        ? `line ${body.startLine}`
        : null;

  if (body.issueKey) {
    const existing = await db.issue.findFirst({
      where: { key: body.issueKey.toUpperCase(), project: { orgId: ctx.orgId } },
    });
    if (!existing) return fail(404, `${body.issueKey} not found`);

    await db.issueFileRef.create({
      data: {
        repo,
        path: body.path,
        startLine: body.startLine ?? null,
        endLine: body.endLine ?? null,
        ref: body.ref ?? null,
        issueId: existing.id,
      },
    });
    return json({ ok: true, issue: { key: existing.key, title: existing.title } });
  }

  const description = [
    body.description?.trim(),
    `Opened from \`${body.path}\`${range ? ` · ${range}` : ""}${body.ref ? ` on \`${body.ref}\`` : ""}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const issue = await createIssue({
    orgId: ctx.orgId,
    projectId: project.id,
    actorId: ctx.userId,
    title: body.title,
    description,
    status: IssueStatus.TRIAGE,
    assigneeId: body.assigneeId ?? null,
    epicId: body.epicId ?? null,
  });

  await db.issueFileRef.create({
    data: {
      repo,
      path: body.path,
      startLine: body.startLine ?? null,
      endLine: body.endLine ?? null,
      ref: body.ref ?? null,
      issueId: issue.id,
    },
  });

  return json({ ok: true, issue: { key: issue.key, title: issue.title } }, { status: 201 });
});

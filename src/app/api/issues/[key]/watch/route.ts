import { db } from "@/lib/db";
import { handler, json, requireApiContext, issueInOrg } from "@/lib/api";
import { addWatcher } from "@/lib/activity";

type Ctx = { params: Promise<{ key: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);
  await addWatcher(issue.id, ctx.userId);
  return json({ ok: true, watching: true });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const issue = await issueInOrg(ctx.orgId, key);
  await db.watcher.deleteMany({ where: { issueId: issue.id, userId: ctx.userId } });
  return json({ ok: true, watching: false });
});

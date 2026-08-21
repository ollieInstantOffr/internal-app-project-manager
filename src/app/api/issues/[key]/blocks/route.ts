import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext, issueInOrg } from "@/lib/api";
import { blockSchema } from "@/lib/validators";
import { ActivityType } from "@/lib/types";
import { logActivity } from "@/lib/activity";
import { refreshBlockingNotifications } from "@/lib/issues";

type Ctx = { params: Promise<{ key: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const blocker = await issueInOrg(ctx.orgId, key);
  const { blockedKey } = await parseBody(req, blockSchema);
  const blocked = await issueInOrg(ctx.orgId, blockedKey);

  if (blocker.id === blocked.id) return fail(400, "An issue can't block itself");

  const cycle = await db.issueLink.findFirst({
    where: { blockerId: blocked.id, blockedId: blocker.id },
  });
  if (cycle) return fail(409, `${blockedKey} already blocks ${blocker.key}`);

  await db.issueLink.upsert({
    where: { blockerId_blockedId: { blockerId: blocker.id, blockedId: blocked.id } },
    create: { blockerId: blocker.id, blockedId: blocked.id },
    update: {},
  });

  await logActivity({
    orgId: ctx.orgId,
    type: ActivityType.BLOCKED,
    message: `${blocker.key} now blocks ${blocked.key}`,
    issueId: blocker.id,
    actorId: ctx.userId,
  });
  await refreshBlockingNotifications(blocker.id);

  return json({ ok: true });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const blocker = await issueInOrg(ctx.orgId, key);
  const { blockedKey } = await parseBody(req, blockSchema);
  const blocked = await issueInOrg(ctx.orgId, blockedKey);

  await db.issueLink.deleteMany({ where: { blockerId: blocker.id, blockedId: blocked.id } });
  await refreshBlockingNotifications(blocker.id);

  return json({ ok: true });
});

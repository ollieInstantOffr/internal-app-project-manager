import { db } from "@/lib/db";
import { handler, json, parseBody, fail } from "@/lib/api";
import { roadmapSubscribeSchema } from "@/lib/validators";
import { randomToken, sha256 } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { roadmapConfirmTemplate } from "@/lib/email/templates";
import { appUrl } from "@/lib/app-url";
import { notify } from "@/lib/activity";
import { NotificationKind, Urgency } from "@/lib/types";

const MAX_PER_WINDOW = 20;
const WINDOW_MINUTES = 60;

/**
 * Public and unauthenticated, so it says the same thing whatever happens: an
 * attacker must not be able to use it to learn whether an address is subscribed.
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ pageId: string }> }) => {
  const { pageId } = await params;
  const body = await parseBody(req, roadmapSubscribeSchema);

  const page = await db.roadmapPage.findFirst({
    where: { id: pageId, enabled: true },
    include: { project: { select: { id: true, name: true, orgId: true } } },
  });
  if (!page) return fail(404, "That roadmap isn't published");

  const recent = await db.roadmapSubscriber.count({
    where: { pageId, createdAt: { gt: new Date(Date.now() - WINDOW_MINUTES * 60_000) } },
  });
  if (recent >= MAX_PER_WINDOW) return json({ ok: true });

  // "Tell us what's missing" — goes to the team as a notification, not an inbox.
  if (body.message) {
    await db.roadmapRequest.create({
      data: { pageId, email: body.email, body: body.message },
    });

    const admins = await db.membership.findMany({
      where: { orgId: page.project.orgId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    await Promise.all(
      admins.map((m) =>
        notify({
          userId: m.userId,
          kind: NotificationKind.COMMENT,
          urgency: Urgency.LATER,
          title: `Roadmap request for ${page.project.name}`,
          detail: body.message!.slice(0, 160),
        }),
      ),
    );

    if (!page.showSubscribe) return json({ ok: true });
  }

  const existing = await db.roadmapSubscriber.findUnique({
    where: { pageId_email: { pageId, email: body.email } },
  });
  if (existing?.confirmedAt && !existing.unsubscribedAt) return json({ ok: true });

  const token = randomToken();
  await db.roadmapSubscriber.upsert({
    where: { pageId_email: { pageId, email: body.email } },
    create: { pageId, email: body.email, tokenHash: sha256(token) },
    update: { tokenHash: sha256(token), unsubscribedAt: null },
  });

  const org = await db.organization.findUniqueOrThrow({
    where: { id: page.project.orgId },
    select: { name: true },
  });

  const tpl = roadmapConfirmTemplate({
    orgName: org.name,
    projectName: page.project.name,
    confirmUrl: appUrl(`/r/subscribe/confirm?token=${token}`),
  });
  await sendMail({ to: body.email, ...tpl });

  return json({ ok: true });
});

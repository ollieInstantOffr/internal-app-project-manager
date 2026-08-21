import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { inviteSchema } from "@/lib/validators";
import { randomToken } from "@/lib/auth";
import { Role } from "@/lib/types";
import { sendMail } from "@/lib/mail";
import { inviteTemplate } from "@/lib/email/templates";
import { ROLE_LABEL } from "@/lib/constants";

const INVITE_DAYS = 14;

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const invites = await db.invite.findMany({
    where: { orgId: ctx.orgId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
    include: { invitedBy: { select: { name: true } } },
  });
  return json({ invites });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { emails, role } = await parseBody(req, inviteSchema);

  const [org, inviter] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
    db.user.findUniqueOrThrow({ where: { id: ctx.userId } }),
  ]);

  const existingMembers = await db.user.findMany({
    where: { email: { in: emails }, memberships: { some: { orgId: ctx.orgId } } },
    select: { email: true },
  });
  const alreadyIn = new Set(existingMembers.map((m) => m.email));

  const sent: string[] = [];
  const skipped: string[] = [];

  for (const email of emails) {
    if (alreadyIn.has(email)) {
      skipped.push(email);
      continue;
    }

    const token = randomToken();
    await db.invite.upsert({
      where: { orgId_email: { orgId: ctx.orgId, email } },
      create: {
        orgId: ctx.orgId,
        email,
        role,
        token,
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      },
      update: {
        role,
        token,
        invitedById: ctx.userId,
        acceptedAt: null,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      },
    });

    await sendMail({
      to: email,
      replyTo: inviter.email,
      ...inviteTemplate({
        orgName: org.name,
        inviterName: inviter.name,
        role: ROLE_LABEL[role],
        token,
      }),
    });
    sent.push(email);
  }

  return json({ ok: true, sent, skipped });
});

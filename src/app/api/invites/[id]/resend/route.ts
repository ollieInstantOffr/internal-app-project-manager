import { db } from "@/lib/db";
import { handler, json, fail, requireApiContext } from "@/lib/api";
import { randomToken } from "@/lib/auth";
import { Role } from "@/lib/types";
import { sendMail } from "@/lib/mail";
import { inviteTemplate } from "@/lib/email/templates";
import { ROLE_LABEL } from "@/lib/constants";

export const POST = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireApiContext(req, Role.ADMIN);
    const { id } = await params;

    const invite = await db.invite.findFirst({
      where: { id, orgId: ctx.orgId },
      include: { org: true },
    });
    if (!invite) return fail(404, "Invite not found");

    const token = randomToken();
    await db.invite.update({
      where: { id },
      data: { token, expiresAt: new Date(Date.now() + 14 * 864e5), invitedById: ctx.userId },
    });

    const inviter = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    await sendMail({
      to: invite.email,
      replyTo: inviter.email,
      ...inviteTemplate({
        orgName: invite.org.name,
        inviterName: inviter.name,
        role: ROLE_LABEL[invite.role],
        token,
      }),
    });

    return json({ ok: true });
  },
);

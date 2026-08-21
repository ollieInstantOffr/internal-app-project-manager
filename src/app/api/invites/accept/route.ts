import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody } from "@/lib/api";
import { requireUser, setActiveOrg } from "@/lib/auth";
import { ActivityType } from "@/lib/types";
import { logActivity } from "@/lib/activity";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { token } = await parseBody(req, z.object({ token: z.string().min(1) }));

  const invite = await db.invite.findUnique({ where: { token }, include: { org: true } });
  if (!invite) return fail(404, "That invite link isn't valid");
  if (invite.acceptedAt) return fail(409, "That invite was already used");
  if (invite.expiresAt < new Date()) return fail(410, "That invite has expired");
  if (invite.email !== user.email) {
    return fail(403, `That invite was sent to ${invite.email} — sign in with that address`);
  }

  await db.membership.upsert({
    where: { userId_orgId: { userId: user.id, orgId: invite.orgId } },
    create: { userId: user.id, orgId: invite.orgId, role: invite.role },
    update: {},
  });
  await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  await setActiveOrg(invite.orgId);

  await logActivity({
    orgId: invite.orgId,
    type: ActivityType.MEMBER_JOINED,
    message: `joined ${invite.org.name}`,
    actorId: user.id,
  });

  // Invited teammates skip onboarding — straight to a board if there is one.
  const project = await db.project.findFirst({
    where: { orgId: invite.orgId, archived: false },
    orderBy: { createdAt: "asc" },
  });

  return json({ ok: true, next: project ? `/projects/${project.key}/board` : "/home" });
});

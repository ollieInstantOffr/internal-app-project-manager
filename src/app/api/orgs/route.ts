import { db } from "@/lib/db";
import { handler, json, parseBody, fail } from "@/lib/api";
import { orgSchema } from "@/lib/validators";
import { requireUser, setActiveOrg } from "@/lib/auth";
import { seedDefaultRules } from "@/lib/automation";
import { ActivityType, Role } from "@/lib/types";
import { logActivity } from "@/lib/activity";

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { name, slug, githubOrg } = await parseBody(req, orgSchema);

  const taken = await db.organization.findUnique({ where: { slug } });
  if (taken) return fail(409, "That workspace URL is taken");

  const org = await db.organization.create({
    data: {
      name,
      slug,
      githubOrg: githubOrg || null,
      members: { create: { userId: user.id, role: Role.OWNER } },
      integrations: user.githubToken
        ? { create: { provider: "github", connected: true, account: githubOrg || user.githubLogin } }
        : undefined,
    },
  });

  await seedDefaultRules(org.id);
  await setActiveOrg(org.id);
  await logActivity({
    orgId: org.id,
    type: ActivityType.MEMBER_JOINED,
    message: `created ${org.name}`,
    actorId: user.id,
  });

  return json({ ok: true, org: { id: org.id, name: org.name, slug: org.slug } });
});

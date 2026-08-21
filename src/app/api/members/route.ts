import { db } from "@/lib/db";
import { handler, json, requireApiContext } from "@/lib/api";
import { IssueStatus } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);

  const memberships = await db.membership.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarHue: true,
          githubLogin: true,
          emailVerified: true,
          teamMembers: { include: { team: true } },
        },
      },
    },
  });

  const counts = await db.issue.groupBy({
    by: ["assigneeId"],
    where: {
      project: { orgId: ctx.orgId },
      archivedAt: null,
      status: { not: IssueStatus.DONE },
      assigneeId: { not: null },
    },
    _count: { _all: true },
  });
  const openBy = new Map(counts.map((c) => [c.assigneeId!, c._count._all]));

  return json({
    members: memberships.map((m) => ({
      id: m.user.id,
      membershipId: m.id,
      name: m.user.name,
      email: m.user.email,
      avatarHue: m.user.avatarHue,
      githubLogin: m.user.githubLogin,
      verified: !!m.user.emailVerified,
      role: m.role,
      teams: m.user.teamMembers
        .filter((t) => t.team.orgId === ctx.orgId)
        .map((t) => ({ id: t.team.id, name: t.team.name })),
      openIssues: openBy.get(m.user.id) ?? 0,
    })),
  });
});

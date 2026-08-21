import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { IssueStatus } from "@/lib/types";
import { Members } from "@/components/settings/Members";
import { appUrl } from "@/lib/app-url";
import { focusingMembers } from "@/lib/focus";

export const metadata = { title: "Members · Arc" };
export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { org, user } = await requireOrg();
  const { invite } = await searchParams;

  const [memberships, invites, teams, counts, focusing] = await Promise.all([
    db.membership.findMany({
      where: { orgId: org.id },
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
    }),
    db.invite.findMany({
      where: { orgId: org.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { invitedBy: { select: { name: true } } },
    }),
    db.team.findMany({
      where: { orgId: org.id },
      orderBy: { name: "asc" },
      include: { members: { include: { user: { select: { id: true, name: true, avatarHue: true } } } } },
    }),
    db.issue.groupBy({
      by: ["assigneeId"],
      where: {
        project: { orgId: org.id },
        archivedAt: null,
        status: { not: IssueStatus.DONE },
        assigneeId: { not: null },
      },
      _count: { _all: true },
    }),
    focusingMembers(org.id, user.id),
  ]);

  const openBy = new Map(counts.map((c) => [c.assigneeId!, c._count._all]));

  return (
    <Members
      openInvite={invite === "1"}
      inviteLinkBase={appUrl("/settings/members")}
      members={memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarHue: m.user.avatarHue,
        githubLogin: m.user.githubLogin,
        verified: !!m.user.emailVerified,
        role: m.role,
        teams: m.user.teamMembers
          .filter((t) => t.team.orgId === org.id)
          .map((t) => ({ id: t.team.id, name: t.team.name })),
        openIssues: openBy.get(m.user.id) ?? 0,
        focusing: focusing.has(m.user.id),
      }))}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        createdAt: i.createdAt.toISOString(),
        invitedBy: i.invitedBy?.name ?? null,
      }))}
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        members: t.members.map((m) => m.user),
      }))}
    />
  );
}

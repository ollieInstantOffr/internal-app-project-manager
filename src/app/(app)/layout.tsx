import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";
import type { ShellData } from "@/components/shell/context";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, role } = await requireOrg();

  const [projects, memberships, inboxCount, projectCount] = await Promise.all([
    db.project.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, key: true, name: true, color: true },
    }),
    db.membership.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true, avatarHue: true } } },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null, archivedAt: null } }),
    db.project.count({ where: { orgId: org.id } }),
  ]);

  if (projectCount === 0) redirect("/onboarding/project");

  const data: ShellData = {
    org: { id: org.id, name: org.name, slug: org.slug },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarHue: user.avatarHue,
      emailVerified: !!user.emailVerified,
    },
    role,
    projects,
    members: memberships.map((m) => ({ ...m.user, role: m.role })),
    inboxCount,
  };

  return <AppShell data={data}>{children}</AppShell>;
}

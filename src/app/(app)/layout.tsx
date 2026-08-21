import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell, type FocusBoot } from "@/components/shell/AppShell";
import { currentSession, prefsFor, serializeSession, todayStats } from "@/lib/focus";
import type { ShellData } from "@/components/shell/context";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, org, role } = await requireOrg();

  const [
    projects,
    memberships,
    inboxCount,
    projectCount,
    taskCount,
    taskLists,
    focusSession,
    focusToday,
    focusPrefs,
  ] = await Promise.all([
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
      // Anything sitting with me and still open — the badge next to "Tasks".
      db.task.count({ where: { ownerId: user.id, orgId: org.id, status: "OPEN" } }),
      db.taskList.findMany({
        where: { ownerId: user.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { tasks: { where: { status: "OPEN" } } } },
        },
      }),
      // The timer lives in the chrome, so the shell boots it, not the page.
      currentSession(user.id),
      todayStats(user.id),
      prefsFor(user.id),
    ]);

  if (projectCount === 0) redirect("/onboarding/project");

  const focus: FocusBoot = {
    session: serializeSession(focusSession),
    today: focusToday,
    prefs: {
      lastLengthMinutes: focusPrefs.lastLengthMinutes,
      pauseNotifications: focusPrefs.pauseNotifications,
      suggestBreak: focusPrefs.suggestBreak,
      shareBadge: focusPrefs.shareBadge,
    },
  };

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
    taskCount,
    taskLists: taskLists.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      count: l._count.tasks,
    })),
  };

  return (
    <AppShell data={data} focus={focus}>
      {children}
    </AppShell>
  );
}

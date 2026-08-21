import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { IssueStatus, PrState, SprintStatus } from "@/lib/types";
import { accent } from "@/lib/constants";
import { Avatar, AvatarStack, Bar } from "@/components/ui";
import { NewIssueButton } from "@/components/NewIssueButton";
import { relativeTime, daysLeft, pct } from "@/lib/format";

export const metadata = { title: "Home · Arc" };
export const dynamic = "force-dynamic";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const { org, user } = await requireOrg();
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(24, 0, 0, 0);

  const [
    projects,
    assigned,
    dueToday,
    blockingLinks,
    prsWaiting,
    activities,
    activeSprints,
    memberships,
  ] = await Promise.all([
      db.project.findMany({
        where: { orgId: org.id, archived: false },
        orderBy: { createdAt: "asc" },
        include: {
          issues: {
            where: { archivedAt: null },
            select: { id: true, status: true, estimate: true, assigneeId: true },
          },
          sprints: {
            where: { status: SprintStatus.ACTIVE },
            take: 1,
            include: { issues: { select: { status: true, estimate: true } } },
          },
        },
      }),
      db.issue.count({
        where: {
          project: { orgId: org.id },
          assigneeId: user.id,
          archivedAt: null,
          status: { not: IssueStatus.DONE },
        },
      }),
      db.issue.count({
        where: {
          project: { orgId: org.id },
          assigneeId: user.id,
          archivedAt: null,
          status: { not: IssueStatus.DONE },
          dueDate: { lt: startOfTomorrow },
        },
      }),
      db.issueLink.findMany({
        where: {
          blocker: {
            assigneeId: user.id,
            archivedAt: null,
            status: { not: IssueStatus.DONE },
            project: { orgId: org.id },
          },
          blocked: { status: { not: IssueStatus.DONE } },
        },
        include: { blocker: { select: { key: true } } },
      }),
      db.pullRequest.findMany({
        where: {
          state: { in: [PrState.OPEN, PrState.DRAFT] },
          issue: { project: { orgId: org.id }, watchers: { some: { userId: user.id } } },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true },
      }),
      db.activity.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          actor: { select: { id: true, name: true, avatarHue: true } },
          issue: { select: { key: true } },
        },
      }),
      // Every running sprint, not an arbitrary one — an org can have several.
      db.sprint.findMany({
        where: { project: { orgId: org.id }, status: SprintStatus.ACTIVE },
        orderBy: { endDate: "asc" },
        include: { issues: { select: { status: true, estimate: true } } },
      }),
      db.membership.findMany({
        where: { orgId: org.id },
        include: { user: { select: { id: true, name: true, avatarHue: true } } },
      }),
    ]);

  const peopleById = new Map(memberships.map((m) => [m.user.id, m.user]));

  const sprintIssues = activeSprints.flatMap((s) => s.issues);
  const sprintDone = sprintIssues
    .filter((i) => i.status === IssueStatus.DONE)
    .reduce((n, i) => n + (i.estimate ?? 0), 0);
  const sprintTotal = sprintIssues.reduce((n, i) => n + (i.estimate ?? 0), 0);
  const sprintPct = pct(sprintDone, sprintTotal);

  // Soonest to end is the one worth naming; the rest are counted.
  const nearestSprint = activeSprints[0] ?? null;
  const sprintLine = !nearestSprint
    ? "no sprint running"
    : activeSprints.length === 1
      ? `${nearestSprint.name}, ${daysLeft(nearestSprint.endDate)} days left`
      : `${activeSprints.length} sprints running · ${daysLeft(nearestSprint.endDate)} days left on ${nearestSprint.name}`;

  const blockingKeys = [...new Set(blockingLinks.map((l) => l.blocker.key))];
  const oldestPr = prsWaiting[0];

  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return (
    <main className="panel">
      <header className="panel-head">
        <div>
          <h1 className="panel-title">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          <div className="panel-sub">
            {weekday} · {sprintLine}
          </div>
        </div>
        <div className="grow" />
        <NewIssueButton />
      </header>

      <div className="panel-body">
        <div className="stats">
          <div className="stat stat-lead">
            <div className="stat-label">Assigned to you</div>
            <Link href="/my-work" className="stat-value">
              {assigned}
            </Link>
            <div className="stat-note">
              {dueToday ? `${dueToday} due today` : "nothing overdue"}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">PRs waiting on you</div>
            <div className="stat-value">{prsWaiting.length}</div>
            <div className="stat-note" style={oldestPr ? { color: "var(--danger)" } : undefined}>
              {oldestPr ? `oldest ${relativeTime(oldestPr.createdAt).replace(" ago", "")}` : "all clear"}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Blocking others</div>
            <div className="stat-value">{blockingKeys.length}</div>
            <div className="stat-note mono" style={{ fontSize: 10.5 }}>
              {blockingKeys.slice(0, 2).join(" · ") || "nobody waiting"}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">
              Sprint progress
              {activeSprints.length > 1 ? " · all sprints" : ""}
            </div>
            <div className="stat-value">
              {sprintPct}
              <span>%</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <Bar value={sprintPct} size="sm" />
            </div>
            <div className="stat-note">
              {sprintTotal ? `${sprintDone} of ${sprintTotal} pts` : "nothing estimated yet"}
            </div>
          </div>
        </div>

        <div className="two-col">
          <section className="two-col-main">
            <h2 style={{ font: "600 13px var(--display)" }}>Projects</h2>

            {projects.map((project, index) => {
              const open = project.issues.filter((i) => i.status !== IssueStatus.DONE);
              const inReview = project.issues.filter((i) => i.status === IssueStatus.IN_REVIEW);
              const done = project.issues.filter((i) => i.status === IssueStatus.DONE);
              const sprint = project.sprints[0];
              const sprintPoints = sprint
                ? sprint.issues.reduce((n, i) => n + (i.estimate ?? 0), 0)
                : 0;
              const sprintDonePoints = sprint
                ? sprint.issues
                    .filter((i) => i.status === IssueStatus.DONE)
                    .reduce((n, i) => n + (i.estimate ?? 0), 0)
                : 0;
              const progress = sprint
                ? pct(sprintDonePoints, sprintPoints)
                : pct(done.length, project.issues.length);

              const assignees = [...new Set(project.issues.map((i) => i.assigneeId))]
                .map((id) => (id ? peopleById.get(id) : null))
                .filter(Boolean) as { id: string; name: string; avatarHue: number }[];

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.key}/board`}
                  className={`card${index === 0 ? " card-raised" : ""}`}
                  style={{ display: "flex", flexDirection: "column", gap: 11 }}
                >
                  <div className="row-flex">
                    <span
                      className="rail-dot"
                      style={{ background: accent(project.color).base, width: 10, height: 10 }}
                    />
                    <span className="grow truncate" style={{ font: "600 13.5px var(--display)" }}>
                      {project.name}
                    </span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
                      {sprint?.name ?? "no sprint"}
                    </span>
                  </div>

                  {project.issues.length === 0 ? (
                    <div style={{ font: "400 11px var(--sans)", color: "var(--muted)" }}>
                      Empty — give it a title and it exists
                    </div>
                  ) : sprint ? (
                    <>
                      <Bar value={progress} color={accent(project.color).base} />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="pill">{open.length} open</span>
                        {inReview.length > 0 && (
                          <span className="pill">{inReview.length} in review</span>
                        )}
                        <span className="grow" />
                        <AvatarStack
                          people={assignees}
                          max={3}
                          ring={index === 0 ? "var(--raised)" : "var(--card)"}
                        />
                      </div>
                    </>
                  ) : (
                    <div style={{ font: "400 11px var(--sans)", color: "var(--muted)" }}>
                      {open.length} issue{open.length === 1 ? "" : "s"} in backlog · not started
                    </div>
                  )}
                </Link>
              );
            })}

            <Link href="/projects/new" className="card-dashed">
              + New project — name it, pick a repo, done
            </Link>
          </section>

          <section className="two-col-side">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h2 style={{ font: "600 13px var(--display)" }}>Activity</h2>
            </div>

            <div
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0 }}
            >
              {activities.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  Nothing yet. Push a branch named after an issue key and it&rsquo;ll show up here.
                </div>
              )}

              {activities.map((event) => (
                <div key={event.id} style={{ display: "flex", gap: 10 }}>
                  {event.actor ? (
                    <Avatar name={event.actor.name} hue={event.actor.avatarHue} size={24} />
                  ) : (
                    <span
                      className="avatar"
                      style={{
                        width: 24,
                        height: 24,
                        background:
                          event.type === "CI_FAILED" ? "var(--danger-bg)" : "var(--hover-strong)",
                        color: event.type === "CI_FAILED" ? "var(--danger-fg)" : "var(--muted)",
                        fontWeight: 700,
                      }}
                    >
                      {event.type === "CI_FAILED" ? "!" : "·"}
                    </span>
                  )}

                  <div style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--text-2)" }}>
                    {event.actor && <b>{event.actor.name.split(" ")[0]} </b>}
                    {event.message}
                    <div style={{ font: "400 10px var(--sans)", color: "var(--faint)", marginTop: 2 }}>
                      {relativeTime(event.createdAt)}
                      {event.automatic ? " · automatic" : ""}
                    </div>
                  </div>
                </div>
              ))}

              <Link
                href="/my-work"
                style={{ marginTop: "auto", font: "400 11px var(--sans)", color: "var(--muted-2)" }}
              >
                See all activity →
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

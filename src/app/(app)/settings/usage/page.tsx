import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { IssueStatus } from "@/lib/types";
import { Bar } from "@/components/ui";

export const metadata = { title: "Usage · Arc" };
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const { org } = await requireOrg();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [projects, members, issuesTotal, issuesMonth, comments, activities, prs, done] =
    await Promise.all([
      db.project.count({ where: { orgId: org.id } }),
      db.membership.count({ where: { orgId: org.id } }),
      db.issue.count({ where: { project: { orgId: org.id } } }),
      db.issue.count({ where: { project: { orgId: org.id }, createdAt: { gte: monthStart } } }),
      db.comment.count({ where: { issue: { project: { orgId: org.id } } } }),
      db.activity.count({ where: { orgId: org.id, createdAt: { gte: monthStart } } }),
      db.pullRequest.count({ where: { issue: { project: { orgId: org.id } } } }),
      db.issue.count({ where: { project: { orgId: org.id }, status: IssueStatus.DONE } }),
    ]);

  const rows = [
    { label: "Issues created this month", value: issuesMonth, of: 1000, color: "var(--accent)" },
    { label: "Automated events this month", value: activities, of: 5000, color: "var(--blue)" },
    { label: "Comments, all time", value: comments, of: 2000, color: "var(--amber)" },
  ];

  const facts = [
    { label: "Projects", value: projects },
    { label: "Members", value: members },
    { label: "Issues", value: issuesTotal },
    { label: "Completed", value: done },
    { label: "Pull requests linked", value: prs },
  ];

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Usage</h1>
          <div className="panel-sub">Shown for transparency — none of these are limits</div>
        </div>
      </header>

      <div className="panel-body" style={{ padding: "4px 22px 22px", gap: 14 }}>
        <div className="stats">
          {facts.map((fact) => (
            <div key={fact.label} className="stat">
              <div className="stat-label">{fact.label}</div>
              <div className="stat-value stat-value-sm">{fact.value.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <section
          className="card"
          style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 15 }}
        >
          <div className="eyebrow">This month</div>
          {rows.map((row) => (
            <div key={row.label}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  font: "400 11px var(--sans)",
                  color: "var(--text-3)",
                }}
              >
                <span>{row.label}</span>
                <span className="mono">{row.value.toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 5 }}>
                <Bar value={Math.min(100, (row.value / row.of) * 100)} color={row.color} />
              </div>
            </div>
          ))}
        </section>

        <section className="card card-accent" style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 9 }}>
          <h2 style={{ font: "600 13px var(--display)" }}>Free plan · Active</h2>
          <p style={{ font: "400 11.5px/1.65 var(--sans)", color: "var(--accent-text)", margin: 0 }}>
            Every feature. Unlimited members, projects and history. No card on file, nothing to
            upgrade.
          </p>
        </section>
      </div>
    </main>
  );
}

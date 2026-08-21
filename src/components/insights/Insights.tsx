"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Popover } from "@/components/ui";
import { useShell } from "@/components/shell/context";
import { STATUS_LABEL } from "@/lib/constants";
import { IssueStatus } from "@/lib/types";
import type { Insights as InsightsData } from "@/lib/insights";

const STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: "var(--accent)",
  IN_REVIEW: "var(--blue)",
  BLOCKED: "var(--danger-solid)",
  TRIAGE: "oklch(0.5 0.014 285)",
  TODO: "oklch(0.5 0.014 285)",
  DONE: "var(--success)",
};

export function Insights({
  data,
  projectKey,
  scopeLabel,
}: {
  data: InsightsData;
  projectKey: string | null;
  scopeLabel: string;
}) {
  const router = useRouter();
  const { projects } = useShell();

  const peak = Math.max(
    1,
    ...data.velocity.sprints.flatMap((s) => [s.committed, s.completed]),
  );

  const cycleImproved = data.cycleTimeDelta < 0;

  return (
    <main className="panel">
      <header className="panel-head panel-head-sm">
        <div>
          <h1 className="panel-title panel-title-sm">Insights</h1>
          <div className="panel-sub">Measured from git events, not self-reported</div>
        </div>

        <div className="grow" />

        <Popover
          align="right"
          width={200}
          trigger={({ toggle }) => (
            <button className="btn btn-ghost" onClick={toggle}>
              {scopeLabel} ⌄
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                className="menu-item"
                data-active={!projectKey}
                onClick={() => {
                  router.push("/insights");
                  close();
                }}
              >
                All projects
              </button>
              {projects.map((p) => (
                <button
                  key={p.id}
                  className="menu-item"
                  data-active={projectKey === p.key}
                  onClick={() => {
                    router.push(`/projects/${p.key}/insights`);
                    close();
                  }}
                >
                  {p.name}
                </button>
              ))}
            </>
          )}
        </Popover>

        {data.velocity.sprints.length > 0 && (
          <span className="btn btn-ghost" style={{ cursor: "default" }}>
            Last {data.velocity.sprints.length} sprint
            {data.velocity.sprints.length === 1 ? "" : "s"}
          </span>
        )}
      </header>

      <div className="panel-body" style={{ gap: 15, padding: "4px 22px 22px" }}>
        <div className="stats">
          <div className="stat stat-lead">
            <div className="stat-label">Velocity</div>
            <div className="stat-value stat-value-sm">
              {data.velocity.average} <span>pts</span>
            </div>
            <div className="stat-note">
              {data.velocity.sprints.length
                ? `±${data.velocity.spread} across ${data.velocity.sprints.length} sprint${
                    data.velocity.sprints.length === 1 ? "" : "s"
                  }`
                : "no completed sprints yet"}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Cycle time</div>
            <div className="stat-value stat-value-sm">
              {data.cycleTimeDays}
              <span>d</span>
            </div>
            <div
              className="stat-note"
              style={{ color: cycleImproved ? "var(--success)" : "var(--muted)" }}
            >
              {data.cycleTimeDelta === 0
                ? "flat vs previous"
                : `${cycleImproved ? "↓" : "↑"} ${Math.abs(data.cycleTimeDelta)}d vs previous`}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Review wait</div>
            <div className="stat-value stat-value-sm">
              {data.reviewWaitHours}
              <span>h</span>
            </div>
            <div
              className="stat-note"
              style={{
                color:
                  data.bottleneck?.status === IssueStatus.IN_REVIEW
                    ? "var(--danger)"
                    : "var(--muted)",
              }}
            >
              {data.bottleneck?.status === IssueStatus.IN_REVIEW ? "your bottleneck" : "not the bottleneck"}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Mid-sprint scope</div>
            <div className="stat-value stat-value-sm">
              {data.scopeChangePct}
              <span>%</span>
            </div>
            <div className="stat-note">
              {data.scopeChangePct <= 15 ? "healthy range" : "scope creeping"}
            </div>
          </div>
        </div>

        <div className="two-col">
          <section
            className="card"
            style={{ flex: 1.35, display: "flex", flexDirection: "column", gap: 14, padding: 17, minWidth: 0 }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h2 style={{ font: "600 13px var(--display)" }}>Velocity by sprint</h2>
              <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
                <Legend color="var(--accent-dim)" label="committed" />
                <Legend color="var(--accent)" label="completed" />
              </div>
            </div>

            {data.velocity.sprints.length === 0 ? (
              <div className="empty">Finish a sprint and its velocity lands here.</div>
            ) : (
              <>
                <div className="chart-cols">
                  {data.velocity.sprints.map((sprint) => (
                    <div key={sprint.id} className="chart-pair" title={`${sprint.name}`}>
                      <div
                        className="chart-bar"
                        style={{
                          height: `${(sprint.committed / peak) * 100}%`,
                          background: sprint.active ? "oklch(0.33 0.02 128)" : "var(--accent-dim)",
                        }}
                        title={`${sprint.committed} pts committed`}
                      />
                      <div
                        className="chart-bar"
                        style={{
                          height: `${(sprint.completed / peak) * 100}%`,
                          background: sprint.active ? "oklch(0.62 0.11 128)" : "var(--accent)",
                        }}
                        title={`${sprint.completed} pts completed`}
                      />
                    </div>
                  ))}
                </div>

                <div className="chart-axis">
                  {data.velocity.sprints.map((sprint) => (
                    <span
                      key={sprint.id}
                      style={{ color: sprint.active ? "var(--accent)" : undefined }}
                    >
                      {sprint.short}
                    </span>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="two-col-side">
            <section
              className="card"
              style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13, padding: 17 }}
            >
              <h2 style={{ font: "600 13px var(--display)" }}>Where time goes</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {data.timeInStatus.map((row) => (
                  <div key={row.status}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        font: "400 11px var(--sans)",
                        color: "var(--text-3)",
                      }}
                    >
                      <span>{STATUS_LABEL[row.status]}</span>
                      <span className="mono">{row.days.toFixed(1)}d</span>
                    </div>
                    <div className="bar bar-lg" style={{ marginTop: 5 }}>
                      <i
                        style={{
                          width: `${Math.round(row.share * 100)}%`,
                          background: STATUS_TONE[row.status] ?? "var(--accent)",
                        }}
                      />
                    </div>
                  </div>
                ))}
                {data.timeInStatus.every((r) => r.days === 0) && (
                  <div style={{ color: "var(--muted)", fontSize: 11.5, lineHeight: 1.6 }}>
                    Move a few issues across the board and the flow shows up here.
                  </div>
                )}
              </div>
            </section>

            <section
              className="card card-accent"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <h2 style={{ font: "600 12.5px var(--display)", color: "oklch(0.95 0.02 128)" }}>
                One nudge, not a report
              </h2>
              <p style={{ font: "400 11.5px/1.6 var(--sans)", color: "var(--accent-text)", margin: 0 }}>
                {data.bottleneck
                  ? `${STATUS_LABEL[data.bottleneck.status]} is your bottleneck — ${data.bottleneck.note}.`
                  : "Nothing is stuck. Flow looks even across every state."}
              </p>
              {data.stalePrCount > 0 && (
                <Link
                  href={
                    projectKey
                      ? `/projects/${projectKey}/board?status=IN_REVIEW`
                      : "/my-work"
                  }
                  style={{ font: "600 11px var(--sans)", color: "var(--accent)" }}
                >
                  Open that list →
                </Link>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        font: "400 10px var(--sans)",
        color: "var(--muted)",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

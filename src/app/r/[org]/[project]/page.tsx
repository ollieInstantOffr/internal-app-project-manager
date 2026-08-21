import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadPublicRoadmap, type PublicState, type RoadmapItem } from "@/lib/roadmap";
import { SubscribeBox } from "@/components/roadmap/SubscribeBox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ org: string; project: string }> };

const STATE_LABEL: Record<PublicState, string> = {
  IN_PROGRESS: "In progress",
  PLANNED: "Planned",
  EXPLORING: "Exploring",
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { org, project } = await params;
  const roadmap = await loadPublicRoadmap(org, project);
  if (!roadmap || !roadmap.page.enabled) return { title: "Roadmap" };

  return {
    title: `${roadmap.page.headline} · ${roadmap.org.name}`,
    description: roadmap.page.intro ?? undefined,
    openGraph: {
      title: `${roadmap.org.name} — ${roadmap.page.headline}`,
      description: roadmap.page.intro ?? undefined,
      type: "website",
    },
  };
}

export default async function PublicRoadmapPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ preview?: string; state?: string; shipped?: string }> }) {
  const { org, project } = await params;
  const { preview, state, shipped } = await searchParams;

  const roadmap = await loadPublicRoadmap(org, project);
  if (!roadmap) notFound();

  // An unpublished page is still reachable by the team, so they can check it first.
  const previewing = preview === "1";
  if (!roadmap.page.enabled) {
    if (!previewing || !(await getCurrentUser())) notFound();
  }

  const page = await db.roadmapPage.findFirst({
    where: { project: { key: project.toUpperCase(), org: { slug: org.toLowerCase() } } },
    select: { id: true },
  });
  if (!page) notFound();

  // Previews are the team looking at their own page — they don't count as reach.
  if (!previewing) {
    await db.roadmapPage.update({ where: { id: page.id }, data: { views: { increment: 1 } } });
  }

  const allShipped = shipped === "all";
  const shippedRows = allShipped ? roadmap.shipped : roadmap.shipped.slice(0, 3);
  const updated = new Date(roadmap.updatedAt);

  return (
    <div className="pub">
      {previewing && (
        <div className="pub-banner">
          Preview — this page isn&apos;t published yet. Only your team can see it.
        </div>
      )}

      <header className="pub-bar">
        <span className="pub-mark">{roadmap.org.name[0]?.toUpperCase() ?? "A"}</span>
        <span className="pub-org">{roadmap.org.name}</span>
        <span className="pub-sep" aria-hidden />
        <span className="pub-bar-label">Product roadmap</span>
        <span className="grow" />
        {roadmap.page.showShipped && (
          <a className="pub-bar-link" href="#shipped">
            Changelog
          </a>
        )}
        {roadmap.page.showSubscribe && (
          <a className="pub-bar-cta" href="#updates">
            Get updates
          </a>
        )}
      </header>

      <section className="pub-hero">
        <div className="pub-stamp">
          <i aria-hidden />
          Updated{" "}
          {updated.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
        <h1 className="pub-h1">{roadmap.page.headline}</h1>
        <p className="pub-lede">
          {roadmap.page.intro ??
            `A live look at the ${roadmap.org.name} roadmap. Timing is our best estimate, not a commitment — things move, and this page moves with them.`}
        </p>
      </section>

      {roadmap.items.length > 0 && (
        <>
          <div className="pub-legend">
            <div>
              <span className="pub-key" data-state="IN_PROGRESS" aria-hidden />
              In progress
            </div>
            <div>
              <span className="pub-key" data-state="PLANNED" aria-hidden />
              Planned
            </div>
            <div>
              <span className="pub-key" data-state="EXPLORING" aria-hidden />
              Exploring
            </div>
            {roadmap.milestones.length > 0 && (
              <div>
                <span className="pub-diamond" aria-hidden />
                Milestone
              </div>
            )}
          </div>

          {/* Desktop: bars against a quarter grid. */}
          <section className="pub-timeline" aria-label="Roadmap timeline">
            <div className="pub-cols">
              <div className="pub-cols-spacer" />
              <div className="pub-cols-inner">
                {roadmap.columns.map((column) => (
                  <div key={column.label} className="pub-col">
                    {column.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="pub-rows">
              {roadmap.items.map((item) => (
                <Row key={item.id} item={item} columns={roadmap.columns.length} />
              ))}
            </div>
          </section>

          {/* Phone: the same work, grouped by quarter. */}
          <section className="pub-groups" aria-label="Roadmap">
            {roadmap.groups.map((group) => (
              <div key={group.label}>
                <div className="pub-group-head">
                  <div className="pub-group-label">{group.label}</div>
                  <div className="pub-group-rule" />
                </div>
                <div className="pub-cards">
                  {group.items.map((item) => (
                    <div key={item.id} className="pub-card" data-state={item.state}>
                      <span className="pub-chip" data-state={item.state}>
                        {STATE_LABEL[item.state]}
                      </span>
                      <div className="pub-card-name">{item.name}</div>
                      {item.summary && <div className="pub-card-summary">{item.summary}</div>}
                      <Extras item={item} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {roadmap.milestones.length > 0 && (
        <section className="pub-section">
          <div className="pub-eyebrow">Milestones</div>
          <div className="pub-milestones">
            {roadmap.milestones.map((milestone) => (
              <div key={milestone.id} className="pub-milestone">
                <span className="pub-diamond" data-outline={!milestone.passed} aria-hidden />
                <div>
                  <div className="pub-milestone-name">{milestone.name}</div>
                  <div className="pub-milestone-date">{milestone.timing}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="pub-split">
        {roadmap.page.showShipped && (
          <div className="pub-shipped" id="shipped">
            <div className="pub-eyebrow">Recently shipped</div>
            {shippedRows.length === 0 ? (
              <div className="pub-note" style={{ paddingTop: 6 }}>
                Nothing here yet — the first release will show up on this page.
              </div>
            ) : (
              <>
                {shippedRows.map((row) => (
                  <div key={row.id} className="pub-ship-row">
                    <div className="pub-ship-date">
                      {new Date(row.shippedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "2-digit",
                      })}
                    </div>
                    <div>
                      <div className="pub-ship-name">{row.name}</div>
                      {row.summary && <div className="pub-ship-summary">{row.summary}</div>}
                    </div>
                  </div>
                ))}
                {!allShipped && roadmap.shipped.length > shippedRows.length && (
                  <a className="pub-ship-more" href="?shipped=all#shipped">
                    See the full changelog →
                  </a>
                )}
              </>
            )}
          </div>
        )}

        {roadmap.page.showSubscribe && (
          <aside className="pub-aside" id="updates">
            <SubscribeBox
              pageId={page.id}
              showSubscribe={roadmap.page.showSubscribe}
              confirmed={state === "subscribed"}
            />
          </aside>
        )}
      </div>

      <footer className="pub-foot">
        <div>
          © {new Date().getFullYear()} {roadmap.org.name} · Dates are estimates and may change
        </div>
        <div className="grow" />
        <div>
          Roadmap published with <b>Arc</b>
        </div>
      </footer>
    </div>
  );
}

function Row({ item, columns }: { item: RoadmapItem; columns: number }) {
  // Undated work parks at the tail rather than implying a quarter it isn't in.
  const bar = item.bar ?? { left: 100 - 100 / columns + 2, width: 100 / columns - 6 };

  return (
    <div className="pub-row">
      <div className="pub-row-label">
        <div className="pub-row-name">{item.name}</div>
        {item.summary && <div className="pub-row-summary">{item.summary}</div>}
        <Extras item={item} />
      </div>
      <div className="pub-track" style={gridBackground(columns)}>
        <div
          className="pub-bar"
          data-state={item.state}
          style={{ marginLeft: `${bar.left}%`, width: `${bar.width}%` }}
        >
          <div className="pub-bar-state">{STATE_LABEL[item.state]}</div>
          <div className="pub-bar-when">{item.timing}</div>
        </div>
      </div>
    </div>
  );
}

/** Anything the publisher chose to reveal beyond name and timing. */
function Extras({ item }: { item: RoadmapItem }) {
  if (item.progress === null && item.issues.length === 0) return null;

  return (
    <>
      {item.progress !== null && (
        <div className="pub-progress" aria-label={`${item.progress}% complete`}>
          <i style={{ width: `${item.progress}%` }} />
        </div>
      )}
      {item.issues.length > 0 && (
        <div className="pub-issues">
          {item.issues.slice(0, 6).map((issue) => (
            <div key={issue.key} className="pub-issue">
              <span data-done={issue.done}>{issue.done ? "✓" : "○"}</span>
              <span>{issue.title}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The vertical quarter dividers behind each track. Gradient stops have to run
 * in order, so this walks left to right rather than emitting one span per line.
 */
function gridBackground(columns: number): React.CSSProperties {
  const stops: string[] = [];
  let cursor = "0";

  for (let i = 1; i < columns; i++) {
    const at = `${((i / columns) * 100).toFixed(4)}%`;
    stops.push(`transparent ${cursor} calc(${at} - 1px)`);
    stops.push(`var(--pub-grid) calc(${at} - 1px) ${at}`);
    cursor = at;
  }
  stops.push(`transparent ${cursor}`);

  return { backgroundImage: `linear-gradient(to right, ${stops.join(",")})` };
}

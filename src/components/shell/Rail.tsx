"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useShell } from "./context";
import { Avatar, ProjectDot } from "@/components/ui";
import { shortName } from "@/lib/format";

const PLANNING_TABS = [
  { slug: "board", label: "Board" },
  { slug: "backlog", label: "Backlog" },
  { slug: "epics", label: "Epics" },
  { slug: "insights", label: "Insights" },
];

const TOOL_TABS = [
  { slug: "code", label: "Code" },
  { slug: "api", label: "API console" },
];

/** The console and browser have nested routes, so a suffix match isn't enough. */
function isActiveTab(pathname: string, projectKey: string, slug: string) {
  const base = `/projects/${projectKey}/${slug}`;
  return pathname === base || pathname.startsWith(`${base}/`) || pathname.startsWith(`${base}?`);
}

const SETTINGS_NAV = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/usage", label: "Usage" },
];

export function Rail({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { org, user, projects, inboxCount, taskCount, taskLists } = useShell();
  const pathname = usePathname();
  const activeList = useSearchParams().get("list");

  const inSettings = pathname.startsWith("/settings");
  const inTasks = pathname.startsWith("/tasks");
  const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
  const activeProject = projectMatch
    ? projects.find((p) => p.key.toLowerCase() === projectMatch[1].toLowerCase())
    : null;

  return (
    <nav className="rail" aria-label="Main">
      <Link href="/home" className="rail-brand">
        <span className="rail-mark">{org.name[0]?.toUpperCase() ?? "A"}</span>
        <span className="grow truncate" style={{ font: "600 13px var(--display)" }}>
          {org.name}
        </span>
      </Link>

      {!inSettings && (
        <button className="rail-search" onClick={onOpenPalette}>
          Search issues
          <span className="grow" />
          <span className="mono kbd-hint" style={{ fontSize: 9, fontWeight: 500 }}>
            ⌘K
          </span>
        </button>
      )}

      {inSettings ? (
        <div className="rail-group">
          <div className="eyebrow rail-heading">Settings</div>
          {SETTINGS_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rail-item"
              data-active={pathname === item.href}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/settings/danger"
            className="rail-item"
            data-active={pathname === "/settings/danger"}
            style={{ color: "var(--danger)" }}
          >
            Danger zone
          </Link>
        </div>
      ) : (
        <>
          <div className="rail-group">
            <RailLink href="/home" label="Home" active={pathname === "/home"} />
            <RailLink
              href="/my-work"
              label="My work"
              active={pathname.startsWith("/my-work")}
              badge={inboxCount || undefined}
            />
            <RailLink
              href="/tasks"
              label="Tasks"
              active={inTasks}
              badge={taskCount || undefined}
              accentBadge
            />
            <RailLink href="/roadmap" label="Roadmap" active={pathname.startsWith("/roadmap")} />
            <RailLink
              href="/insights"
              label="Insights"
              active={pathname === "/insights"}
            />
          </div>

          {inTasks ? (
            <div className="rail-group">
              <div className="eyebrow rail-heading">Lists</div>
              {taskLists.map((list) => (
                <Link
                  key={list.id}
                  href={`/tasks?list=${list.id}`}
                  className="rail-item"
                  data-active={activeList === list.id}
                  style={{ padding: "7px 11px" }}
                >
                  <ProjectDot color={`var(--list-${list.color})`} size={8} />
                  <span className="truncate">{list.name}</span>
                  <span className="mono rail-count">{list.count}</span>
                </Link>
              ))}
              <Link
                href="/tasks?new-list=1"
                className="rail-item"
                style={{ color: "var(--muted-2)", fontSize: 12 }}
              >
                + New list
              </Link>
            </div>
          ) : activeProject ? (
            <>
              <div className="rail-group">
                <div className="eyebrow rail-heading truncate">{activeProject.name}</div>
                {PLANNING_TABS.map((tab) => (
                  <Link
                    key={tab.slug}
                    href={`/projects/${activeProject.key}/${tab.slug}`}
                    className="rail-item"
                    data-active={isActiveTab(pathname, activeProject.key, tab.slug)}
                  >
                    {tab.label}
                  </Link>
                ))}
              </div>

              {/* Tools read the repository rather than the plan, so they sit apart. */}
              <div className="rail-group">
                <div className="eyebrow rail-heading">Tools</div>
                {TOOL_TABS.map((tab) => (
                  <Link
                    key={tab.slug}
                    href={`/projects/${activeProject.key}/${tab.slug}`}
                    className="rail-item"
                    data-active={isActiveTab(pathname, activeProject.key, tab.slug)}
                  >
                    <span className="rail-glyph" />
                    {tab.label}
                  </Link>
                ))}
              </div>

              <div className="rail-group">
                <Link href="/home" className="rail-item" style={{ color: "var(--muted-2)", fontSize: 12 }}>
                  ← All projects
                </Link>
              </div>
            </>
          ) : (
            <div className="rail-group">
              <div className="eyebrow rail-heading">Projects</div>
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.key}/board`}
                  className="rail-item"
                  style={{ padding: "8px 11px" }}
                >
                  <ProjectDot color={project.color} />
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
              <Link
                href="/projects/new"
                className="rail-item"
                style={{ color: "var(--muted-2)", fontSize: 12 }}
              >
                + New project
              </Link>
            </div>
          )}
        </>
      )}

      {pathname.includes("/code") && (
        <div
          className="card"
          style={{
            marginTop: "auto",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 13,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ font: "600 11.5px var(--display)" }}>Read-only</div>
          <div style={{ font: "400 10.5px/1.6 var(--sans)", color: "var(--muted)" }}>
            Mirrors the branch. Edits happen in your editor — this is for context and linking.
          </div>
        </div>
      )}

      {pathname.includes("/api") && !pathname.startsWith("/settings") && (
        <div
          className="card kbd-hint"
          style={{
            marginTop: "auto",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 13,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          <div className="eyebrow">Shortcuts</div>
          {[
            ["⌘⏎", "send"],
            ["⌘E", "environment"],
            ["⌘⇧I", "issue from run"],
          ].map(([keys, action]) => (
            <div
              key={keys}
              className="mono"
              style={{ fontSize: 10.5, color: "var(--text-3)", display: "flex", gap: 8 }}
            >
              <span style={{ width: 34 }}>{keys}</span>
              <span style={{ color: "var(--muted)" }}>{action}</span>
            </div>
          ))}
        </div>
      )}

      {pathname.startsWith("/my-work") && (
        <div
          className="card kbd-hint"
          style={{
            marginTop: "auto",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 13,
            display: "flex",
            flexDirection: "column",
            gap: 7,
          }}
        >
          <div className="eyebrow">Shortcuts</div>
          {[
            ["j / k", "move"],
            ["⏎", "open"],
            ["e", "archive"],
            ["a", "assign"],
          ].map(([keys, action]) => (
            <div
              key={keys}
              className="mono"
              style={{ fontSize: 10.5, color: "var(--text-3)", display: "flex", gap: 8 }}
            >
              <span style={{ width: 34 }}>{keys}</span>
              <span style={{ color: "var(--muted)" }}>{action}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rail-foot">
        <Avatar name={user.name} hue={user.avatarHue} size={26} />
        <span className="grow truncate" style={{ font: "400 12px var(--sans)", color: "var(--text-3)" }}>
          {shortName(user.name)}
        </span>
        <Link
          href="/settings/general"
          aria-label="Settings"
          style={{ color: "var(--muted-2)", fontSize: 12 }}
        >
          ⚙
        </Link>
      </div>
    </nav>
  );
}

function RailLink({
  href,
  label,
  active,
  badge,
  accentBadge,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
  accentBadge?: boolean;
}) {
  return (
    <Link href={href} className="rail-item" data-active={active}>
      <span className="rail-glyph" />
      {label}
      {badge ? (
        <span className="rail-badge" data-accent={accentBadge || undefined}>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

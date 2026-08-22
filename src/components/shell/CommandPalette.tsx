"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useShell } from "./context";
import { Avatar } from "@/components/ui";
import { accent } from "@/lib/constants";
import type { IssueStatus } from "@/lib/types";

type SearchIssue = {
  id: string;
  key: string;
  title: string;
  status: IssueStatus;
  statusLabel: string;
  assignee: { id: string; name: string; avatarHue: number } | null;
  projectKey: string;
  projectColor: string;
};

type SearchEpic = {
  id: string;
  key: string;
  name: string;
  projectKey: string;
  projectName: string;
  progress: number;
};

type SearchProject = { id: string; key: string; name: string; color: string };
type SearchMember = { id: string; name: string; email: string; avatarHue: number };

type Row =
  | { kind: "issue"; issue: SearchIssue }
  | { kind: "epic"; epic: SearchEpic }
  | { kind: "project"; project: SearchProject }
  | { kind: "member"; member: SearchMember }
  | { kind: "action"; id: string; label: string; hint?: string; run: () => void };

const STATUS_TONE: Record<string, string> = {
  DONE: "var(--success)",
  IN_PROGRESS: "var(--accent)",
  IN_REVIEW: "var(--blue)",
  TODO: "var(--muted)",
  TRIAGE: "var(--muted)",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { projects } = useShell();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    issues: SearchIssue[];
    epics: SearchEpic[];
    projects: SearchProject[];
    members: SearchMember[];
  }>({ issues: [], epics: [], projects: [], members: [] });
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<typeof results>(`/api/search?q=${encodeURIComponent(query)}`);
        if (!cancelled) {
          setResults(res);
          setCursor(0);
        }
      } catch {
        /* palette stays on whatever it had */
      }
    }, query ? 130 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const issue of results.issues) out.push({ kind: "issue", issue });
    for (const epic of results.epics) out.push({ kind: "epic", epic });
    for (const project of results.projects) out.push({ kind: "project", project });
    for (const member of results.members) out.push({ kind: "member", member });

    const trimmed = query.trim();
    if (trimmed) {
      out.push({
        kind: "action",
        id: "create",
        label: `Create issue "${trimmed}"…`,
        hint: "C",
        run: () => {
          const target = projects[0];
          if (target) {
            router.push(
              `/projects/${target.key}/board?compose=${encodeURIComponent(trimmed)}`,
            );
          }
        },
      });
    }

    out.push({
      kind: "action",
      id: "my-work",
      label: "Go to My work",
      hint: "G W",
      run: () => router.push("/my-work"),
    });
    out.push({
      kind: "action",
      id: "tasks",
      label: "Go to Tasks",
      hint: "G T",
      run: () => router.push("/tasks"),
    });
    out.push({
      kind: "action",
      id: "roadmap",
      label: "Go to Roadmap",
      hint: "G R",
      run: () => router.push("/roadmap"),
    });
    // Every project, not just the first — the palette is the fastest way to
    // switch, and only offering one of them made it useless for that.
    projects.forEach((project, index) => {
      out.push({
        kind: "action",
        id: `board-${project.id}`,
        label: `Go to ${project.name} board`,
        hint: index === 0 ? "G B" : undefined,
        run: () => router.push(`/projects/${project.key}/board`),
      });
    });
    out.push({
      kind: "action",
      id: "invite",
      label: "Invite teammate…",
      run: () => router.push("/settings/members?invite=1"),
    });

    return out;
  }, [results, query, projects, router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        activate(rows[cursor]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function activate(row: Row | undefined) {
    if (!row) return;
    onClose();
    if (row.kind === "issue") router.push(`/issues/${row.issue.key}`);
    if (row.kind === "epic") router.push(`/projects/${row.epic.projectKey}/epics?epic=${row.epic.id}`);
    if (row.kind === "project") router.push(`/projects/${row.project.key}/board`);
    if (row.kind === "member") router.push(`/settings/members?member=${row.member.id}`);
    if (row.kind === "action") row.run();
  }

  if (!open) return null;

  let index = -1;
  const groups: { label: string; rows: { row: Row; i: number }[] }[] = [];
  const push = (label: string, predicate: (row: Row) => boolean) => {
    const matched = rows
      .map((row) => ({ row, i: rows.indexOf(row) }))
      .filter(({ row }) => predicate(row));
    if (matched.length) groups.push({ label, rows: matched });
  };
  index = 0;
  void index;
  push("Issues", (r) => r.kind === "issue");
  push("Epics", (r) => r.kind === "epic");
  push("Projects", (r) => r.kind === "project");
  push("People", (r) => r.kind === "member");
  push("Actions", (r) => r.kind === "action");

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal aria-label="Command palette">
        <div className="palette-input">
          <span style={{ font: "500 14px var(--mono)", color: "var(--accent)" }}>›</span>
          <input
            autoFocus
            value={query}
            placeholder="Search issues, epics, people — or type a command"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
          />
          <span className="kbd">esc</span>
        </div>

        <div className="palette-list" ref={listRef}>
          {rows.length === 0 && (
            <div style={{ padding: "28px 18px", color: "var(--muted)", fontSize: 12.5 }}>
              Nothing matches “{query}”.
            </div>
          )}

          {groups.map((group) => (
            <div key={group.label}>
              <div className="eyebrow palette-group">{group.label}</div>
              {group.rows.map(({ row, i }) => (
                <button
                  key={rowKey(row)}
                  className="palette-row"
                  data-active={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => activate(row)}
                >
                  <RowBody row={row} query={query} active={i === cursor} />
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span>↑↓ navigate</span>
          <span>⏎ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

function rowKey(row: Row) {
  if (row.kind === "issue") return `i-${row.issue.id}`;
  if (row.kind === "epic") return `e-${row.epic.id}`;
  if (row.kind === "project") return `p-${row.project.id}`;
  if (row.kind === "member") return `m-${row.member.id}`;
  return `a-${row.id}`;
}

function RowBody({ row, query, active }: { row: Row; query: string; active: boolean }) {
  if (row.kind === "issue") {
    return (
      <>
        <span
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 500,
            width: 62,
            flex: "none",
            color: active ? "var(--accent-mono)" : "var(--muted-2)",
          }}
        >
          {row.issue.key}
        </span>
        <span className="grow truncate" style={{ fontSize: 13 }}>
          <Highlight text={row.issue.title} query={query} active={active} />
        </span>
        <span
          style={{
            fontSize: 10.5,
            flex: "none",
            color: STATUS_TONE[row.issue.status] ?? "var(--muted)",
          }}
        >
          {row.issue.statusLabel}
        </span>
        {row.issue.assignee && (
          <Avatar name={row.issue.assignee.name} hue={row.issue.assignee.avatarHue} size={20} />
        )}
      </>
    );
  }

  if (row.kind === "epic") {
    return (
      <>
        <span
          className="mono"
          style={{ fontSize: 10, fontWeight: 500, width: 62, flex: "none", color: "var(--muted-2)" }}
        >
          {row.epic.key}
        </span>
        <span className="grow truncate" style={{ fontSize: 13 }}>
          <Highlight text={row.epic.name} query={query} active={active} />
        </span>
        <span style={{ fontSize: 10.5, color: "var(--muted)", flex: "none" }}>
          {row.epic.projectName} · {row.epic.progress}%
        </span>
      </>
    );
  }

  if (row.kind === "project") {
    return (
      <>
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: accent(row.project.color).base,
            flex: "none",
          }}
        />
        <span className="grow truncate" style={{ fontSize: 13 }}>
          <Highlight text={row.project.name} query={query} active={active} />
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>
          {row.project.key}
        </span>
      </>
    );
  }

  if (row.kind === "member") {
    return (
      <>
        <Avatar name={row.member.name} hue={row.member.avatarHue} size={20} />
        <span className="grow truncate" style={{ fontSize: 13 }}>
          <Highlight text={row.member.name} query={query} active={active} />
        </span>
        <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{row.member.email}</span>
      </>
    );
  }

  return (
    <>
      <span
        style={{ width: 20, height: 20, borderRadius: 6, background: "var(--hover-strong)", flex: "none" }}
      />
      <span className="grow truncate" style={{ fontSize: 13, color: "var(--text-2)" }}>
        {row.label}
      </span>
      {row.hint && (
        <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)" }}>
          {row.hint}
        </span>
      )}
    </>
  );
}

function Highlight({ text, query, active }: { text: string; query: string; active: boolean }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const at = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className={active ? "hit" : "hit-soft"}>{text.slice(at, at + trimmed.length)}</span>
      {text.slice(at + trimmed.length)}
    </>
  );
}

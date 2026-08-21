import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";
import { IssueStatus } from "./types";
import {
  listRepoTree,
  readRepoFile,
  listBranches,
  listCommitsForPath,
  defaultBranch,
  type RepoBranch,
} from "./github";

/* ── a small TTL cache: the tree is the same for everyone on a branch ── */

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();
const TREE_TTL = 60_000;
const FILE_TTL = 30_000;

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const value = await load();
  cache.set(key, { value, expires: Date.now() + ttl });

  // Keep it from growing without bound in a long-lived process.
  if (cache.size > 200) {
    for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
  }
  return value;
}

export function invalidateRepo(repo: string) {
  for (const key of cache.keys()) if (key.startsWith(`${repo}:`)) cache.delete(key);
}

/* ── tree ─────────────────────────────────────────────────── */

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: TreeNode[];
  fileCount?: number;
};

/** Flat paths from the git API, folded into something a tree view can walk. */
export function buildTree(paths: { path: string; type: "blob" | "tree"; size?: number }[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };

  for (const entry of paths) {
    const segments = entry.path.split("/");
    let node = root;

    for (let i = 0; i < segments.length; i++) {
      const isLeaf = i === segments.length - 1;
      const path = segments.slice(0, i + 1).join("/");
      const type: "file" | "dir" = isLeaf && entry.type === "blob" ? "file" : "dir";

      let child = node.children!.find((c) => c.name === segments[i]);
      if (!child) {
        child = { name: segments[i], path, type, children: type === "dir" ? [] : undefined };
        if (type === "file") child.size = entry.size;
        node.children!.push(child);
      }
      node = child;
    }
  }

  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => {
        if (n.children) {
          n.children = sort(n.children);
          n.fileCount = countFiles(n);
        }
        return n;
      })
      // Directories first, then alphabetical — how every file tree behaves.
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));

  return sort(root.children!);
}

function countFiles(node: TreeNode): number {
  if (node.type === "file") return 1;
  return (node.children ?? []).reduce((n, c) => n + countFiles(c), 0);
}

export async function getRepoTree(repo: string, token: string, ref?: string) {
  const branch = ref ?? (await cached(`${repo}:default`, TREE_TTL, () => defaultBranch(token, repo)));

  return cached(`${repo}:tree:${branch}`, TREE_TTL, async () => {
    const { entries, truncated } = await listRepoTree(token, repo, branch);
    return {
      ref: branch,
      truncated,
      tree: buildTree(entries),
      fileCount: entries.filter((e) => e.type === "blob").length,
      paths: entries.filter((e) => e.type === "blob").map((e) => e.path),
      syncedAt: new Date().toISOString(),
    };
  });
}

export async function getBranches(repo: string, token: string): Promise<RepoBranch[]> {
  return cached(`${repo}:branches`, TREE_TTL, () => listBranches(token, repo));
}

/* ── one file ─────────────────────────────────────────────── */

export type FileContext = {
  path: string;
  ref: string;
  content: string | null;
  binary: boolean;
  lines: number;
  sizeBytes: number;
  language: string;
  lastCommit: { authorName: string; date: string; message: string } | null;
  owners: { name: string; login: string | null; hue: number; share: number }[];
  issues: {
    key: string;
    title: string;
    status: IssueStatus;
    startLine: number | null;
    endLine: number | null;
    assignee: string | null;
  }[];
  branches: { name: string; ahead: number; issueKey: string | null }[];
  pullRequests: { number: number; state: string; issueKey: string }[];
  epic: { key: string; name: string } | null;
};

export async function getFileContext(opts: {
  orgId: string;
  projectId: string;
  repo: string;
  token: string;
  path: string;
  ref: string;
}): Promise<FileContext> {
  const { repo, token, path, ref } = opts;

  const [file, commits, refs] = await Promise.all([
    cached(`${repo}:file:${ref}:${path}`, FILE_TTL, async () => {
      const content = await readRepoFile(token, repo, path, ref);
      return { content, binary: content === null };
    }),
    cached(`${repo}:commits:${ref}:${path}`, FILE_TTL, () =>
      listCommitsForPath(token, repo, path, ref),
    ),
    // Arc's own knowledge — which issues point at this file.
    db.issueFileRef.findMany({
      where: { repo, path, issue: { project: { orgId: opts.orgId }, archivedAt: null } },
      orderBy: { createdAt: "desc" },
      include: {
        issue: {
          include: {
            assignee: { select: { name: true } },
            epic: { select: { key: true, name: true } },
            branches: true,
            pullRequests: true,
          },
        },
      },
    }),
  ]);

  const content = file.content;
  const lines = content ? content.split("\n").length : 0;

  // Ownership is share of recent commits touching this path.
  const byAuthor = new Map<string, { name: string; login: string | null; hue: number; count: number }>();
  for (const commit of commits) {
    const key = commit.authorLogin ?? commit.authorName;
    const existing = byAuthor.get(key);
    if (existing) existing.count += 1;
    else
      byAuthor.set(key, {
        name: commit.authorName,
        login: commit.authorLogin,
        hue: commit.authorAvatarHue,
        count: 1,
      });
  }
  const owners = [...byAuthor.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((a) => ({
      name: a.name,
      login: a.login,
      hue: a.hue,
      share: commits.length ? Math.round((a.count / commits.length) * 100) : 0,
    }));

  // The epic that owns this directory: whichever one most of its issues sit in.
  const directory = path.split("/").slice(0, -1).join("/");
  const directoryRefs = await db.issueFileRef.findMany({
    where: {
      repo,
      path: directory ? { startsWith: `${directory}/` } : undefined,
      issue: { project: { orgId: opts.orgId }, archivedAt: null },
    },
    include: { issue: { include: { epic: { select: { key: true, name: true } } } } },
    take: 200,
  });
  const epicTally = new Map<string, { key: string; name: string; count: number }>();
  for (const row of directoryRefs) {
    const epic = row.issue.epic;
    if (!epic) continue;
    const found = epicTally.get(epic.key);
    if (found) found.count += 1;
    else epicTally.set(epic.key, { ...epic, count: 1 });
  }
  const epic = [...epicTally.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  const branches = new Map<string, { name: string; ahead: number; issueKey: string | null }>();
  const pullRequests = new Map<number, { number: number; state: string; issueKey: string }>();
  for (const row of refs) {
    for (const branch of row.issue.branches) {
      branches.set(branch.name, {
        name: branch.name,
        ahead: branch.ahead,
        issueKey: row.issue.key,
      });
    }
    for (const pr of row.issue.pullRequests) {
      pullRequests.set(pr.number, { number: pr.number, state: pr.state, issueKey: row.issue.key });
    }
  }

  return {
    path,
    ref,
    content,
    binary: file.binary,
    lines,
    sizeBytes: content ? new TextEncoder().encode(content).length : 0,
    language: languageOf(path),
    lastCommit: commits[0]
      ? { authorName: commits[0].authorName, date: commits[0].date, message: commits[0].message }
      : null,
    owners,
    issues: refs.map((row) => ({
      key: row.issue.key,
      title: row.issue.title,
      status: row.issue.status,
      startLine: row.startLine,
      endLine: row.endLine,
      assignee: row.issue.assignee?.name ?? null,
    })),
    branches: [...branches.values()],
    pullRequests: [...pullRequests.values()],
    epic: epic ? { key: epic.key, name: epic.name } : null,
  };
}

/** Paths in this repo that have open issues against them — the tree's dots. */
export async function pathsWithIssues(orgId: string, repo: string) {
  const rows = await db.issueFileRef.findMany({
    where: {
      repo,
      issue: {
        project: { orgId },
        archivedAt: null,
        status: { not: IssueStatus.DONE },
      },
    },
    select: { path: true },
  });
  return [...new Set(rows.map((r) => r.path))];
}

export async function requireRepoProject(orgId: string, key: string, userId: string) {
  const project = await db.project.findFirst({
    where: { orgId, OR: [{ id: key }, { key: key.toUpperCase() }] },
  });
  if (!project) throw new HttpError(404, "Project not found");
  if (!project.repoFullName) {
    throw new HttpError(400, "This project has no repository linked");
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.githubToken) {
    throw new HttpError(400, "Connect your GitHub account to browse the repository");
  }

  return { project, repo: project.repoFullName, token: user.githubToken };
}

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  cjs: "JavaScript", json: "JSON", md: "Markdown", mdx: "Markdown", css: "CSS", scss: "SCSS",
  html: "HTML", yml: "YAML", yaml: "YAML", toml: "TOML", sql: "SQL", prisma: "Prisma",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift",
  php: "PHP", sh: "Shell", bash: "Shell", zsh: "Shell", dockerfile: "Dockerfile", env: "Env",
};

export function languageOf(path: string) {
  const name = path.split("/").pop() ?? "";
  if (/^dockerfile$/i.test(name)) return "Dockerfile";
  if (/^\.env/i.test(name)) return "Env";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGES[ext] ?? (ext ? ext.toUpperCase() : "Text");
}

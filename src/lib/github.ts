import "server-only";

const API = "https://api.github.com";

export type Repo = {
  fullName: string;
  name: string;
  owner: string;
  language: string | null;
  openIssues: number;
  contributors?: number;
  private: boolean;
  pushedAt: string;
};

export type RepoIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: string[];
  closedAt: string | null;
  assigneeLogin: string | null;
};

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
}

/** Repos the signed-in user can push to, most recently pushed first. */
export async function listRepos(token: string): Promise<Repo[]> {
  const res = await fetch(`${API}/user/repos?per_page=60&sort=pushed&affiliation=owner,organization_member`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<{
    full_name: string;
    name: string;
    owner: { login: string };
    language: string | null;
    open_issues_count: number;
    private: boolean;
    pushed_at: string;
    permissions?: { push?: boolean };
  }>;
  return raw
    .filter((r) => r.permissions?.push !== false)
    .map((r) => ({
      fullName: r.full_name,
      name: r.name,
      owner: r.owner.login,
      language: r.language,
      openIssues: r.open_issues_count,
      private: r.private,
      pushedAt: r.pushed_at,
    }));
}

export async function countContributors(token: string, fullName: string): Promise<number> {
  const res = await fetch(`${API}/repos/${fullName}/contributors?per_page=100&anon=false`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const raw = (await res.json()) as unknown[];
  return Array.isArray(raw) ? raw.length : 0;
}

/** Issues to seed a new project's backlog. Pull requests are filtered out. */
export async function listRepoIssues(
  token: string,
  fullName: string,
  opts: { includeClosed?: boolean } = {},
): Promise<RepoIssue[]> {
  const state = opts.includeClosed ? "all" : "open";
  const since = opts.includeClosed
    ? `&since=${new Date(Date.now() - 30 * 864e5).toISOString()}`
    : "";
  const res = await fetch(`${API}/repos/${fullName}/issues?state=${state}&per_page=100${since}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<{
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    labels: Array<{ name: string } | string>;
    closed_at: string | null;
    pull_request?: unknown;
    assignee?: { login: string } | null;
  }>;
  return raw
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body,
      state: i.state,
      labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
      closedAt: i.closed_at,
      assigneeLogin: i.assignee?.login ?? null,
    }));
}

/** Registers the webhook that keeps issues moving without anyone touching a board. */
export async function ensureWebhook(token: string, fullName: string, appUrl: string, secret: string) {
  const url = `${appUrl}/api/webhooks/github`;
  const existing = await fetch(`${API}/repos/${fullName}/hooks`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (existing.ok) {
    const hooks = (await existing.json()) as Array<{ config?: { url?: string } }>;
    if (hooks.some((h) => h.config?.url === url)) return true;
  }

  const res = await fetch(`${API}/repos/${fullName}/hooks`, {
    method: "POST",
    headers: { ...headers(token), "content-type": "application/json" },
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["push", "pull_request", "check_run", "workflow_run"],
      config: { url, content_type: "json", secret, insecure_ssl: "0" },
    }),
  });
  return res.ok;
}


export type RepoTreeEntry = { path: string; type: "blob" | "tree"; size?: number };

/** The whole tree in one call — cheaper than walking directories. */
export async function listRepoTree(
  token: string,
  fullName: string,
  ref = "HEAD",
): Promise<{ entries: RepoTreeEntry[]; truncated: boolean; ref: string }> {
  const branch = ref === "HEAD" ? await defaultBranch(token, fullName) : ref;

  const res = await fetch(`${API}/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return { entries: [], truncated: false, ref: branch };

  const raw = (await res.json()) as {
    tree?: { path: string; type: string; size?: number }[];
    truncated?: boolean;
  };

  return {
    entries: (raw.tree ?? [])
      .filter((e) => e.type === "blob" || e.type === "tree")
      .map((e) => ({ path: e.path, type: e.type as "blob" | "tree", size: e.size })),
    truncated: !!raw.truncated,
    ref: branch,
  };
}

export async function defaultBranch(token: string, fullName: string): Promise<string> {
  const res = await fetch(`${API}/repos/${fullName}`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) return "main";
  const raw = (await res.json()) as { default_branch?: string };
  return raw.default_branch ?? "main";
}

/** Raw file contents, decoded. Returns null for anything binary or oversized. */
export async function readRepoFile(
  token: string,
  fullName: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await fetch(`${API}/repos/${fullName}/contents/${encodeURI(path)}${query}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const raw = (await res.json()) as { content?: string; encoding?: string; size?: number };
  if (!raw.content || raw.encoding !== "base64") return null;
  if ((raw.size ?? 0) > 400_000) return null;

  const text = Buffer.from(raw.content, "base64").toString("utf8");
  return text.includes("\u0000") ? null : text;
}

export type RepoBranch = { name: string; sha: string; isDefault: boolean };

export async function listBranches(
  token: string,
  fullName: string,
  defaultRef?: string,
): Promise<RepoBranch[]> {
  const res = await fetch(`${API}/repos/${fullName}/branches?per_page=100`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const raw = (await res.json()) as { name: string; commit: { sha: string } }[];
  const fallback = defaultRef ?? (await defaultBranch(token, fullName));

  return raw
    .map((b) => ({ name: b.name, sha: b.commit.sha, isDefault: b.name === fallback }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export type PathCommit = {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  authorAvatarHue: number;
  date: string;
};

/** Recent commits touching one path — powers "last changed" and ownership. */
export async function listCommitsForPath(
  token: string,
  fullName: string,
  path: string,
  ref?: string,
  limit = 30,
): Promise<PathCommit[]> {
  const query = new URLSearchParams({ path, per_page: String(limit) });
  if (ref) query.set("sha", ref);

  const res = await fetch(`${API}/repos/${fullName}/commits?${query}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!res.ok) return [];

  const raw = (await res.json()) as {
    sha: string;
    commit: { message: string; author: { name: string; date: string } };
    author: { login: string } | null;
  }[];

  return raw.map((c) => ({
    sha: c.sha,
    message: c.commit.message.split("\n")[0],
    authorName: c.commit.author?.name ?? c.author?.login ?? "Unknown",
    authorLogin: c.author?.login ?? null,
    authorAvatarHue: hue(c.author?.login ?? c.commit.author?.name ?? ""),
    date: c.commit.author?.date ?? new Date().toISOString(),
  }));
}

function hue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

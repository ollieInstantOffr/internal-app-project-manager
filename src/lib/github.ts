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

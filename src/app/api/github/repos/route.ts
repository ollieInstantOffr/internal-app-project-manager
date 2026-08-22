import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listRepos } from "@/lib/github";
import { githubTokenFor } from "@/lib/github-auth";

export const GET = handler(async () => {
  const user = await requireUser();
  const token = await githubTokenFor(user.id);
  if (!token) return json({ connected: false, repos: [] });
  const repos = await listRepos(token);
  return json({ connected: true, repos });
});

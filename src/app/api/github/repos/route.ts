import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listRepos } from "@/lib/github";

export const GET = handler(async () => {
  const user = await requireUser();
  if (!user.githubToken) return json({ connected: false, repos: [] });
  const repos = await listRepos(user.githubToken);
  return json({ connected: true, repos });
});

import { requireOrg } from "@/lib/auth";
import NewProject from "./NewProject";
import { githubConnected } from "@/lib/github-auth";

export const metadata = { title: "New project · Arc" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const { user } = await requireOrg();
  return <NewProject githubConnected={await githubConnected(user.id)} />;
}

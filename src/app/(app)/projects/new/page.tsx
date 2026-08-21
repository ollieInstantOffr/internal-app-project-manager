import { requireOrg } from "@/lib/auth";
import NewProject from "./NewProject";

export const metadata = { title: "New project · Arc" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const { user } = await requireOrg();
  return <NewProject githubConnected={!!user.githubToken} />;
}

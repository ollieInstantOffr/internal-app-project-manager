import { requireOrg } from "@/lib/auth";
import { loadProjectWorkspace } from "@/lib/queries";
import { Backlog } from "@/components/backlog/Backlog";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} backlog · Arc` };
}

export default async function BacklogPage({ params }: { params: Promise<{ key: string }> }) {
  const { org } = await requireOrg();
  const { key } = await params;
  const data = await loadProjectWorkspace(org.id, key);

  return (
    <Backlog
      project={data.project}
      initialIssues={data.issues}
      epics={data.epics}
      sprints={data.sprints}
      labels={data.labels}
    />
  );
}

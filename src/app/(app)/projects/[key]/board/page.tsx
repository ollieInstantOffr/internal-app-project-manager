import { requireOrg } from "@/lib/auth";
import { loadProjectWorkspace } from "@/lib/queries";
import { Board } from "@/components/board/Board";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} board · Arc` };
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ compose?: string }>;
}) {
  const { org } = await requireOrg();
  const { key } = await params;
  const { compose } = await searchParams;

  const data = await loadProjectWorkspace(org.id, key);

  return (
    <Board
      project={data.project}
      initialIssues={data.issues}
      epics={data.epics}
      sprints={data.sprints}
      labels={data.labels}
      activeSprint={data.activeSprint}
      composeSeed={compose}
    />
  );
}

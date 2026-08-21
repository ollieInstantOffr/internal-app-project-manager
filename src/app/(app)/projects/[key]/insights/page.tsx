import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeInsights } from "@/lib/insights";
import { Insights } from "@/components/insights/Insights";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} insights · Arc` };
}

export default async function ProjectInsightsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { org } = await requireOrg();
  const { key } = await params;

  const project = await db.project.findFirst({
    where: { orgId: org.id, key: key.toUpperCase() },
  });
  if (!project) notFound();

  const data = await computeInsights(org.id, project.id);
  return <Insights data={data} projectKey={project.key} scopeLabel={project.name} />;
}

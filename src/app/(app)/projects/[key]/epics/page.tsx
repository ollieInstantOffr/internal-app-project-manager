import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { ISSUE_INCLUDE } from "@/lib/issues";
import { serializeIssue } from "@/lib/serialize";
import { Epics } from "@/components/epics/Epics";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} epics · Arc` };
}

export default async function EpicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ epic?: string }>;
}) {
  const { org } = await requireOrg();
  const { key } = await params;
  const { epic } = await searchParams;

  const project = await db.project.findFirst({ where: { orgId: org.id, key: key.toUpperCase() } });
  if (!project) notFound();

  const [epics, unassigned] = await Promise.all([
    db.epic.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      include: {
        issues: { where: { archivedAt: null }, include: ISSUE_INCLUDE, orderBy: { rank: "asc" } },
      },
    }),
    db.issue.findMany({
      where: { projectId: project.id, epicId: null, archivedAt: null },
      include: ISSUE_INCLUDE,
      orderBy: { rank: "asc" },
    }),
  ]);

  return (
    <Epics
      project={{
        id: project.id,
        key: project.key,
        name: project.name,
        color: project.color,
        repoFullName: project.repoFullName,
      }}
      selectedId={epic}
      epics={epics.map((e) => ({
        id: e.id,
        key: e.key,
        name: e.name,
        description: e.description,
        color: e.color,
        status: e.status,
        startDate: e.startDate?.toISOString() ?? null,
        targetDate: e.targetDate?.toISOString() ?? null,
        issues: e.issues.map(serializeIssue),
      }))}
      unassigned={unassigned.map(serializeIssue)}
    />
  );
}

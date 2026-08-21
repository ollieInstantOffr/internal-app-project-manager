import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { RunView, type RunDetail } from "@/components/api/RunView";
import type { AssertionResult } from "@/components/api/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "API run · Arc" };

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; runId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { org } = await requireOrg();
  const { key, runId } = await params;
  const { from } = await searchParams;

  const project = await db.project.findFirst({
    where: { orgId: org.id, key: key.toUpperCase() },
  });
  if (!project) notFound();

  // `/runs/latest` is what the ⌘⇧I shortcut targets before a run id is known.
  const resolvedId =
    runId === "latest"
      ? (
          await db.apiRun.findFirst({
            where: { projectId: project.id },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
        )?.id
      : runId;

  if (!resolvedId) redirect(`/projects/${project.key}/api`);

  const run = await db.apiRun.findFirst({
    where: { id: resolvedId, projectId: project.id },
    include: {
      environment: true,
      collection: true,
      triggeredBy: { select: { name: true, avatarHue: true } },
      results: {
        orderBy: { createdAt: "asc" },
        include: { issue: { select: { key: true, title: true } } },
      },
    },
  });
  if (!run) notFound();

  const previous = await db.apiRun.findFirst({
    where: {
      projectId: project.id,
      collectionId: run.collectionId,
      createdAt: { lt: run.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { failed: true, environment: { select: { name: true } } },
  });

  const [epics, sprints, labels] = await Promise.all([
    db.epic.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    db.sprint.findMany({
      where: { projectId: project.id, status: { not: "COMPLETED" } },
      orderBy: { number: "desc" },
      select: { id: true, name: true },
    }),
    db.label.findMany({ where: { projectId: project.id }, select: { id: true, name: true } }),
  ]);

  const detail: RunDetail = {
    id: run.id,
    passed: run.passed,
    failed: run.failed,
    p95Ms: run.p95Ms,
    requestCount: run.requestCount,
    createdAt: run.createdAt.toISOString(),
    projectId: project.id,
    environmentId: run.environmentId,
    environment: run.environment
      ? { name: run.environment.name, kind: run.environment.kind, prNumber: run.environment.prNumber }
      : null,
    collection: run.collection ? { id: run.collection.id, name: run.collection.name } : null,
    triggeredBy: run.triggeredBy,
    results: run.results.map((r) => ({
      id: r.id,
      name: r.name,
      method: r.method,
      url: r.url,
      requestBody: r.requestBody,
      status: r.status,
      statusText: r.statusText,
      durationMs: r.durationMs,
      sizeBytes: r.sizeBytes,
      responseBody: r.responseBody,
      error: r.error,
      assertions: r.assertions as AssertionResult[] | null,
      passedCount: r.passedCount,
      failedCount: r.failedCount,
      issue: r.issue,
    })),
  };

  return (
    <RunView
      run={detail}
      previous={
        previous ? { failed: previous.failed, environmentName: previous.environment?.name ?? null } : null
      }
      projectKey={project.key}
      epics={epics}
      sprints={sprints}
      labels={labels}
      openResultId={from}
    />
  );
}

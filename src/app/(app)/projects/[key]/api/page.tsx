import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDefaultEnvironments } from "@/lib/api-console/sync";
import { appUrl } from "@/lib/app-url";
import { ApiConsole } from "@/components/api/ApiConsole";
import type { ConsoleState } from "@/components/api/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} API console · Arc` };
}

export default async function ApiConsolePage({ params }: { params: Promise<{ key: string }> }) {
  const { org } = await requireOrg();
  const { key } = await params;

  const project = await db.project.findFirst({
    where: { orgId: org.id, key: key.toUpperCase() },
  });
  if (!project) notFound();

  await ensureDefaultEnvironments(project.id, appUrl());

  const [collections, environments, latestRun] = await Promise.all([
    db.apiCollection.findMany({
      where: { projectId: project.id },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: { requests: { orderBy: [{ position: "asc" }, { name: "asc" }] } },
    }),
    db.apiEnvironment.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } }),
    db.apiRun.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      include: { results: true, environment: true },
    }),
  ]);

  const failing = new Set(
    (latestRun?.results ?? []).filter((r) => r.failedCount > 0 || r.error).map((r) => r.requestId),
  );

  const state: ConsoleState = {
    project: {
      id: project.id,
      key: project.key,
      name: project.name,
      repoFullName: project.repoFullName,
    },
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      source: c.source,
      repoPath: c.repoPath,
      requests: c.requests.map((r) => ({
        id: r.id,
        name: r.name,
        method: r.method,
        path: r.path,
        body: r.body,
        headers: r.headers as Record<string, string> | null,
        params: r.params as Record<string, string> | null,
        assertions: r.assertions,
        failing: failing.has(r.id),
      })),
    })),
    environments: environments.map((e) => ({
      id: e.id,
      name: e.name,
      baseUrl: e.baseUrl,
      kind: e.kind,
      prNumber: e.prNumber,
      color: e.color,
      variables: e.variables as Record<string, string> | null,
    })),
    latestRun: latestRun
      ? {
          id: latestRun.id,
          passed: latestRun.passed,
          failed: latestRun.failed,
          p95Ms: latestRun.p95Ms,
          requestCount: latestRun.requestCount,
          createdAt: latestRun.createdAt.toISOString(),
          environmentName: latestRun.environment?.name ?? null,
          collectionId: latestRun.collectionId,
        }
      : null,
  };

  return <ApiConsole initial={state} />;
}

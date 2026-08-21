import { db } from "@/lib/db";
import { handler, json, requireApiContext, projectInOrg } from "@/lib/api";
import { maskEnvironment } from "@/lib/api-console/sync";

type Ctx = { params: Promise<{ key: string }> };

/** Everything the console needs in one round-trip. */
export const GET = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { key } = await params;
  const project = await projectInOrg(ctx.orgId, key);

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
      include: { results: { orderBy: { createdAt: "asc" } }, environment: true },
    }),
  ]);

  // Which requests failed last time — the console shows a dot beside them.
  const failing = new Set(
    (latestRun?.results ?? []).filter((r) => r.failedCount > 0 || r.error).map((r) => r.requestId),
  );

  return json({
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
        headers: r.headers,
        params: r.params,
        assertions: r.assertions,
        skipAuth: r.skipAuth,
        failing: failing.has(r.id),
      })),
    })),
    environments: environments.map(maskEnvironment),
    latestRun: latestRun
      ? {
          id: latestRun.id,
          passed: latestRun.passed,
          failed: latestRun.failed,
          p95Ms: latestRun.p95Ms,
          requestCount: latestRun.requestCount,
          createdAt: latestRun.createdAt,
          environmentName: latestRun.environment?.name ?? null,
          collectionId: latestRun.collectionId,
        }
      : null,
  });
});

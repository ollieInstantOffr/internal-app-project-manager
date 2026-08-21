import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { sendSchema } from "@/lib/api-console/validators";
import { executeRequest } from "@/lib/api-console/runner";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Sends a single request and records it as a one-request run, so every send
 * appears in history and can be turned into an issue.
 */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id } = await params;

  const request = await db.apiRequest.findFirst({
    where: { id, collection: { project: { orgId: ctx.orgId } } },
    include: { collection: true },
  });
  if (!request) return fail(404, "Request not found");

  const { environmentId, overrides } = await parseBody(req, sendSchema);
  const environment = await db.apiEnvironment.findFirst({
    where: { id: environmentId, projectId: request.collection.projectId },
  });
  if (!environment) return fail(404, "Environment not found");

  const merged = {
    name: overrides?.name ?? request.name,
    method: overrides?.method ?? request.method,
    path: overrides?.path ?? request.path,
    body: overrides?.body !== undefined ? overrides.body : request.body,
    headers: (overrides?.headers ?? request.headers) as Record<string, string> | null,
    params: (overrides?.params ?? request.params) as Record<string, string> | null,
    assertions: overrides?.assertions !== undefined ? overrides.assertions : request.assertions,
  };

  const result = await executeRequest({
    ...merged,
    baseUrl: environment.baseUrl,
    variables: (environment.variables as Record<string, string> | null) ?? {},
  });

  const run = await db.apiRun.create({
    data: {
      projectId: request.collection.projectId,
      environmentId: environment.id,
      collectionId: request.collectionId,
      triggeredById: ctx.userId,
      passed: result.failedCount === 0 && !result.error ? 1 : 0,
      failed: result.failedCount > 0 || result.error ? 1 : 0,
      requestCount: 1,
      p95Ms: result.durationMs,
      results: {
        create: {
          requestId: request.id,
          name: result.name,
          method: result.method,
          url: result.url,
          requestBody: result.requestBody,
          status: result.status,
          statusText: result.statusText,
          durationMs: result.durationMs,
          sizeBytes: result.sizeBytes,
          responseBody: result.responseBody,
          responseHeaders: result.responseHeaders as never,
          error: result.error,
          assertions: result.assertions as never,
          passedCount: result.passedCount,
          failedCount: result.failedCount,
        },
      },
    },
    include: { results: true },
  });

  return json({ ok: true, result, resultId: run.results[0].id, runId: run.id });
});

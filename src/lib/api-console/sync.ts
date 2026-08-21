import "server-only";
import { db } from "../db";
import { discoverApi } from "./discover";
import { RANK_STEP } from "../rank";

export type SyncOutcome = {
  found: boolean;
  style: string;
  ref: string;
  apiRoots: string[];
  collections: number;
  requests: number;
  truncated: boolean;
};

/**
 * Rebuilds the repo-derived collections for a project from its `/api` folder.
 * Requests keep their id — and so their history — when the method and path are
 * unchanged, so re-syncing after a deploy doesn't discard assertions someone wrote.
 */
export async function syncCollectionsFromRepo(opts: {
  projectId: string;
  repoFullName: string;
  token: string;
}): Promise<SyncOutcome> {
  const discovery = await discoverApi(opts.token, opts.repoFullName);

  const outcome: SyncOutcome = {
    found: discovery.found,
    style: discovery.style,
    ref: discovery.ref,
    apiRoots: discovery.apiRoots,
    collections: 0,
    requests: 0,
    truncated: discovery.truncated,
  };
  if (!discovery.found) return outcome;

  const keptCollectionIds: string[] = [];

  for (const [index, discovered] of discovery.collections.entries()) {
    const collection = await db.apiCollection.upsert({
      where: { projectId_name: { projectId: opts.projectId, name: discovered.name } },
      create: {
        projectId: opts.projectId,
        name: discovered.name,
        source: "REPO",
        repoPath: discovered.repoPath,
        position: (index + 1) * RANK_STEP,
      },
      update: { source: "REPO", repoPath: discovered.repoPath, position: (index + 1) * RANK_STEP },
    });
    keptCollectionIds.push(collection.id);
    outcome.collections += 1;

    const existing = await db.apiRequest.findMany({ where: { collectionId: collection.id } });
    const keptRequestIds: string[] = [];

    for (const [i, request] of discovered.requests.entries()) {
      const match = existing.find((e) => e.method === request.method && e.path === request.path);

      if (match) {
        // Assertions and an edited body are the user's; a body that was never
        // filled in is still ours to improve on the next sync.
        const untouched = !match.body || match.body.replace(/\s/g, "") === "{}";
        await db.apiRequest.update({
          where: { id: match.id },
          data: {
            name: match.name || request.name,
            position: (i + 1) * RANK_STEP,
            ...(untouched && request.body ? { body: request.body } : {}),
            ...(match.headers ? {} : { headers: (request.headers ?? undefined) as never }),
            ...(match.params ? {} : { params: (request.params ?? undefined) as never }),
          },
        });
        keptRequestIds.push(match.id);
      } else {
        const created = await db.apiRequest.create({
          data: {
            collectionId: collection.id,
            name: request.name,
            method: request.method,
            path: request.path,
            body: request.body,
            headers: (request.headers ?? undefined) as never,
            params: (request.params ?? undefined) as never,
            assertions: request.assertions,
            position: (i + 1) * RANK_STEP,
          },
        });
        keptRequestIds.push(created.id);
      }
      outcome.requests += 1;
    }

    // Endpoints deleted from the repo shouldn't linger in the console.
    await db.apiRequest.deleteMany({
      where: { collectionId: collection.id, id: { notIn: keptRequestIds } },
    });
  }

  await db.apiCollection.deleteMany({
    where: { projectId: opts.projectId, source: "REPO", id: { notIn: keptCollectionIds } },
  });

  return outcome;
}

/** Every project starts with somewhere to point requests at. */
export async function ensureDefaultEnvironments(projectId: string, appUrl: string) {
  const count = await db.apiEnvironment.count({ where: { projectId } });
  if (count > 0) return;

  // Imported requests reference $env.API_TOKEN, so the slot exists from the start.
  const variables = { API_TOKEN: "", WEBHOOK_SIGNATURE: "" };

  await db.apiEnvironment.createMany({
    data: [
      {
        projectId,
        name: "local",
        baseUrl: "http://localhost:3321",
        color: "green",
        variables,
      },
      { projectId, name: "staging", baseUrl: appUrl, color: "amber", variables },
    ],
    skipDuplicates: true,
  });
}

import "server-only";
import { db } from "../db";
import { HttpError } from "../auth";
import { getFileContext, getRepoTree } from "../repo";
import { githubTokenFor } from "../github-auth";
import type { ToolContext } from "./tools";

/**
 * Repository reads borrow the GitHub token of the person who connected the
 * assistant — an agent never holds credentials of its own.
 */
async function repoAccess(ctx: ToolContext, projectKey: string) {
  const project = await db.project.findFirst({
    where: {
      key: projectKey.toUpperCase(),
      ...(ctx.projectIds.length ? { id: { in: ctx.projectIds } } : {}),
      orgId: ctx.orgId,
    },
  });
  if (!project) throw new HttpError(404, `No project ${projectKey.toUpperCase()} you can see`);
  if (!project.repoFullName) throw new HttpError(400, `${project.key} has no repository connected`);

  const token = await githubTokenFor(ctx.ownerId);
  if (!token) {
    throw new HttpError(
      400,
      "Repository access needs the GitHub connection of the person who set this assistant up",
    );
  }

  return { project, repo: project.repoFullName, token };
}

export async function listRepoFiles(ctx: ToolContext, projectKey: string, path: string) {
  const { repo, token } = await repoAccess(ctx, projectKey);
  const tree = await getRepoTree(repo, token);

  const prefix = path.replace(/^\/+|\/+$/g, "");
  const paths = prefix ? tree.paths.filter((p) => p.startsWith(`${prefix}/`)) : tree.paths;
  if (!paths.length) return { text: `Nothing under "${prefix || "/"}" in ${repo}.` };

  const shown = paths.slice(0, 400);
  const more = paths.length - shown.length;
  return {
    text: [
      `${repo} @ ${tree.ref} — ${paths.length} files`,
      ...shown,
      more > 0 ? `… and ${more} more` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function readRepoFile(ctx: ToolContext, projectKey: string, path: string) {
  const { project, repo, token } = await repoAccess(ctx, projectKey);
  const tree = await getRepoTree(repo, token);

  const file = await getFileContext({
    orgId: ctx.orgId,
    projectId: project.id,
    repo,
    token,
    path: path.replace(/^\/+/, ""),
    ref: tree.ref,
  });

  if (file.content === null) return { text: `${path} is binary or too large to read.` };

  return { text: `${repo}/${path} @ ${tree.ref}\n\n${file.content}` };
}

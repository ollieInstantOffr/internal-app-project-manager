import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { db } from "./db";
import { getOrgContext, HttpError, sha256, assertRole } from "./auth";
import { Role } from "./types";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data as object, init);
}

export function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Wraps a route handler with uniform error → HTTP mapping. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      if (err instanceof ZodError) {
        return fail(422, "Validation failed", {
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      console.error("[api]", err);
      return fail(500, "Something went wrong");
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body");
  }
  return schema.parse(raw);
}

export type ApiContext = {
  userId: string;
  orgId: string;
  role: Role;
  viaToken: boolean;
};

/**
 * Resolves the caller from either a session cookie or an `Authorization: Bearer arc_…`
 * API token, so the same routes back the UI and the public API.
 */
export async function requireApiContext(req: Request, min: Role = Role.MEMBER): Promise<ApiContext> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const raw = auth.slice(7).trim();
    const token = await db.apiToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!token || token.revokedAt) throw new HttpError(401, "Invalid API token");
    const membership = await db.membership.findUnique({
      where: { userId_orgId: { userId: token.userId, orgId: token.orgId } },
    });
    if (!membership) throw new HttpError(403, "Token owner is no longer a member");
    assertRole(membership.role, min);
    await db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
    return { userId: token.userId, orgId: token.orgId, role: membership.role, viaToken: true };
  }

  const ctx = await getOrgContext();
  if (!ctx) throw new HttpError(401, "Not signed in");
  if (!ctx.org) throw new HttpError(400, "No organization selected");
  assertRole(ctx.role, min);
  return { userId: ctx.user.id, orgId: ctx.org.id, role: ctx.role as Role, viaToken: false };
}

/** Confirms a project belongs to the caller's org and returns it. */
export async function projectInOrg(orgId: string, idOrKey: string) {
  const project = await db.project.findFirst({
    where: { orgId, OR: [{ id: idOrKey }, { key: idOrKey.toUpperCase() }] },
  });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

/** Confirms an issue belongs to the caller's org and returns it. */
export async function issueInOrg(orgId: string, idOrKey: string) {
  const issue = await db.issue.findFirst({
    where: { project: { orgId }, OR: [{ id: idOrKey }, { key: idOrKey.toUpperCase() }] },
    include: { project: true },
  });
  if (!issue) throw new HttpError(404, "Issue not found");
  return issue;
}

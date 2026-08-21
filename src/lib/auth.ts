import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { db } from "./db";
import { Role } from "./types";

const SESSION_COOKIE = "arc_session";
const ORG_COOKIE = "arc_org";
const SESSION_DAYS = 30;

/* ── passwords ─────────────────────────────────────────────── */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const derived = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(hashHex, "hex");
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ── tokens ────────────────────────────────────────────────── */

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/* ── sessions ──────────────────────────────────────────────── */

export async function createSession(userId: string, userAgent?: string) {
  const raw = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.session.create({
    data: { token: sha256(raw), userId, userAgent: userAgent?.slice(0, 200), expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return raw;
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await db.session.deleteMany({ where: { token: sha256(raw) } });
  jar.delete(SESSION_COOKIE);
  jar.delete(ORG_COOKIE);
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await db.session.findUnique({
    where: { token: sha256(raw) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/* ── org context ───────────────────────────────────────────── */

export async function setActiveOrg(orgId: string) {
  const jar = await cookies();
  jar.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export const getOrgContext = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const jar = await cookies();
  const preferred = jar.get(ORG_COOKIE)?.value;

  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return { user, org: null, role: null, memberships: [] };

  const active = memberships.find((m) => m.orgId === preferred) ?? memberships[0];
  return { user, org: active.org, role: active.role, memberships };
});

export async function requireOrg() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/login");
  if (!ctx.org) redirect("/onboarding/organization");
  return { user: ctx.user, org: ctx.org, role: ctx.role as Role, memberships: ctx.memberships };
}

/* ── permissions ───────────────────────────────────────────── */

const RANK: Record<Role, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function atLeast(role: Role | null | undefined, min: Role) {
  return !!role && RANK[role] >= RANK[min];
}

export function assertRole(role: Role | null | undefined, min: Role) {
  if (!atLeast(role, min)) {
    throw new HttpError(403, `Requires ${min.toLowerCase()} permissions`);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

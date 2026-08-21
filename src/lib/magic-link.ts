import "server-only";
import { db } from "./db";
import { randomToken, sha256 } from "./auth";
import { sendMail } from "./mail";
import { magicLinkTemplate } from "./email/templates";
import { hueFor } from "./constants";
import { appUrl } from "./app-url";

export const LINK_MINUTES = 15;

/** How many links one address may request before it has to wait. */
const MAX_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

export type MagicLinkOutcome =
  | { ok: true; isNew: boolean; devLink?: string }
  | { ok: false; reason: "rate-limited" };

/**
 * Issues a single-use sign-in link. Unknown addresses get an account created in
 * an unverified state — nobody can sign in until the emailed link is opened, so
 * this can't be used to take over an address.
 */
export async function requestMagicLink(opts: {
  email: string;
  name?: string;
  redirectTo?: string;
  requestIp?: string | null;
}): Promise<MagicLinkOutcome> {
  const existing = await db.user.findUnique({ where: { email: opts.email } });

  if (existing) {
    const recent = await db.magicLink.count({
      where: {
        userId: existing.id,
        createdAt: { gt: new Date(Date.now() - WINDOW_MINUTES * 60_000) },
      },
    });
    if (recent >= MAX_PER_WINDOW) return { ok: false, reason: "rate-limited" };
  }

  const user =
    existing ??
    (await db.user.create({
      data: {
        email: opts.email,
        name: opts.name?.trim() || deriveName(opts.email),
        avatarHue: hueFor(opts.email),
        prefs: { create: {} },
      },
    }));

  // A name supplied at sign-up shouldn't overwrite one they've already set.
  if (existing && opts.name && !existing.emailVerified) {
    await db.user.update({ where: { id: user.id }, data: { name: opts.name.trim() } });
  }

  const raw = randomToken();
  await db.magicLink.create({
    data: {
      token: sha256(raw),
      userId: user.id,
      redirectTo: opts.redirectTo ?? null,
      requestIp: opts.requestIp ?? null,
      expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000),
    },
  });

  const result = await sendMail({
    to: user.email,
    ...magicLinkTemplate({
      name: user.name,
      token: raw,
      isNew: !existing?.emailVerified,
      minutes: LINK_MINUTES,
    }),
  });

  // With no mail provider configured there would be no way in at all, so hand the
  // link back for local development. Never reachable once RESEND_API_KEY is set.
  const devLink =
    result.skipped && !process.env.RESEND_API_KEY ? appUrl(`/auth/verify?token=${raw}`) : undefined;
  if (devLink) console.info(`[magic-link] no mail provider configured — sign in at ${devLink}`);

  return { ok: true, isNew: !existing, devLink };
}

export type ConsumeResult =
  | { ok: true; userId: string; redirectTo: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/** Validates and burns a link. Any outcome other than success leaves no session. */
export async function consumeMagicLink(raw: string): Promise<ConsumeResult> {
  const link = await db.magicLink.findUnique({ where: { token: sha256(raw) } });
  if (!link) return { ok: false, reason: "invalid" };
  if (link.usedAt) return { ok: false, reason: "used" };
  if (link.expiresAt < new Date()) return { ok: false, reason: "expired" };

  await db.$transaction([
    db.magicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: link.userId },
      data: { emailVerified: new Date() },
    }),
    // Opening a fresh link retires any other outstanding ones for that account.
    db.magicLink.updateMany({
      where: { userId: link.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, userId: link.userId, redirectTo: link.redirectTo };
}

function deriveName(email: string) {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase()) || "There";
}

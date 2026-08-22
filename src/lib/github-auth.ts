import "server-only";
import { db } from "./db";

/** Refresh a little early, so a call that takes a moment can't straddle expiry. */
const SKEW_SECONDS = 120;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

/**
 * Turns a GitHub token response into the fields we store. GitHub Apps with
 * "Expire user access tokens" on return an expiry and a refresh token; OAuth
 * Apps return neither, and their tokens simply don't expire — a null expiry
 * means "never refresh".
 */
export function tokenFields(json: TokenResponse) {
  const now = Date.now();
  return {
    githubToken: json.access_token ?? null,
    githubRefreshToken: json.refresh_token ?? null,
    githubTokenExpiresAt: json.expires_in ? new Date(now + json.expires_in * 1000) : null,
    githubRefreshExpiresAt: json.refresh_token_expires_in
      ? new Date(now + json.refresh_token_expires_in * 1000)
      : null,
  };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  return (await res.json()) as TokenResponse;
}

type TokenRow = {
  id: string;
  githubToken: string | null;
  githubRefreshToken: string | null;
  githubTokenExpiresAt: Date | null;
  githubRefreshExpiresAt: Date | null;
};

const SELECT = {
  id: true,
  githubToken: true,
  githubRefreshToken: true,
  githubTokenExpiresAt: true,
  githubRefreshExpiresAt: true,
} as const;

function expired(user: TokenRow) {
  if (!user.githubTokenExpiresAt) return false;
  return user.githubTokenExpiresAt.getTime() - SKEW_SECONDS * 1000 <= Date.now();
}

/**
 * A usable GitHub token for this person, refreshed if it was about to expire.
 * Returns null when they've never connected, or when the refresh token has
 * itself expired and they have to reconnect by hand.
 *
 * Everything that calls GitHub on a user's behalf should go through here rather
 * than reading `user.githubToken` — that field goes stale after eight hours on a
 * GitHub App that expires tokens, and the failure looks like a random bug.
 */
export async function githubTokenFor(userOrId: string | TokenRow): Promise<string | null> {
  const user =
    typeof userOrId === "string"
      ? await db.user.findUnique({ where: { id: userOrId }, select: SELECT })
      : userOrId;

  if (!user?.githubToken) return null;
  if (!expired(user)) return user.githubToken;

  if (!user.githubRefreshToken) {
    // Expired with nothing to refresh from: the connection is dead.
    await clearGithub(user.id);
    return null;
  }
  if (user.githubRefreshExpiresAt && user.githubRefreshExpiresAt.getTime() <= Date.now()) {
    await clearGithub(user.id);
    return null;
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.githubRefreshToken,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!json.access_token) {
    // A refused refresh is permanent — the grant was revoked or the token reused.
    console.error("[github] refresh failed", json.error, json.error_description);
    await clearGithub(user.id);
    return null;
  }

  const fields = tokenFields(json);
  await db.user.update({
    where: { id: user.id },
    data: {
      ...fields,
      // GitHub rotates the refresh token; keep the old one if it didn't send a new one.
      githubRefreshToken: fields.githubRefreshToken ?? user.githubRefreshToken,
      githubRefreshExpiresAt: fields.githubRefreshExpiresAt ?? user.githubRefreshExpiresAt,
    },
  });

  return fields.githubToken;
}

/** Forgets the connection so the UI offers "Connect GitHub" again. */
export async function clearGithub(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: {
      githubToken: null,
      githubRefreshToken: null,
      githubTokenExpiresAt: null,
      githubRefreshExpiresAt: null,
    },
  });
}

/** True when this person could call GitHub right now, refreshing if needed. */
export async function githubConnected(userId: string) {
  return (await githubTokenFor(userId)) !== null;
}

import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";
import { randomToken, sha256, HttpError } from "../auth";
import { appUrl } from "../app-url";
import { createAssistant } from "./assistants";

/**
 * OAuth 2.1 for the MCP server.
 *
 * Claude Code can send a custom header, so a static key is enough for it.
 * claude.ai and Cowork can't: they discover an authorization server and run a
 * code flow with PKCE, registering themselves first. This is that server.
 *
 * Everything it issues still resolves to an Assistant, so the trust ladder, the
 * action log and one-click revocation apply exactly as they do to a key someone
 * minted by hand — an OAuth connection is not a second, weaker way in.
 */

export const SCOPE = "mcp";
const CODE_TTL_MS = 10 * 60_000;
const TOKEN_TTL_MS = 30 * 24 * 3600_000;

export function issuer() {
  return appUrl().replace(/\/+$/, "");
}

/** RFC 8414 — how a client finds the endpoints. */
export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // PKCE only: there are no confidential clients here worth the name.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  };
}

/** RFC 9728 — what a 401 points at, so the client knows who to ask. */
export function protectedResourceMetadata() {
  const base = issuer();
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
  };
}

/** The header that turns a 401 into a discoverable one. */
export function wwwAuthenticate() {
  return `Bearer realm="Arc MCP", resource_metadata="${issuer()}/.well-known/oauth-protected-resource"`;
}

function verifyChallenge(verifier: string, challenge: string) {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}

/**
 * A redirect URI must match one the client registered, exactly. Anything looser
 * — prefix matching, ignoring the query — is how authorization codes end up
 * delivered to somebody else.
 */
export function redirectAllowed(registered: string[], candidate: string) {
  return registered.includes(candidate);
}

export async function registerClient(input: {
  name: string;
  redirectUris: string[];
  logoUri?: string | null;
  clientUri?: string | null;
  wantsSecret: boolean;
}) {
  if (!input.redirectUris.length) throw new HttpError(400, "At least one redirect_uri is required");
  for (const uri of input.redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new HttpError(400, `${uri} is not a valid redirect_uri`);
    }
    // http is allowed only for loopback, which is how desktop clients work.
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopback) {
      throw new HttpError(400, "redirect_uri must be https, or http on loopback");
    }
  }

  const clientId = `arc_client_${randomToken(16)}`;
  const secret = input.wantsSecret ? `arc_secret_${randomToken(24)}` : null;

  const client = await db.oAuthClient.create({
    data: {
      clientId,
      clientSecret: secret ? sha256(secret) : null,
      name: input.name.slice(0, 120),
      redirectUris: input.redirectUris,
      logoUri: input.logoUri ?? null,
      clientUri: input.clientUri ?? null,
    },
  });

  return { client, clientId, secret };
}

/**
 * Called once the person has said yes. Creates the assistant this connection
 * will act as — at READ_ONLY, like every other new assistant, so approving a
 * connector never hands out write access by itself.
 */
export async function grantCode(opts: {
  clientId: string;
  userId: string;
  orgId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
  assistantName: string;
}) {
  const client = await db.oAuthClient.findUnique({ where: { clientId: opts.clientId } });
  if (!client) throw new HttpError(400, "Unknown client");
  if (!redirectAllowed(client.redirectUris, opts.redirectUri)) {
    throw new HttpError(400, "redirect_uri does not match a registered one");
  }

  const { assistant } = await createAssistant({
    orgId: opts.orgId,
    createdById: opts.userId,
    name: opts.assistantName,
    client: "OTHER",
  });
  await db.assistant.update({
    where: { id: assistant.id },
    data: { oauthClientId: client.id },
  });

  const code = randomToken(24);
  await db.oAuthAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: client.id,
      userId: opts.userId,
      orgId: opts.orgId,
      assistantId: assistant.id,
      redirectUri: opts.redirectUri,
      codeChallenge: opts.codeChallenge,
      scope: opts.scope ?? SCOPE,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  return { code, assistant };
}

async function issueTokens(assistantId: string, clientDbId: string, scope: string) {
  const access = `arc_at_${randomToken(24)}`;
  const refresh = `arc_rt_${randomToken(24)}`;

  await db.oAuthAccessToken.create({
    data: {
      tokenHash: sha256(access),
      refreshHash: sha256(refresh),
      clientId: clientDbId,
      assistantId,
      scope,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: Math.floor(TOKEN_TTL_MS / 1000),
    scope,
  };
}

export async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  codeVerifier: string;
}) {
  const client = await db.oAuthClient.findUnique({ where: { clientId: opts.clientId } });
  if (!client) throw new HttpError(400, "invalid_client");
  if (client.clientSecret && sha256(opts.clientSecret ?? "") !== client.clientSecret) {
    throw new HttpError(401, "invalid_client");
  }

  const record = await db.oAuthAuthCode.findUnique({ where: { codeHash: sha256(opts.code) } });
  if (!record || record.clientId !== client.id) throw new HttpError(400, "invalid_grant");
  if (record.expiresAt < new Date()) throw new HttpError(400, "invalid_grant");
  if (record.redirectUri !== opts.redirectUri) throw new HttpError(400, "invalid_grant");
  if (!verifyChallenge(opts.codeVerifier, record.codeChallenge)) {
    throw new HttpError(400, "invalid_grant");
  }

  if (record.usedAt) {
    // A replayed code means it leaked. Everything it ever produced is burned.
    await db.oAuthAccessToken.updateMany({
      where: { assistantId: record.assistantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new HttpError(400, "invalid_grant");
  }

  await db.oAuthAuthCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return issueTokens(record.assistantId, client.id, record.scope);
}

export async function refresh(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string | null;
}) {
  const client = await db.oAuthClient.findUnique({ where: { clientId: opts.clientId } });
  if (!client) throw new HttpError(400, "invalid_client");
  if (client.clientSecret && sha256(opts.clientSecret ?? "") !== client.clientSecret) {
    throw new HttpError(401, "invalid_client");
  }

  const existing = await db.oAuthAccessToken.findUnique({
    where: { refreshHash: sha256(opts.refreshToken) },
  });
  if (!existing || existing.revokedAt || existing.clientId !== client.id) {
    throw new HttpError(400, "invalid_grant");
  }

  // Rotate: the old pair dies as the new one is born.
  await db.oAuthAccessToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return issueTokens(existing.assistantId, client.id, existing.scope);
}

/** Resolves an OAuth access token to the assistant it acts as. */
export async function assistantForAccessToken(token: string) {
  const record = await db.oAuthAccessToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { assistantId: true, revokedAt: true, expiresAt: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) return null;
  return record.assistantId;
}

export async function revokeToken(token: string) {
  const hash = sha256(token);
  await db.oAuthAccessToken.updateMany({
    where: { OR: [{ tokenHash: hash }, { refreshHash: hash }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

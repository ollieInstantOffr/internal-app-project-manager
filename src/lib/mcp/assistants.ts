import "server-only";
import { db } from "../db";
import { randomToken, sha256, HttpError } from "../auth";
import { hueFor } from "../constants";
import { Role } from "../types";

/** Assistant keys are visibly not people keys, so they're recognisable in a log. */
export function mintKey() {
  const raw = `arc_mcp_${randomToken(24)}`;
  return { raw, hash: sha256(raw), hint: `${raw.slice(0, 12)}…${raw.slice(-4)}` };
}

/**
 * Creates the assistant and the member row behind it. An agent is a named
 * member — its actions attribute to a real User, never to an anonymous key.
 */
export async function createAssistant(opts: {
  orgId: string;
  createdById: string;
  name: string;
  client: string;
}) {
  const key = mintKey();
  const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  const org = await db.organization.findUniqueOrThrow({
    where: { id: opts.orgId },
    select: { slug: true },
  });

  // A routable-looking address that can't receive mail, so it's never emailed.
  const email = `${slug}-${randomToken(4)}@agents.${org.slug}.arc.invalid`;

  const assistant = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: opts.name,
        email,
        isAgent: true,
        avatarHue: hueFor(opts.name),
      },
    });
    await tx.membership.create({
      data: { userId: user.id, orgId: opts.orgId, role: Role.MEMBER },
    });
    return tx.assistant.create({
      data: {
        orgId: opts.orgId,
        userId: user.id,
        name: opts.name,
        client: opts.client,
        tokenHash: key.hash,
        tokenHint: key.hint,
        createdById: opts.createdById,
      },
    });
  });

  // New assistants start on Read only until someone raises them.
  return { assistant, key: key.raw };
}

/** Revoking keeps the history: the actions and the member row stay put. */
export async function revokeAssistant(id: string, orgId: string) {
  const assistant = await db.assistant.findFirst({ where: { id, orgId } });
  if (!assistant) throw new HttpError(404, "Assistant not found");

  return db.assistant.update({
    where: { id },
    data: {
      revokedAt: new Date(),
      enabled: false,
      // Scramble the hash so the old key can never authenticate again.
      tokenHash: sha256(`revoked:${id}:${randomToken(16)}`),
    },
  });
}

/** Issues a fresh key for an existing assistant, keeping its level and log. */
export async function rotateKey(id: string, orgId: string) {
  const assistant = await db.assistant.findFirst({ where: { id, orgId } });
  if (!assistant) throw new HttpError(404, "Assistant not found");

  const key = mintKey();
  await db.assistant.update({
    where: { id },
    data: {
      tokenHash: key.hash,
      tokenHint: key.hint,
      revokedAt: null,
      enabled: true,
      lastSeenAt: null,
    },
  });
  return key.raw;
}

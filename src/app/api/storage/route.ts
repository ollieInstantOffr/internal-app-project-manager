import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { storageSettingsSchema } from "@/lib/validators";
import { encryptOptional, secretHint } from "@/lib/crypto";
import { HttpError } from "@/lib/auth";
import { Role } from "@/lib/types";

/** Never returns the secret — only whether one is stored, and its last four. */
function mask(config: {
  provider: string;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  verifiedAt: Date | null;
}) {
  return {
    provider: config.provider,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    prefix: config.prefix,
    accessKeyId: config.accessKeyId ? "set" : null,
    accessKeyHint: secretHint(config.accessKeyId),
    secretSet: !!config.secretAccessKey,
    secretHint: secretHint(config.secretAccessKey),
    verifiedAt: config.verifiedAt?.toISOString() ?? null,
  };
}

const EMPTY = {
  provider: "LOCAL" as const,
  bucket: null,
  region: null,
  endpoint: null,
  forcePathStyle: false,
  prefix: null,
  accessKeyId: null,
  secretAccessKey: null,
  verifiedAt: null,
};

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const config = await db.storageConfig.findUnique({ where: { orgId: ctx.orgId } });
  return json({ storage: mask(config ?? EMPTY) });
});

export const PATCH = handler(async (req: Request) => {
  // Where the org's files live is an admin decision.
  const ctx = await requireApiContext(req, Role.ADMIN);
  const body = await parseBody(req, storageSettingsSchema);

  const existing = await db.storageConfig.findUnique({ where: { orgId: ctx.orgId } });

  if (body.provider === "S3") {
    const keyId = body.accessKeyId ?? (existing?.accessKeyId ? "kept" : null);
    const secret = body.secretAccessKey ?? (existing?.secretAccessKey ? "kept" : null);
    if (!body.bucket) throw new HttpError(400, "A bucket name is required");
    if (!keyId || !secret) throw new HttpError(400, "Both an access key and a secret are required");
  }

  const data = {
    provider: body.provider,
    bucket: body.bucket || null,
    region: body.region || null,
    endpoint: body.endpoint || null,
    forcePathStyle: body.forcePathStyle ?? false,
    prefix: body.prefix || null,
    // Blank means keep what's stored, so the page never has to echo a secret
    // back just to save an unrelated field.
    ...(body.accessKeyId ? { accessKeyId: encryptOptional(body.accessKeyId) } : {}),
    ...(body.secretAccessKey ? { secretAccessKey: encryptOptional(body.secretAccessKey) } : {}),
    // Any change invalidates the last successful round trip.
    verifiedAt: null,
  };

  const config = await db.storageConfig.upsert({
    where: { orgId: ctx.orgId },
    create: { orgId: ctx.orgId, ...data },
    update: data,
  });

  return json({ ok: true, storage: mask(config) });
});

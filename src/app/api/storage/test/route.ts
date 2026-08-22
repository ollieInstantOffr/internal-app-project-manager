import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { storageSettingsSchema } from "@/lib/validators";
import { decryptSecret } from "@/lib/crypto";
import { normalisePrefix, probe } from "@/lib/storage/s3";
import { Role } from "@/lib/types";

/**
 * Round-trips a probe object against the bucket — write, read back, delete — so
 * a misconfiguration surfaces here rather than on somebody's first upload.
 *
 * Tests what is in the form, falling back to what is stored, so settings can be
 * checked before they are saved.
 */
export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const body = await parseBody(req, storageSettingsSchema.partial());
  const existing = await db.storageConfig.findUnique({ where: { orgId: ctx.orgId } });

  const accessKeyId = body.accessKeyId || decryptSecret(existing?.accessKeyId);
  const secretAccessKey = body.secretAccessKey || decryptSecret(existing?.secretAccessKey);
  const bucket = body.bucket ?? existing?.bucket ?? null;

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return json({ ok: false, step: "settings", message: "Fill in the bucket, key and secret first" });
  }

  const result = await probe({
    bucket,
    region: body.region || existing?.region || "us-east-1",
    endpoint: body.endpoint || existing?.endpoint || null,
    forcePathStyle: body.forcePathStyle ?? existing?.forcePathStyle ?? false,
    prefix: normalisePrefix(body.prefix ?? existing?.prefix),
    accessKeyId,
    secretAccessKey,
  });

  if (result.ok && existing) {
    await db.storageConfig.update({
      where: { orgId: ctx.orgId },
      data: { verifiedAt: new Date() },
    });
  }

  return json(result);
});

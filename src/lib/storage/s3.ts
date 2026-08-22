import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { db } from "../db";
import { decryptSecret } from "../crypto";
import { HttpError } from "../auth";

export type S3Settings = {
  bucket: string;
  region: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/**
 * Resolves an org's S3 settings, or null when it should use local disk.
 *
 * Returns null rather than throwing on a half-finished configuration, so a
 * missing key never takes uploads down — the org simply keeps writing to disk
 * until the settings are complete.
 */
export async function s3SettingsFor(orgId: string): Promise<S3Settings | null> {
  const config = await db.storageConfig.findUnique({ where: { orgId } });
  if (!config || config.provider !== "S3") return null;

  const accessKeyId = decryptSecret(config.accessKeyId);
  const secretAccessKey = decryptSecret(config.secretAccessKey);
  if (!config.bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket: config.bucket,
    region: config.region || "us-east-1",
    endpoint: config.endpoint || null,
    forcePathStyle: config.forcePathStyle,
    prefix: normalisePrefix(config.prefix),
    accessKeyId,
    secretAccessKey,
  };
}

/** No leading slash, exactly one trailing slash, or empty. */
export function normalisePrefix(prefix: string | null | undefined) {
  const trimmed = (prefix ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}

export function clientFor(settings: S3Settings) {
  return new S3Client({
    region: settings.region,
    // Anything other than AWS — R2, MinIO, Backblaze — arrives as an endpoint.
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    forcePathStyle: settings.forcePathStyle,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
}

export async function putObject(settings: S3Settings, key: string, body: Buffer, contentType: string) {
  const client = clientFor(settings);
  await client.send(
    new PutObjectCommand({
      Bucket: settings.bucket,
      Key: `${settings.prefix}${key}`,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(settings: S3Settings, key: string): Promise<Buffer> {
  const client = clientFor(settings);
  const result = await client.send(
    new GetObjectCommand({ Bucket: settings.bucket, Key: `${settings.prefix}${key}` }),
  );
  if (!result.Body) throw new HttpError(404, "That file is missing from the bucket");
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function deleteObject(settings: S3Settings, key: string) {
  const client = clientFor(settings);
  await client.send(
    new DeleteObjectCommand({ Bucket: settings.bucket, Key: `${settings.prefix}${key}` }),
  );
}

export type ProbeResult = { ok: true } | { ok: false; step: string; message: string };

/**
 * A real round trip — write, read back, delete — so a misconfiguration is found
 * on the settings screen rather than on somebody's first upload. Each step is
 * named, because "write worked, delete didn't" points straight at the policy.
 */
export async function probe(settings: S3Settings): Promise<ProbeResult> {
  const key = `${settings.prefix}.arc-connection-test-${Date.now()}`;
  const client = clientFor(settings);
  const payload = Buffer.from("arc storage check");

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: settings.bucket,
        Key: key,
        Body: payload,
        ContentType: "text/plain",
      }),
    );
  } catch (err) {
    return { ok: false, step: "write", message: reason(err) };
  }

  try {
    const result = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }));
    const bytes = Buffer.from(await result.Body!.transformToByteArray());
    if (!bytes.equals(payload)) {
      return { ok: false, step: "read", message: "The bucket returned different bytes" };
    }
  } catch (err) {
    return { ok: false, step: "read", message: reason(err) };
  }

  try {
    await client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
  } catch (err) {
    // Worth surfacing: without delete, removing an attachment leaves the object.
    return { ok: false, step: "delete", message: reason(err) };
  }

  return { ok: true };
}

function reason(err: unknown) {
  if (err instanceof Error) {
    const name = (err as { name?: string }).name;
    if (name === "NoSuchBucket") return "That bucket doesn't exist";
    if (name === "AccessDenied") return "The credentials were rejected for that action";
    if (name === "InvalidAccessKeyId") return "That access key isn't recognised";
    if (name === "SignatureDoesNotMatch") return "The secret key doesn't match the access key";
    return err.message;
  }
  return "Something went wrong";
}

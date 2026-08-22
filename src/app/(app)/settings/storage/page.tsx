import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { secretHint } from "@/lib/crypto";
import { Storage, type StorageSettings } from "@/components/settings/Storage";
import { Role } from "@/lib/types";

export const metadata = { title: "Storage · Arc" };
export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  const { org, role } = await requireOrg();
  if (role !== Role.OWNER && role !== Role.ADMIN) redirect("/settings/general");

  const [config, localCount, s3Count] = await Promise.all([
    db.storageConfig.findUnique({ where: { orgId: org.id } }),
    db.attachment.count({ where: { storage: "LOCAL", issue: { project: { orgId: org.id } } } }),
    db.attachment.count({ where: { storage: "S3", issue: { project: { orgId: org.id } } } }),
  ]);

  const settings: StorageSettings = {
    provider: config?.provider ?? "LOCAL",
    bucket: config?.bucket ?? null,
    region: config?.region ?? null,
    endpoint: config?.endpoint ?? null,
    forcePathStyle: config?.forcePathStyle ?? false,
    prefix: config?.prefix ?? null,
    // Only ever a hint; the values themselves stay encrypted on the server.
    accessKeyHint: secretHint(config?.accessKeyId),
    secretSet: !!config?.secretAccessKey,
    secretHint: secretHint(config?.secretAccessKey),
    verifiedAt: config?.verifiedAt?.toISOString() ?? null,
  };

  return <Storage settings={settings} localCount={localCount} s3Count={s3Count} />;
}

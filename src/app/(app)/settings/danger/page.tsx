import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { IssueStatus } from "@/lib/types";
import { Danger } from "@/components/settings/Danger";

export const metadata = { title: "Danger zone · Arc" };
export const dynamic = "force-dynamic";

export default async function DangerPage() {
  const { org } = await requireOrg();
  const doneCount = await db.issue.count({
    where: { project: { orgId: org.id }, status: IssueStatus.DONE, archivedAt: null },
  });
  return <Danger slug={org.slug} doneCount={doneCount} />;
}

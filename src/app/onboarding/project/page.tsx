import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/auth";
import { CountHeader } from "@/components/OnboardingHeader";
import FirstProject from "./FirstProject";

export const metadata = { title: "Create your first project · Arc" };

export default async function FirstProjectPage() {
  const { org, user } = await requireOrg();

  const existing = await db.project.count({ where: { orgId: org.id } });
  if (existing) redirect("/home");

  return (
    <>
      <CountHeader orgName={org.name} step={3} of={3} />
      <FirstProject githubConnected={!!user.githubToken} />
    </>
  );
}

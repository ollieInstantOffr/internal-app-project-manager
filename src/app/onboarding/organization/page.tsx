import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { StepHeader } from "@/components/OnboardingHeader";
import OrgForm from "./OrgForm";
import { githubConnected } from "@/lib/github-auth";

export const metadata = { title: "Name your organization · Arc" };

export default async function OrganizationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const membership = await db.membership.findFirst({ where: { userId: user.id } });
  if (membership) redirect("/home");

  return (
    <>
      <StepHeader current="organization" />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px",
        }}
      >
        <OrgForm
          suggestedName={user.name.split(" ")[0]}
          githubLogin={user.githubLogin}
          githubConnected={await githubConnected(user.id)}
        />
      </div>
    </>
  );
}

import { requireOrg } from "@/lib/auth";
import { StepHeader } from "@/components/OnboardingHeader";
import InviteForm from "./InviteForm";

export const metadata = { title: "Invite your team · Arc" };

export default async function InviteStepPage() {
  const { org } = await requireOrg();
  return (
    <>
      <StepHeader current="invite" skipHref="/onboarding/project" />
      <div
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}
      >
        <InviteForm orgName={org.name} />
      </div>
    </>
  );
}

import { requireOrg } from "@/lib/auth";
import { General } from "@/components/settings/General";

export const metadata = { title: "General settings · Arc" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const { org, user } = await requireOrg();
  return (
    <General
      org={{ name: org.name, slug: org.slug, githubOrg: org.githubOrg }}
      profile={{
        name: user.name,
        email: user.email,
        githubLogin: user.githubLogin,
        verified: !!user.emailVerified,
      }}
    />
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthAside } from "@/components/AuthChrome";
import MagicLinkForm from "@/components/MagicLinkForm";

export const metadata = { title: "Sign in · Arc" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/home");
  const { error, invite, next } = await searchParams;

  return (
    <main className="auth">
      <MagicLinkForm
        mode="signin"
        oauthError={error}
        redirectTo={invite ? `/invite/${invite}` : next}
      />
      <AuthAside />
    </main>
  );
}

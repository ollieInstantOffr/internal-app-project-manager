import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthAside } from "@/components/AuthChrome";
import MagicLinkForm from "@/components/MagicLinkForm";

export const metadata = { title: "Create your account · Arc" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/home");
  const { invite, next } = await searchParams;

  return (
    <main className="auth">
      <MagicLinkForm mode="signup" redirectTo={invite ? `/invite/${invite}` : next} />
      <AuthAside />
    </main>
  );
}

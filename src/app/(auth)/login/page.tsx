import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthAside } from "@/components/AuthChrome";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · Arc" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/home");
  const { error } = await searchParams;

  return (
    <main className="auth">
      <LoginForm oauthError={error} />
      <AuthAside />
    </main>
  );
}

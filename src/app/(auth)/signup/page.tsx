import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthAside } from "@/components/AuthChrome";
import SignupForm from "./SignupForm";

export const metadata = { title: "Create your account · Arc" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/home");
  return (
    <main className="auth">
      <SignupForm />
      <AuthAside />
    </main>
  );
}

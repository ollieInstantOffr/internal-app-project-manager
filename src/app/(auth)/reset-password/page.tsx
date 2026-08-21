import { AuthAside } from "@/components/AuthChrome";
import ResetForm from "./ResetForm";

export const metadata = { title: "Choose a new password · Arc" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth">
      <ResetForm token={token ?? ""} />
      <AuthAside />
    </main>
  );
}

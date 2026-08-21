import { AuthAside } from "@/components/AuthChrome";
import ForgotForm from "./ForgotForm";

export const metadata = { title: "Reset your password · Arc" };

export default function ForgotPasswordPage() {
  return (
    <main className="auth">
      <ForgotForm />
      <AuthAside />
    </main>
  );
}

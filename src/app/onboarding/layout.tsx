import { requireUser } from "@/lib/auth";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>{children}</div>;
}

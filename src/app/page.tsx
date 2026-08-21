import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The front door. Sends you wherever you actually belong: the app if you're
 * signed in and set up, the next onboarding step if you aren't yet, otherwise
 * sign-in.
 */
export default async function RootPage() {
  const ctx = await getOrgContext();

  if (!ctx) redirect("/login");
  if (!ctx.org) redirect("/onboarding/organization");
  redirect("/home");
}

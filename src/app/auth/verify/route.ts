import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { consumeMagicLink } from "@/lib/magic-link";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/**
 * A route handler rather than a page: signing in has to set a cookie, and Next
 * only allows that from a handler or an action, never during a render.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(appUrl("/login?error=link_missing"));

  const result = await consumeMagicLink(token);
  if (!result.ok) {
    return NextResponse.redirect(appUrl(`/login?error=link_${result.reason}`));
  }

  await createSession(result.userId, req.headers.get("user-agent") ?? undefined);

  if (result.redirectTo) return NextResponse.redirect(appUrl(result.redirectTo));

  const membership = await db.membership.findFirst({ where: { userId: result.userId } });
  return NextResponse.redirect(appUrl(membership ? "/home" : "/onboarding/organization"));
}

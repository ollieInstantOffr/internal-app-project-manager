import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomToken } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";

export async function GET(req: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(appUrl("/login?error=github_not_configured"));
  }

  const url = new URL(req.url);
  const intent = url.searchParams.get("intent") ?? "signin";

  const state = randomToken(16);
  const jar = await cookies();
  jar.set("arc_oauth_state", `${state}:${intent}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: 600,
  });

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", appUrl("/api/auth/github/callback"));
  authorize.searchParams.set("scope", "read:user user:email repo");
  authorize.searchParams.set("state", state);

  return NextResponse.redirect(authorize.toString());
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { hueFor } from "@/lib/constants";
import { appUrl } from "@/lib/app-url";

type GhUser = { id: number; login: string; name: string | null; email: string | null };
type GhEmail = { email: string; primary: boolean; verified: boolean };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const stored = jar.get("arc_oauth_state")?.value;
  jar.delete("arc_oauth_state");

  if (!code || !state || !stored || stored.split(":")[0] !== state) {
    return NextResponse.redirect(appUrl("/login?error=oauth_state"));
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: appUrl("/api/auth/github/callback"),
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) return NextResponse.redirect(appUrl("/login?error=oauth_token"));

  const gh = { authorization: `Bearer ${accessToken}`, accept: "application/vnd.github+json" };
  const profile = (await (await fetch("https://api.github.com/user", { headers: gh })).json()) as GhUser;

  let email = profile.email;
  if (!email) {
    const emails = (await (
      await fetch("https://api.github.com/user/emails", { headers: gh })
    ).json()) as GhEmail[];
    email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
  }
  if (!email) return NextResponse.redirect(appUrl("/login?error=oauth_email"));

  const normalized = email.toLowerCase();

  let user = await db.user.findFirst({
    where: { OR: [{ githubId: String(profile.id) }, { email: normalized }] },
  });

  if (user) {
    user = await db.user.update({
      where: { id: user.id },
      data: {
        githubId: String(profile.id),
        githubLogin: profile.login,
        githubToken: accessToken,
        emailVerified: user.emailVerified ?? new Date(),
      },
    });
  } else {
    user = await db.user.create({
      data: {
        email: normalized,
        name: profile.name || profile.login,
        githubId: String(profile.id),
        githubLogin: profile.login,
        githubToken: accessToken,
        emailVerified: new Date(),
        avatarHue: hueFor(normalized),
        prefs: { create: {} },
      },
    });
  }

  await createSession(user.id, req.headers.get("user-agent") ?? undefined);

  const membership = await db.membership.findFirst({ where: { userId: user.id } });
  if (membership) return NextResponse.redirect(appUrl("/home"));

  const invite = await db.invite.findFirst({
    where: { email: normalized, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  return NextResponse.redirect(
    invite ? appUrl(`/invite/${invite.token}`) : appUrl("/onboarding/organization"),
  );
}

import { db } from "@/lib/db";
import { handler, json, parseBody, fail } from "@/lib/api";
import { magicLinkSchema } from "@/lib/validators";
import { requestMagicLink, LINK_MINUTES } from "@/lib/magic-link";

export const POST = handler(async (req: Request) => {
  const { email, name, redirectTo } = await parseBody(req, magicLinkSchema);

  // If they were invited, send them back to the invite after signing in.
  let destination = redirectTo;
  if (!destination) {
    const invite = await db.invite.findFirst({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (invite) destination = `/invite/${invite.token}`;
  }

  const result = await requestMagicLink({
    email,
    name,
    redirectTo: destination,
    requestIp: req.headers.get("x-forwarded-for"),
  });

  if (!result.ok) {
    return fail(429, "Too many sign-in links requested. Try again in a few minutes.");
  }

  return json({ ok: true, minutes: LINK_MINUTES, devLink: result.devLink });
});

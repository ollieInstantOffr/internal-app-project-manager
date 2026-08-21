import { db } from "@/lib/db";
import { handler, json, parseBody, fail } from "@/lib/api";
import { loginSchema } from "@/lib/validators";
import { createSession, verifyPassword } from "@/lib/auth";

export const POST = handler(async (req: Request) => {
  const { email, password } = await parseBody(req, loginSchema);

  const user = await db.user.findUnique({
    where: { email },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });

  // Same message either way, so this can't be used to enumerate accounts.
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return fail(401, "That email and password don't match");
  }

  await createSession(user.id, req.headers.get("user-agent") ?? undefined);

  return json({
    ok: true,
    next: user.memberships.length ? "/home" : "/onboarding/organization",
  });
});

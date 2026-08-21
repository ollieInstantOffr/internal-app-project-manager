import { db } from "@/lib/db";
import { handler, json, parseBody, fail } from "@/lib/api";
import { signupSchema } from "@/lib/validators";
import { createSession, hashPassword, randomToken } from "@/lib/auth";
import { VerificationPurpose } from "@/lib/types";
import { sendMail } from "@/lib/mail";
import { verifyEmailTemplate } from "@/lib/email/templates";
import { hueFor } from "@/lib/constants";

export const POST = handler(async (req: Request) => {
  const { name, email, password } = await parseBody(req, signupSchema);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return fail(409, "An account with that email already exists");

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: hashPassword(password),
      avatarHue: hueFor(email),
      prefs: { create: {} },
    },
  });

  const token = randomToken();
  await db.verificationToken.create({
    data: {
      token,
      purpose: VerificationPurpose.EMAIL_VERIFY,
      userId: user.id,
      expiresAt: new Date(Date.now() + 864e5),
    },
  });
  await sendMail({ to: user.email, ...verifyEmailTemplate(user.name, token) });

  await createSession(user.id, req.headers.get("user-agent") ?? undefined);

  // An invited teammate already has an org waiting; everyone else names one.
  const pendingInvite = await db.invite.findFirst({
    where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });

  return json({
    ok: true,
    next: pendingInvite ? `/invite/${pendingInvite.token}` : "/onboarding/organization",
  });
});

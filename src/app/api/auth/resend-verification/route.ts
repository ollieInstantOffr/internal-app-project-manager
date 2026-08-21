import { db } from "@/lib/db";
import { handler, json } from "@/lib/api";
import { getCurrentUser, randomToken } from "@/lib/auth";
import { VerificationPurpose } from "@/lib/types";
import { sendMail } from "@/lib/mail";
import { verifyEmailTemplate } from "@/lib/email/templates";

export const POST = handler(async () => {
  const user = await getCurrentUser();
  if (!user) return json({ ok: true });
  if (user.emailVerified) return json({ ok: true, alreadyVerified: true });

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
  return json({ ok: true });
});

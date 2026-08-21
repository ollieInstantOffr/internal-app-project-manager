import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, parseBody } from "@/lib/api";
import { email } from "@/lib/validators";
import { randomToken } from "@/lib/auth";
import { VerificationPurpose } from "@/lib/types";
import { sendMail } from "@/lib/mail";
import { resetPasswordTemplate } from "@/lib/email/templates";

export const POST = handler(async (req: Request) => {
  const body = await parseBody(req, z.object({ email }));
  const user = await db.user.findUnique({ where: { email: body.email } });

  if (user) {
    const token = randomToken();
    await db.verificationToken.create({
      data: {
        token,
        purpose: VerificationPurpose.PASSWORD_RESET,
        userId: user.id,
        expiresAt: new Date(Date.now() + 36e5),
      },
    });
    await sendMail({ to: user.email, ...resetPasswordTemplate(user.name, token) });
  }

  // Always the same answer — an unknown address must look identical to a known one.
  return json({ ok: true });
});

import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, parseBody, fail } from "@/lib/api";
import { password } from "@/lib/validators";
import { createSession, hashPassword } from "@/lib/auth";
import { VerificationPurpose } from "@/lib/types";

export const POST = handler(async (req: Request) => {
  const { token, password: next } = await parseBody(
    req,
    z.object({ token: z.string().min(1), password }),
  );

  const record = await db.verificationToken.findUnique({ where: { token }, include: { user: true } });
  if (
    !record ||
    record.purpose !== VerificationPurpose.PASSWORD_RESET ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    return fail(400, "That reset link has expired — request a new one");
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash: hashPassword(next) },
    }),
    db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Every other session is invalidated when a password changes.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  await createSession(record.userId, req.headers.get("user-agent") ?? undefined);

  const membership = await db.membership.findFirst({ where: { userId: record.userId } });
  return json({ ok: true, next: membership ? "/home" : "/onboarding/organization" });
});

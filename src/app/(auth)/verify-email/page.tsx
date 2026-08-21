import Link from "next/link";
import { db } from "@/lib/db";
import { VerificationPurpose } from "@/lib/types";
import { Brand, AuthAside } from "@/components/AuthChrome";

export const metadata = { title: "Verify your email · Arc" };

async function consume(token: string | undefined) {
  if (!token) return "missing" as const;
  const record = await db.verificationToken.findUnique({ where: { token } });
  if (!record || record.purpose !== VerificationPurpose.EMAIL_VERIFY) return "invalid" as const;
  if (record.usedAt) return "already" as const;
  if (record.expiresAt < new Date()) return "expired" as const;

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
    db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  return "ok" as const;
}

const COPY = {
  ok: { title: "Email verified", body: "You're all set. Everything in Arc is unlocked." },
  already: { title: "Already verified", body: "This address was confirmed earlier — nothing to do." },
  expired: { title: "That link expired", body: "Verification links last 24 hours. Request a fresh one from Settings." },
  invalid: { title: "That link isn't valid", body: "It may have been copied incompletely. Request a fresh one from Settings." },
  missing: { title: "No token in the link", body: "Open the link straight from the email so the token comes with it." },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await consume(token);
  const copy = COPY[result];

  return (
    <main className="auth">
      <div className="auth-form">
        <Brand />
        <h1 style={{ font: "600 27px/1.2 var(--display)" }}>{copy.title}</h1>
        <div style={{ font: "400 12.5px/1.7 var(--sans)", color: "var(--muted)", marginTop: -6 }}>
          {copy.body}
        </div>
        <Link className="btn btn-primary btn-block" href="/home" style={{ marginTop: 8 }}>
          Go to Arc
        </Link>
      </div>
      <AuthAside />
    </main>
  );
}

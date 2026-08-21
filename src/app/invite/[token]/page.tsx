import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Brand, AuthAside } from "@/components/AuthChrome";
import { ROLE_LABEL } from "@/lib/constants";
import AcceptInvite from "./AcceptInvite";

export const metadata = { title: "You're invited · Arc" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([
    db.invite.findUnique({
      where: { token },
      include: { org: true, invitedBy: { select: { name: true } } },
    }),
    getCurrentUser(),
  ]);

  const problem = !invite
    ? "That invite link isn't valid."
    : invite.acceptedAt
      ? "That invite has already been used."
      : invite.expiresAt < new Date()
        ? "That invite has expired — ask for a fresh one."
        : null;

  return (
    <main className="auth">
      <div className="auth-form">
        <Brand />

        {problem || !invite ? (
          <>
            <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Invite unavailable</h1>
            <div style={{ font: "400 12.5px/1.7 var(--sans)", color: "var(--muted)", marginTop: -6 }}>
              {problem}
            </div>
            <Link className="btn btn-primary btn-block" href="/login" style={{ marginTop: 8 }}>
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 style={{ font: "600 27px/1.2 var(--display)" }}>Join {invite.org.name}</h1>
            <div style={{ font: "400 12.5px/1.7 var(--sans)", color: "var(--muted)", marginTop: -6 }}>
              {invite.invitedBy?.name ?? "Someone"} invited{" "}
              <span style={{ color: "var(--text)" }}>{invite.email}</span> as{" "}
              {ROLE_LABEL[invite.role].toLowerCase()}. You&rsquo;ll land straight on the board.
            </div>

            <AcceptInvite
              token={token}
              inviteEmail={invite.email}
              signedInAs={user ? { email: user.email, name: user.name } : null}
            />
          </>
        )}
      </div>
      <AuthAside />
    </main>
  );
}

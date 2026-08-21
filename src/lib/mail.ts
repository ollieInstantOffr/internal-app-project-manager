import "server-only";
import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;
const resend = key ? new Resend(key) : null;

export type MailResult = { ok: boolean; id?: string; skipped?: boolean; error?: string };

/**
 * Sends through Resend. With no RESEND_API_KEY configured the message is logged
 * instead of sent, so local development and tests never hard-fail on mail.
 */
export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<MailResult> {
  const from = process.env.EMAIL_FROM || "Arc <onboarding@resend.dev>";

  if (!resend) {
    console.info(
      `[mail:skipped] no RESEND_API_KEY — would send "${opts.subject}" to ${
        Array.isArray(opts.to) ? opts.to.join(", ") : opts.to
      }`,
    );
    return { ok: true, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    if (error) {
      console.error("[mail:error]", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[mail:threw]", err);
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

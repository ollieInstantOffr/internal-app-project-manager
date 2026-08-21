import { handler, json, fail } from "@/lib/api";
import { sendDigestsForAll } from "@/lib/digest";

/**
 * Daily digest fan-out. Point a scheduler at this with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron sends exactly that header).
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, "Set CRON_SECRET to enable the digest job");

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return fail(401, "Unauthorized");

  const result = await sendDigestsForAll();
  return json({ ok: true, ...result });
}

export const GET = handler(run);
export const POST = handler(run);

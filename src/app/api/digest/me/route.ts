import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { sendDigest } from "@/lib/digest";

export const POST = handler(async () => {
  const user = await requireUser();
  const result = await sendDigest(user.id, { force: true });
  return json({ ok: true, ...result });
});

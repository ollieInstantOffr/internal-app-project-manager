import { handler, json } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const POST = handler(async () => {
  await destroySession();
  return json({ ok: true });
});

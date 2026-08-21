import { db } from "@/lib/db";
import { handler, json } from "@/lib/api";
import { slugify } from "@/lib/format";

export const GET = handler(async (req: Request) => {
  const slug = slugify(new URL(req.url).searchParams.get("slug") ?? "");
  if (slug.length < 2) return json({ slug, available: false, reason: "too short" });
  const existing = await db.organization.findUnique({ where: { slug } });
  return json({ slug, available: !existing });
});

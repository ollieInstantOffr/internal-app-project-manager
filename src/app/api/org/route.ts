import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";
import { slugify } from "@/lib/format";

export const PATCH = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const body = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      slug: z.string().trim().min(2).max(48).optional(),
      githubOrg: z.string().trim().max(80).optional().nullable(),
    }),
  );

  if (body.slug) {
    const slug = slugify(body.slug);
    const clash = await db.organization.findUnique({ where: { slug } });
    if (clash && clash.id !== ctx.orgId) return fail(409, "That workspace URL is taken");
    body.slug = slug;
  }

  const org = await db.organization.update({ where: { id: ctx.orgId }, data: body });
  return json({ ok: true, org });
});

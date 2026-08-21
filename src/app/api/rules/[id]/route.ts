import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  const rule = await db.automationRule.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!rule) return fail(404, "Rule not found");

  const body = await parseBody(req, z.object({ enabled: z.boolean() }));
  const updated = await db.automationRule.update({ where: { id }, data: { enabled: body.enabled } });
  return json({ ok: true, rule: updated });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  const rule = await db.automationRule.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!rule) return fail(404, "Rule not found");
  if (rule.builtIn) return fail(409, "Built-in rules can be switched off but not deleted");
  await db.automationRule.delete({ where: { id } });
  return json({ ok: true });
});

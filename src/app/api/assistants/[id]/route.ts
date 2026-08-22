import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { assistantUpdateSchema } from "@/lib/validators";
import { revokeAssistant, rotateKey } from "@/lib/mcp/assistants";
import { HttpError } from "@/lib/auth";
import { Role } from "@/lib/types";
import { TOOLS } from "@/lib/mcp/tools";
import type { Level } from "@/lib/mcp/levels";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  const existing = await db.assistant.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!existing) throw new HttpError(404, "Assistant not found");

  const { capabilities, ...rest } = await parseBody(req, assistantUpdateSchema);

  if (rest.projectIds?.length) {
    const owned = await db.project.count({
      where: { id: { in: rest.projectIds }, orgId: ctx.orgId },
    });
    if (owned !== rest.projectIds.length) throw new HttpError(400, "Unknown project");
  }

  if (capabilities) {
    await db.assistantCapability.deleteMany({ where: { assistantId: id } });

    if (capabilities.length) {
      // Editing one permission must change exactly that one. So the rung the
      // assistant is on right now is written out in full first, and the edits
      // land on top — otherwise a full teammate would quietly drop to helper
      // everywhere else the moment you touched a single tool.
      const base = existing.level === "CUSTOM" ? "HELPER" : (existing.level as Level);
      const seeded = new Map(TOOLS.map((tool) => [tool.name, tool.modes[base]]));
      for (const override of capabilities) seeded.set(override.tool, override.mode);

      await db.assistantCapability.createMany({
        data: [...seeded].map(([tool, mode]) => ({ assistantId: id, tool, mode })),
      });
    }
  }

  const assistant = await db.assistant.update({
    where: { id },
    data: {
      ...rest,
      // Editing one permission at a time is what makes an assistant custom.
      ...(capabilities?.length ? { level: "CUSTOM" as const } : {}),
      // Clearing every override drops back to a named rung — but only when the
      // caller didn't name one itself, or "set FULL and clear" would land on
      // HELPER instead of FULL.
      ...(capabilities &&
      !capabilities.length &&
      existing.level === "CUSTOM" &&
      rest.level === undefined
        ? { level: "HELPER" as const }
        : {}),
    },
    include: { capabilities: true },
  });

  return json({ ok: true, assistant });
});

export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  await revokeAssistant(id, ctx.orgId);
  return json({ ok: true });
});

/** Issues a fresh key without losing the assistant's level or history. */
export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { id } = await params;
  const key = await rotateKey(id, ctx.orgId);
  return json({ ok: true, key });
});

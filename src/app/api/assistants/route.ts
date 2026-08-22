import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { assistantCreateSchema } from "@/lib/validators";
import { createAssistant } from "@/lib/mcp/assistants";
import { Role } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const assistants = await db.assistant.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "asc" },
    include: { capabilities: true },
  });
  return json({ assistants });
});

export const POST = handler(async (req: Request) => {
  // Connecting an agent to the tracker is an admin decision.
  const ctx = await requireApiContext(req, Role.ADMIN);
  const body = await parseBody(req, assistantCreateSchema);

  const { assistant, key } = await createAssistant({
    orgId: ctx.orgId,
    createdById: ctx.userId,
    name: body.name,
    client: body.client,
  });

  // The raw key is returned exactly once, here.
  return json({ ok: true, assistant, key }, { status: 201 });
});

import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { denyApproval, runApproved } from "@/lib/mcp/runtime";
import { HttpError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; approvalId: string }> };

export const POST = handler(async (req: Request, { params }: Ctx) => {
  const ctx = await requireApiContext(req);
  const { id, approvalId } = await params;

  const approval = await db.agentApproval.findFirst({
    where: { id: approvalId, assistantId: id, assistant: { orgId: ctx.orgId } },
  });
  if (!approval) throw new HttpError(404, "Approval not found");

  const { decision } = await parseBody(req, z.object({ decision: z.enum(["approve", "deny"]) }));

  if (decision === "deny") {
    await denyApproval(approvalId, ctx.userId);
    return json({ ok: true, status: "DENIED" });
  }

  const result = await runApproved(approvalId, ctx.userId);
  return json({ ok: true, status: "APPROVED", ran: result.ok, text: result.text });
});

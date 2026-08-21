import { db } from "@/lib/db";
import { handler, json, fail, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";

export const DELETE = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireApiContext(req, Role.ADMIN);
    const { id } = await params;
    const invite = await db.invite.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!invite) return fail(404, "Invite not found");
    await db.invite.delete({ where: { id } });
    return json({ ok: true });
  },
);

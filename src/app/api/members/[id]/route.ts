import { db } from "@/lib/db";
import { handler, json, fail, parseBody, requireApiContext } from "@/lib/api";
import { memberUpdateSchema } from "@/lib/validators";
import { Role } from "@/lib/types";

/** There must always be at least one owner left standing. */
async function ownersRemaining(orgId: string, excludingUserId: string) {
  return db.membership.count({
    where: { orgId, role: Role.OWNER, userId: { not: excludingUserId } },
  });
}

export const PATCH = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireApiContext(req, Role.ADMIN);
    const { id } = await params;
    const { role } = await parseBody(req, memberUpdateSchema);

    const target = await db.membership.findFirst({ where: { userId: id, orgId: ctx.orgId } });
    if (!target) return fail(404, "Member not found");

    // Only an owner may hand out or take away ownership.
    if ((role === Role.OWNER || target.role === Role.OWNER) && ctx.role !== Role.OWNER) {
      return fail(403, "Only an owner can change ownership");
    }
    if (target.role === Role.OWNER && role !== Role.OWNER) {
      if ((await ownersRemaining(ctx.orgId, id)) === 0) {
        return fail(409, "An organization needs at least one owner");
      }
    }

    await db.membership.update({ where: { id: target.id }, data: { role } });
    return json({ ok: true });
  },
);

export const DELETE = handler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireApiContext(req, Role.ADMIN);
    const { id } = await params;

    const target = await db.membership.findFirst({ where: { userId: id, orgId: ctx.orgId } });
    if (!target) return fail(404, "Member not found");
    if (target.role === Role.OWNER && (await ownersRemaining(ctx.orgId, id)) === 0) {
      return fail(409, "An organization needs at least one owner");
    }
    if (target.userId !== ctx.userId && ctx.role === Role.MEMBER) {
      return fail(403, "Requires admin permissions");
    }

    // Their work stays; it simply becomes unassigned.
    await db.issue.updateMany({
      where: { assigneeId: id, project: { orgId: ctx.orgId } },
      data: { assigneeId: null },
    });
    await db.membership.delete({ where: { id: target.id } });

    return json({ ok: true });
  },
);

import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { tokenSchema } from "@/lib/validators";
import { randomToken, sha256 } from "@/lib/auth";
import { Role } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const tokens = await db.apiToken.findMany({
    where: { orgId: ctx.orgId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });
  return json({
    tokens: tokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
      owner: t.user.name,
    })),
  });
});

export const POST = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const { name } = await parseBody(req, tokenSchema);

  const secret = `arc_${randomToken(24)}`;
  const token = await db.apiToken.create({
    data: {
      name,
      orgId: ctx.orgId,
      userId: ctx.userId,
      prefix: secret.slice(0, 12),
      tokenHash: sha256(secret),
    },
  });

  // The only time the plaintext exists — it is never recoverable afterwards.
  return json({ ok: true, token: { id: token.id, name: token.name, secret } }, { status: 201 });
});

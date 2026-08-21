import { z } from "zod";
import { db } from "@/lib/db";
import { handler, json, parseBody, requireApiContext } from "@/lib/api";
import { Role } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const ctx = await requireApiContext(req);
  const integrations = await db.integration.findMany({ where: { orgId: ctx.orgId } });
  const repos = await db.project.findMany({
    where: { orgId: ctx.orgId, repoFullName: { not: null } },
    select: { repoFullName: true },
  });
  return json({
    integrations,
    linkedRepos: [...new Set(repos.map((r) => r.repoFullName!))],
    webhookConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
    oauthConfigured: !!process.env.GITHUB_CLIENT_ID,
  });
});

export const PATCH = handler(async (req: Request) => {
  const ctx = await requireApiContext(req, Role.ADMIN);
  const body = await parseBody(
    req,
    z.object({ provider: z.string().min(1), connected: z.boolean(), account: z.string().optional() }),
  );

  const integration = await db.integration.upsert({
    where: { orgId_provider: { orgId: ctx.orgId, provider: body.provider } },
    create: {
      orgId: ctx.orgId,
      provider: body.provider,
      connected: body.connected,
      account: body.account,
    },
    update: { connected: body.connected, account: body.account },
  });

  return json({ ok: true, integration });
});

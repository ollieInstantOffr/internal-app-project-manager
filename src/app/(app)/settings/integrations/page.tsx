import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { Integrations } from "@/components/settings/Integrations";

export const metadata = { title: "Integrations · Arc" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const { org } = await requireOrg();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [rules, tokens, integration, repos, issuesThisMonth, commentsThisMonth, activityCount] =
    await Promise.all([
      db.automationRule.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } }),
      db.apiToken.findMany({
        where: { orgId: org.id, revokedAt: null },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true } } },
      }),
      db.integration.findFirst({ where: { orgId: org.id, provider: "github" } }),
      db.project.findMany({
        where: { orgId: org.id, repoFullName: { not: null } },
        select: { repoFullName: true },
      }),
      db.issue.count({
        where: { project: { orgId: org.id }, createdAt: { gte: monthStart } },
      }),
      db.comment.count({
        where: { issue: { project: { orgId: org.id } }, createdAt: { gte: monthStart } },
      }),
      db.activity.count({ where: { orgId: org.id, createdAt: { gte: monthStart } } }),
    ]);

  return (
    <Integrations
      rules={rules}
      tokens={tokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.prefix,
        owner: t.user.name,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      }))}
      github={{
        connected: !!integration?.connected,
        account: integration?.account ?? org.githubOrg,
        repos: [...new Set(repos.map((r) => r.repoFullName!))],
        oauthConfigured: !!process.env.GITHUB_CLIENT_ID,
        webhookConfigured: !!process.env.GITHUB_WEBHOOK_SECRET,
      }}
      usage={{
        issues: issuesThisMonth,
        // Attachments aren't stored yet; comment volume stands in as the content metric.
        attachmentsMb: commentsThisMonth * 0.02,
        apiCalls: activityCount,
      }}
    />
  );
}

import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { TOOLS } from "@/lib/mcp/tools";
import { McpServer, type AssistantRow } from "@/components/settings/McpServer";
import { Role } from "@/lib/types";
import { redirect } from "next/navigation";

export const metadata = { title: "MCP server · Arc" };
export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const { org, role } = await requireOrg();
  // Connecting an agent to the tracker is an admin decision, so is reading its log.
  if (role !== Role.OWNER && role !== Role.ADMIN) redirect("/settings/general");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [assistants, projects] = await Promise.all([
    db.assistant.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "asc" },
      include: {
        capabilities: true,
        approvals: {
          where: { status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        },
        actions: { orderBy: { createdAt: "desc" }, take: 60 },
        _count: { select: { actions: { where: { createdAt: { gte: startOfDay } } } } },
      },
    }),
    db.project.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, key: true, name: true },
    }),
  ]);

  const rows: AssistantRow[] = assistants.map((a) => ({
    id: a.id,
    name: a.name,
    level: a.level,
    client: a.client,
    tokenHint: a.tokenHint,
    projectIds: a.projectIds,
    ratePerHour: a.ratePerHour,
    idleHours: a.idleHours,
    enabled: a.enabled,
    revokedAt: a.revokedAt?.toISOString() ?? null,
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    capabilities: a.capabilities.map((c) => ({ tool: c.tool, mode: c.mode })),
    actionsToday: a._count.actions,
    // Reads are the bulk of the traffic and say nothing interesting; the log is
    // for what it changed and what it was stopped from doing.
    log: a.actions
      .filter((action) => action.outcome !== "READ")
      .slice(0, 8)
      .map((action) => ({
        id: action.id,
        summary: action.summary,
        outcome: action.outcome,
        createdAt: action.createdAt.toISOString(),
      })),
    pending: a.approvals.map((p) => ({
      id: p.id,
      summary: p.summary,
      tool: p.tool,
      createdAt: p.createdAt.toISOString(),
    })),
  }));

  return (
    <McpServer
      aiAccess={org.aiAccess}
      assistants={rows}
      projects={projects}
      tools={TOOLS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        group: tool.group,
        modes: tool.modes,
      }))}
      endpoint={appUrl("/api/mcp")}
      orgSlug={org.slug}
    />
  );
}

import "server-only";
import { db } from "../db";
import { sha256 } from "../auth";
import { notify } from "../activity";
import { publish } from "../events";
import { NotificationKind, Urgency } from "../types";
import { FORBIDDEN_TOOLS, type Level } from "./levels";
import { TOOL_BY_NAME, type ContentBlock, type Tool, type ToolContext } from "./tools";

export const APPROVAL_TTL_MINUTES = 60;

/** How stale lastSeenAt may get before it's worth a write. */
const SEEN_FRESH_MS = 60_000;

/**
 * Counting every action in the last hour on every single call is wasteful when
 * an assistant is nowhere near its limit. The count is cached briefly, but only
 * while there's comfortable headroom — close to the limit it's recounted every
 * time, so the cap itself is never approximate.
 */
const RATE_CACHE_MS = 10_000;
const RATE_CACHE_SAFE = 0.8;
const rateCache = new Map<string, { used: number; at: number }>();

/**
 * How long the action log keeps each kind of row.
 *
 * Reads are the bulk of the traffic and say nothing interesting after the fact;
 * writes, refusals and blocks are the record of what an assistant actually did,
 * so they are kept far longer. Revoking a key is documented as keeping its
 * history, and this is deliberately generous enough not to make a liar of that.
 */
const KEEP_READS_DAYS = 14;
const KEEP_ACTIONS_DAYS = 365;

/** Roughly one request in two hundred does the tidying. */
const PRUNE_ODDS = 0.005;
let pruning = false;

/**
 * Pruned opportunistically rather than on a schedule, because nothing in this
 * deployment runs the cron endpoints — a retention policy that needs a
 * scheduler nobody set up is a retention policy that never runs.
 */
async function pruneSometimes(assistantId: string) {
  if (pruning || Math.random() > PRUNE_ODDS) return;
  pruning = true;
  try {
    const day = 86_400_000;
    await db.agentAction.deleteMany({
      where: { assistantId, outcome: "READ", createdAt: { lt: new Date(Date.now() - KEEP_READS_DAYS * day) } },
    });
    await db.agentAction.deleteMany({
      where: { assistantId, createdAt: { lt: new Date(Date.now() - KEEP_ACTIONS_DAYS * day) } },
    });
  } catch (err) {
    console.error("[mcp] prune failed", err);
  } finally {
    pruning = false;
  }
}

export type Connection = Awaited<ReturnType<typeof authenticate>>;

export class McpDenied extends Error {
  constructor(
    message: string,
    public code = "denied",
  ) {
    super(message);
  }
}

/**
 * Resolves a bearer token to an assistant, applying every gate that can stop it
 * before a tool is even chosen: the org switch, revocation, and the idle timeout.
 */
export async function authenticate(header: string | null) {
  if (!header?.startsWith("Bearer ")) {
    throw new McpDenied("Missing bearer token. Add your Arc assistant key.", "unauthorized");
  }

  const raw = header.slice(7).trim();
  const assistant = await db.assistant.findUnique({
    where: { tokenHash: sha256(raw) },
    include: {
      org: { select: { id: true, name: true, slug: true, aiAccess: true } },
      user: { select: { id: true, name: true } },
      capabilities: true,
    },
  });

  if (!assistant) throw new McpDenied("That key isn't valid.", "unauthorized");
  if (assistant.revokedAt) throw new McpDenied("That key has been revoked.", "unauthorized");
  if (!assistant.enabled) throw new McpDenied(`${assistant.name} is paused in Arc.`, "forbidden");
  if (!assistant.org.aiAccess) {
    throw new McpDenied("AI access is switched off for this organization.", "forbidden");
  }

  // "Sign it out after N hours idle" — 0 means never.
  if (assistant.idleHours > 0 && assistant.lastSeenAt) {
    const idleMs = Date.now() - assistant.lastSeenAt.getTime();
    if (idleMs > assistant.idleHours * 3600_000) {
      throw new McpDenied(
        `${assistant.name} was signed out after ${assistant.idleHours}h idle. Reconnect it in Arc → Settings → MCP Server.`,
        "unauthorized",
      );
    }
  }

  // Only worth a write when it would actually change the answer. Every
  // initialize, ping and tools/list used to cost one purely to record "seen
  // recently", which at a few calls a second is a lot of writes for a field
  // read by an hours-long timeout.
  const seenAge = assistant.lastSeenAt ? Date.now() - assistant.lastSeenAt.getTime() : Infinity;
  if (seenAge > SEEN_FRESH_MS) {
    await db.assistant.update({ where: { id: assistant.id }, data: { lastSeenAt: new Date() } });
  }

  const ownerId = assistant.createdById ?? assistant.userId;

  return {
    assistant,
    level: assistant.level === "CUSTOM" ? ("HELPER" as Level) : (assistant.level as Level),
    ctx: {
      assistantId: assistant.id,
      orgId: assistant.orgId,
      actorId: assistant.userId,
      ownerId,
      projectIds: assistant.projectIds,
    } satisfies ToolContext,
  };
}

/**
 * What this assistant is allowed to do with one tool, overrides included.
 *
 * A destructive tool can be denied but never waved through: ALLOW is downgraded
 * to ASK no matter which rung it sits on or what an override says. That way the
 * guarantee comes from the tool declaring itself, rather than from a list of
 * names someone has to keep current.
 */
export function modeFor(connection: Connection, tool: Tool) {
  const override = connection.assistant.capabilities.find((c) => c.tool === tool.name);
  const mode = override ? (override.mode as "ALLOW" | "ASK" | "DENY") : tool.modes[connection.level];
  if (tool.destructive && mode === "ALLOW") return "ASK";
  return mode;
}

/** The tools this assistant can actually reach — the rest are never advertised. */
export function visibleTools(connection: Connection) {
  return [...TOOL_BY_NAME.values()].filter((tool) => modeFor(connection, tool) !== "DENY");
}

async function log(opts: {
  assistantId: string;
  tool: string;
  summary: string;
  outcome: "AUTO" | "APPROVED" | "DENIED" | "BLOCKED" | "FAILED" | "READ";
  targetKey?: string | null;
}) {
  await db.agentAction.create({
    data: {
      assistantId: opts.assistantId,
      tool: opts.tool,
      summary: opts.summary,
      outcome: opts.outcome,
      targetKey: opts.targetKey ?? null,
    },
  });

  void pruneSometimes(opts.assistantId);
}

/** "Pause it if it gets carried away" — counted over the last rolling hour. */
async function overRate(connection: Connection) {
  const { id, ratePerHour } = connection.assistant;

  const cached = rateCache.get(id);
  if (cached && Date.now() - cached.at < RATE_CACHE_MS && cached.used < ratePerHour * RATE_CACHE_SAFE) {
    // Counting the calls made since the snapshot keeps a burst from slipping
    // past the cap during the cache window.
    cached.used += 1;
    return cached.used >= ratePerHour;
  }

  const used = await db.agentAction.count({
    where: { assistantId: id, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  rateCache.set(id, { used, at: Date.now() });
  return used >= ratePerHour;
}

export type ToolResult = { text: string; blocks?: ContentBlock[]; isError?: boolean };

export async function callTool(
  connection: Connection,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { assistant } = connection;

  // Names that are off limits at every level get a straight answer and a log
  // entry, rather than looking like a typo.
  if (FORBIDDEN_TOOLS[name]) {
    await log({
      assistantId: assistant.id,
      tool: name,
      summary: `Tried to ${name.replace(/_/g, " ")} — blocked`,
      outcome: "BLOCKED",
    });
    return { text: FORBIDDEN_TOOLS[name], isError: true };
  }

  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { text: `No tool called "${name}".`, isError: true };

  const mode = modeFor(connection, tool);
  if (mode === "DENY") {
    await log({
      assistantId: assistant.id,
      tool: name,
      summary: `Tried to ${tool.summarise(args)} — not allowed at this level`,
      outcome: "DENIED",
    });
    return {
      text: `${assistant.name} isn't allowed to ${tool.summarise(args)}. Raise its level in Arc → Settings → MCP Server.`,
      isError: true,
    };
  }

  if (await overRate(connection)) {
    return {
      text: `${assistant.name} has hit its limit of ${assistant.ratePerHour} actions an hour and is paused until the hour rolls over.`,
      isError: true,
    };
  }

  if (mode === "ASK") {
    const approval = await db.agentApproval.create({
      data: {
        assistantId: assistant.id,
        tool: name,
        args: args as never,
        summary: tool.summarise(args),
        expiresAt: new Date(Date.now() + APPROVAL_TTL_MINUTES * 60_000),
      },
    });

    await notify({
      userId: connection.ctx.ownerId,
      kind: NotificationKind.APPROVAL,
      urgency: Urgency.TODAY,
      title: `${assistant.name} is waiting on you`,
      detail: `Wants to ${tool.summarise(args)}`,
    });
    void publish({ orgId: assistant.orgId, kind: "approval", userId: connection.ctx.ownerId });

    return {
      text: [
        `That needs a person's approval, so I've asked.`,
        `Approval id: ${approval.id}`,
        `Waiting on: ${tool.summarise(args)}`,
        ``,
        `Call check_approval with that id to see the answer. It expires in ${APPROVAL_TTL_MINUTES} minutes.`,
      ].join("\n"),
    };
  }

  try {
    const result = await tool.run(connection.ctx, args);
    await log({
      assistantId: assistant.id,
      tool: name,
      summary: tool.group === "Read" ? tool.summarise(args) : `Did: ${tool.summarise(args)}`,
      outcome: tool.group === "Read" ? "READ" : "AUTO",
      targetKey: result.targetKey,
    });
    return { text: result.text, blocks: result.blocks };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    await log({
      assistantId: assistant.id,
      tool: name,
      summary: `Failed to ${tool.summarise(args)} — ${message}`,
      outcome: "FAILED",
    });
    return { text: message, isError: true };
  }
}

/** Runs an approved call and records the result for the agent to collect. */
export async function runApproved(approvalId: string, deciderId: string) {
  const approval = await db.agentApproval.findUnique({
    where: { id: approvalId },
    include: { assistant: { include: { capabilities: true } } },
  });
  if (!approval) throw new McpDenied("That approval no longer exists.");
  if (approval.status !== "PENDING") throw new McpDenied("That approval was already answered.");

  const tool = TOOL_BY_NAME.get(approval.tool);
  if (!tool) throw new McpDenied("That tool no longer exists.");

  const ctx: ToolContext = {
    assistantId: approval.assistantId,
    orgId: approval.assistant.orgId,
    actorId: approval.assistant.userId,
    ownerId: approval.assistant.createdById ?? approval.assistant.userId,
    projectIds: approval.assistant.projectIds,
  };

  try {
    const result = await tool.run(ctx, approval.args as Record<string, unknown>);
    await db.agentApproval.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: deciderId,
        result: { text: result.text } as never,
      },
    });
    await log({
      assistantId: approval.assistantId,
      tool: approval.tool,
      summary: `Did: ${approval.summary}`,
      outcome: "APPROVED",
      targetKey: result.targetKey,
    });
    // Tells the waiting agent straight away, instead of it polling for minutes.
    void publish({
      orgId: approval.assistant.orgId,
      kind: "approval-answered",
      assistantId: approval.assistantId,
      approvalId: approval.id,
      detail: `approved — ${approval.summary}`,
    });
    return { ok: true, text: result.text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    await db.agentApproval.update({
      where: { id: approval.id },
      data: { status: "APPROVED", decidedAt: new Date(), decidedById: deciderId, error: message },
    });
    await log({
      assistantId: approval.assistantId,
      tool: approval.tool,
      summary: `Approved but failed: ${approval.summary} — ${message}`,
      outcome: "FAILED",
    });
    return { ok: false, text: message };
  }
}

export async function denyApproval(approvalId: string, deciderId: string) {
  const approval = await db.agentApproval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new McpDenied("That approval no longer exists.");
  if (approval.status !== "PENDING") throw new McpDenied("That approval was already answered.");

  await db.agentApproval.update({
    where: { id: approvalId },
    data: { status: "DENIED", decidedAt: new Date(), decidedById: deciderId },
  });
  await log({
    assistantId: approval.assistantId,
    tool: approval.tool,
    summary: `Asked to ${approval.summary} — you said no`,
    outcome: "DENIED",
  });

  const assistant = await db.assistant.findUnique({
    where: { id: approval.assistantId },
    select: { orgId: true },
  });
  if (assistant) {
    void publish({
      orgId: assistant.orgId,
      kind: "approval-answered",
      assistantId: approval.assistantId,
      approvalId: approvalId,
      detail: `declined — ${approval.summary}`,
    });
  }
}

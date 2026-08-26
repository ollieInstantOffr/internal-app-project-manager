import "server-only";
import { authenticate, callTool, McpDenied, visibleTools, type Connection } from "./runtime";
import { LEVEL_COPY, OFF_LIMITS } from "./levels";

/** Versions of the MCP spec this server speaks. Newest first. */
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const SERVER_INFO = {
  name: "arc",
  title: "Arc",
  version: "1.0.0",
};

type Id = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
};

const ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
};

export function rpcError(id: Id, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function rpcResult(id: Id, result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

/** The one-paragraph brief an agent reads before it starts. */
function instructions(connection: Connection) {
  const level = connection.assistant.level;
  const copy = LEVEL_COPY[connection.level];
  return [
    `Arc is a git-native project tracker. You are connected as "${connection.assistant.name}", a named member of ${connection.assistant.org.name} — your actions appear in the activity feed under that name.`,
    ``,
    `Your trust level is ${level === "CUSTOM" ? "Custom (based on Helper)" : copy.name}. ${copy.blurb}`,
    copy.asks ? `You must ask a person first before: ${copy.asks}.` : ``,
    `When a tool needs approval it returns an approval id instead of acting; call check_approval with that id to find out what the person decided.`,
    ``,
    `Off limits at every level: ${OFF_LIMITS}.`,
    connection.assistant.projectIds.length
      ? `You can only see some of the org's projects — call list_projects to find out which.`
      : `You can see every project in the org.`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function dispatch(connection: Connection, request: JsonRpcRequest) {
  const { method, params = {}, id = null } = request;

  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : null;
      const protocolVersion =
        asked && SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];

      return rpcResult(id, {
        protocolVersion,
        // listChanged is honoured over the GET stream; logging carries approval
        // answers so a waiting agent hears rather than polls.
        capabilities: { tools: { listChanged: true }, logging: {} },
        serverInfo: SERVER_INFO,
        instructions: instructions(connection),
      });
    }

    case "ping":
      return rpcResult(id, {});

    // Accepted so a client that sets a level doesn't get "method not found";
    // everything we emit is notice-level anyway.
    case "logging/setLevel":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: visibleTools(connection).map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) return rpcError(id, ERRORS.invalidParams, "A tool name is required");
      const args = (params.arguments ?? {}) as Record<string, unknown>;

      const result = await callTool(connection, name, args);
      // Tool failures are results, not protocol errors — the model needs to read them.
      return rpcResult(id, {
        content: [
          { type: "text", text: result.text },
          // A screenshot is worth more to the model than a description of one.
          ...(result.blocks ?? []),
        ],
        isError: !!result.isError,
      });
    }

    // Declared as unsupported rather than left to 'method not found'.
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    default:
      return rpcError(id, ERRORS.methodNotFound, `Unknown method "${method}"`);
  }
}

/**
 * Handles one JSON-RPC message. Notifications (no id) produce nothing, which is
 * how the transport knows to answer 202 with an empty body.
 */
export async function handleMessage(connection: Connection, message: unknown) {
  if (typeof message !== "object" || message === null) {
    return rpcError(null, ERRORS.invalidRequest, "Expected a JSON-RPC object");
  }

  const request = message as JsonRpcRequest;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return rpcError(request.id ?? null, ERRORS.invalidRequest, "Not a JSON-RPC 2.0 request");
  }

  const isNotification = request.id === undefined || request.id === null;
  if (isNotification) {
    // notifications/initialized and friends need no reply.
    return null;
  }

  try {
    return await dispatch(connection, request);
  } catch (err) {
    if (err instanceof McpDenied) {
      return rpcError(request.id ?? null, ERRORS.invalidRequest, err.message);
    }
    console.error("[mcp]", err);
    return rpcError(request.id ?? null, ERRORS.internal, "Something went wrong");
  }
}

export { authenticate, McpDenied };

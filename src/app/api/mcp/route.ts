import { NextResponse } from "next/server";
import {
  authenticate,
  handleMessage,
  McpDenied,
  rpcError,
  SUPPORTED_PROTOCOLS,
} from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Arc's MCP server, over the Streamable HTTP transport. One endpoint: clients
 * POST JSON-RPC and get JSON back. The transport allows a plain JSON response
 * instead of an SSE stream, and nothing here streams, so that is what we send.
 *
 * Point a client at POST /api/mcp with `Authorization: Bearer <assistant key>`.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body as object, {
    status,
    headers: { ...CORS, "MCP-Protocol-Version": SUPPORTED_PROTOCOLS[0] },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let connection;
  try {
    connection = await authenticate(req.headers.get("authorization"));
  } catch (err) {
    if (err instanceof McpDenied) {
      const status = err.code === "unauthorized" ? 401 : 403;
      // A WWW-Authenticate header is what tells a client to re-authenticate
      // rather than retry the same key forever.
      return NextResponse.json(rpcError(null, -32001, err.message), {
        status,
        headers: {
          ...CORS,
          ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="Arc MCP"' } : {}),
        },
      });
    }
    throw err;
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Body was not valid JSON"), 400);
  }

  // A batch is answered with an array; a batch of only notifications gets 202.
  if (Array.isArray(payload)) {
    const replies = [];
    for (const message of payload) {
      const reply = await handleMessage(connection, message);
      if (reply) replies.push(reply);
    }
    if (!replies.length) return new NextResponse(null, { status: 202, headers: CORS });
    return json(replies);
  }

  const reply = await handleMessage(connection, payload);
  if (!reply) return new NextResponse(null, { status: 202, headers: CORS });
  return json(reply);
}

/** No server-initiated messages, so there is no stream to open. */
export async function GET() {
  return json(rpcError(null, -32000, "This server does not offer an SSE stream; POST instead."), 405);
}

/** Stateless: there is no session to tear down, but saying so keeps clients happy. */
export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

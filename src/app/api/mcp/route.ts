import { NextResponse } from "next/server";
import {
  authenticate,
  handleMessage,
  McpDenied,
  rpcError,
  SUPPORTED_PROTOCOLS,
} from "@/lib/mcp/server";
import { subscribe } from "@/lib/events";

/** Long enough to beat an idle proxy, short enough to notice a dead client. */
const HEARTBEAT_MS = 25_000;

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

/**
 * The spec asks servers to validate Origin, to blunt DNS rebinding against
 * clients running on a developer's own machine. Tools like Claude Code send no
 * Origin at all, which is the normal case and stays allowed; a browser that
 * sends one has to be us.
 */
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }

  // Compared against the Host header rather than req.url: behind a proxy the
  // server's own view of its URL is the container's, not the one the browser
  // asked for. Hosts rather than full origins, because TLS terminates upstream
  // so the scheme differs either side of it.
  const asked = req.headers.get("host");
  if (asked && host === asked) return true;

  const configured = process.env.APP_URL;
  if (configured) {
    try {
      if (host === new URL(configured).host) return true;
    } catch {
      // A malformed APP_URL shouldn't lock everyone out.
    }
  }

  return false;
}

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
  if (!originAllowed(req)) {
    return json(rpcError(null, -32003, "Origin not allowed"), 403);
  }

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

/**
 * The server-to-client half of the transport.
 *
 * Without it an approval could only be collected by the agent calling
 * check_approval over and over, and a level change didn't reach a connected
 * client at all. Both now arrive as JSON-RPC notifications the moment they
 * happen. It carries no results — the agent still calls check_approval to read
 * one — so nothing here bypasses a permission check.
 */
export async function GET(req: Request) {
  if (!originAllowed(req)) return json(rpcError(null, -32003, "Origin not allowed"), 403);

  let connection;
  try {
    connection = await authenticate(req.headers.get("authorization"));
  } catch (err) {
    if (err instanceof McpDenied) {
      return NextResponse.json(rpcError(null, -32001, err.message), {
        status: err.code === "unauthorized" ? 401 : 403,
        headers: CORS,
      });
    }
    throw err;
  }

  const assistantId = connection.assistant.id;
  const orgId = connection.assistant.orgId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      const notify = (method: string, params?: Record<string, unknown>) =>
        send(`data: ${JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) })}\n\n`);

      send(`retry: 3000\n\n`);
      send(`: connected\n\n`);

      const unsubscribe = await subscribe(orgId, (event) => {
        // Only this assistant's own events; one key never hears another's.
        if (event.assistantId !== assistantId) return;

        if (event.kind === "approval-answered") {
          notify("notifications/message", {
            level: "notice",
            logger: "arc.approvals",
            data: `An approval was answered: ${event.detail ?? ""}. Call check_approval with id ${event.approvalId} to read the result.`,
          });
        }
        if (event.kind === "assistant") {
          notify("notifications/tools/list_changed");
        }
      });

      const beat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      const close = () => {
        if (!open) return;
        open = false;
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "MCP-Protocol-Version": SUPPORTED_PROTOCOLS[0],
    },
  });
}

/** Stateless: there is no session to tear down, but saying so keeps clients happy. */
export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

import { getOrgContext } from "@/lib/auth";
import { subscribe, type ArcEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Long enough to beat an idle proxy, short enough to notice a dead client. */
const HEARTBEAT_MS = 25_000;

/**
 * A server-sent event stream of "something in your org changed". It carries no
 * data beyond a hint of what moved — the client re-fetches through the normal
 * routes, so nothing here can leak past the permissions those already apply.
 */
export async function GET(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx?.org) return new Response("Not signed in", { status: 401 });

  const orgId = ctx.org.id;
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

      send(`retry: 3000\n\n`);
      send(`: connected\n\n`);

      const unsubscribe = await subscribe(orgId, (event: ArcEvent) => {
        send(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
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
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx buffers SSE into uselessness without this.
      "x-accel-buffering": "no",
    },
  });
}

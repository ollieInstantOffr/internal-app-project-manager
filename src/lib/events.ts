import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";

/**
 * Live updates ride on Postgres LISTEN/NOTIFY rather than an in-process bus, so
 * they still work when more than one container is serving the app — every
 * instance hears every change, whichever one made it.
 */
const CHANNEL = "arc_events";

export type ArcEvent = {
  /** Everything is scoped to an org; a stream only forwards its own. */
  orgId: string;
  kind: "activity" | "notification" | "approval" | "comment";
  /** Optional hints so a client can decide whether it cares. */
  issueId?: string | null;
  userId?: string | null;
};

type Bus = {
  emitter: EventEmitter;
  listener: Client | null;
  connecting: Promise<void> | null;
};

// Held on globalThis so Next's dev-mode module reloading doesn't open a new
// Postgres connection on every edit.
const globalForBus = globalThis as unknown as { arcBus?: Bus };

const bus: Bus =
  globalForBus.arcBus ??
  (globalForBus.arcBus = { emitter: new EventEmitter(), listener: null, connecting: null });

bus.emitter.setMaxListeners(0);

async function ensureListener() {
  if (bus.listener) return;
  if (bus.connecting) return bus.connecting;

  bus.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });

    client.on("notification", (message) => {
      if (!message.payload) return;
      try {
        bus.emitter.emit("event", JSON.parse(message.payload) as ArcEvent);
      } catch {
        // A payload we can't parse is not worth taking the listener down for.
      }
    });

    // A dropped listener would silently stop every stream, so it reconnects.
    client.on("error", () => {
      bus.listener = null;
      bus.connecting = null;
      client.end().catch(() => {});
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    bus.listener = client;
  })();

  try {
    await bus.connecting;
  } finally {
    bus.connecting = null;
  }
}

/**
 * Announces that something changed. Never throws — a failed notify should cost
 * a live update, not the write that triggered it.
 */
export async function publish(event: ArcEvent) {
  try {
    const { db } = await import("./db");
    await db.$executeRawUnsafe(
      `SELECT pg_notify($1, $2)`,
      CHANNEL,
      JSON.stringify(event).slice(0, 7000),
    );
  } catch (err) {
    console.error("[events] publish failed", err);
  }
}

/** Subscribes to this org's events. Returns an unsubscribe function. */
export async function subscribe(orgId: string, onEvent: (event: ArcEvent) => void) {
  await ensureListener();

  const handler = (event: ArcEvent) => {
    if (event.orgId === orgId) onEvent(event);
  };

  bus.emitter.on("event", handler);
  return () => bus.emitter.off("event", handler);
}

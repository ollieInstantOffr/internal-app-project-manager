/**
 * Runs migrations on deploy.
 *
 * Arc ran `prisma db push` before it had a migrations directory, so databases
 * created that way already have every table but no migration history. Running
 * `migrate deploy` against one of those would try to create tables that exist
 * and fail. This baselines those databases once — marking the initial migration
 * as already applied rather than running it — and then deploys normally.
 *
 * Safe to run on a fresh database too: there is nothing to baseline, so it goes
 * straight to deploy.
 */
import { execFileSync } from "node:child_process";
import { Client } from "pg";

const BASELINE = "0_init";

function prisma(...args) {
  execFileSync("npx", ["prisma", ...args], { stdio: "inherit" });
}

async function alreadyBaselined() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         to_regclass('public._prisma_migrations') IS NOT NULL AS has_history,
         to_regclass('public."User"')             IS NOT NULL AS has_schema`,
    );
    return rows[0];
  } finally {
    await client.end();
  }
}

const { has_history: hasHistory, has_schema: hasSchema } = await alreadyBaselined();

if (!hasHistory && hasSchema) {
  console.log(
    `[migrate] existing schema with no migration history — recording ${BASELINE} as applied`,
  );
  prisma("migrate", "resolve", "--applied", BASELINE);
} else if (!hasSchema) {
  console.log("[migrate] empty database — applying migrations from scratch");
}

prisma("migrate", "deploy");

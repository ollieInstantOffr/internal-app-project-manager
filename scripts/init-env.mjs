#!/usr/bin/env node
/**
 * Creates .env from .env.example with real generated secrets. Refuses to
 * overwrite an existing .env — pass --force if that is genuinely what you want.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const force = process.argv.includes("--force");

if (existsSync(".env") && !force) {
  console.error(".env already exists. Re-run with --force to replace it.");
  process.exit(1);
}

const hex = () => randomBytes(32).toString("hex");
const pw = () => randomBytes(32).toString("base64").replace(/[/+=]/g, "").slice(0, 40);

const postgresPassword = pw();
const appUrl = process.env.APP_URL || "http://localhost:3321";

const env = readFileSync(".env.example", "utf8")
  .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD="${postgresPassword}"`)
  .replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL="postgresql://arc:${postgresPassword}@localhost:5434/arc?schema=public"`,
  )
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${hex()}"`)
  .replace(/^CRON_SECRET=.*$/m, `CRON_SECRET="${hex()}"`)
  .replace(/^APP_URL=.*$/m, `APP_URL="${appUrl}"`);

writeFileSync(".env", env);

console.log(`Wrote .env
  POSTGRES_PASSWORD  40 chars, generated
  SESSION_SECRET     64 hex chars, generated
  CRON_SECRET        64 hex chars, generated
  APP_URL            ${appUrl}

Still to fill in by hand: RESEND_API_KEY, GITHUB_CLIENT_ID / _SECRET,
GITHUB_WEBHOOK_SECRET. The app runs without them — see the README.`);

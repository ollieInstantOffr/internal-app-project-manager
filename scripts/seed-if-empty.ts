/**
 * Seeds the demo organization only when the database has none. Safe to run on
 * every container start — an existing database is left completely alone.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function run() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const existing = await db.organization.count();
  await db.$disconnect();

  if (existing > 0) {
    console.log(`Database already has ${existing} organization(s) — skipping seed.`);
    return;
  }

  const { seed } = await import("../prisma/seed");
  await seed();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

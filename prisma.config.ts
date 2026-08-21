import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    // `prisma generate` needs no connection, and the Docker build stage has none.
    // Commands that do connect (db push, studio) fail loudly on the empty string.
    url: process.env.DATABASE_URL ?? "",
  },
});

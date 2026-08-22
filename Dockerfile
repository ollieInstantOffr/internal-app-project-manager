# syntax=docker/dockerfile:1

# ── deps ──────────────────────────────────────────────────────
# Full install once, reused by both the build and the tooling stage.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ───────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The generated client is plain TypeScript, so it compiles into the bundle.
RUN npx prisma generate && npx next build

# ── tools ─────────────────────────────────────────────────────
# Carries the Prisma CLI, the schema and tsx so migrations and seeding can run
# as their own compose step rather than bloating the server image.
FROM node:24-alpine AS tools
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY --from=builder /app/src/generated ./src/generated
CMD ["npx", "prisma", "db", "push"]

# ── runner ────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
# The server listens on 3321 inside the container too, so the port is the same
# everywhere and nothing ever binds 3000.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3321 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Uploads live on a named volume. Creating the directory here means Docker
# copies this ownership onto the volume when it first initialises it —
# otherwise it lands as root and the non-root app can't write to it.
RUN mkdir -p /data/attachments && chown -R nextjs:nodejs /data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3321

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3321/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

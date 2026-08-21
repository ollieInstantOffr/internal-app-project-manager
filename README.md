# Arc

Git-native project management. An issue needs only a title; branches and pull
requests move it the rest of the way.

Built from the `App Design.dc.html` Claude Design file — all twelve screens, the
APIs behind them, the schema, and the automation engine that makes the tagline true.

**Next.js 16 · React 19 · PostgreSQL 16 · Prisma 7 · Resend**

---

## Running it

Everything runs in Docker — app and database both.

```bash
docker compose up -d --build
```

Open **http://localhost:3321** and sign in as **sam@acme.dev / arcdemo123**
(`mira@`, `dev@` and `ana@` share the password; Sam is the owner, Mira an admin,
Dev and Ana members).

Three services come up: `db` (Postgres 16), `migrate` (a one-shot that syncs the
schema and seeds the demo org **only when the database is empty**), and `web`
(the Next.js standalone server). Cold start from an empty volume to a healthy,
seeded app takes about 15 seconds. Restarting never re-seeds — your data is left
alone.

| Command | Does |
| --- | --- |
| `npm run docker:up` | build and start everything |
| `npm run docker:logs` | tail the app |
| `npm run docker:down` | stop, keep the data |
| `npm run docker:reset` | wipe the volume and start fresh, re-seeded |

`GET /api/health` round-trips the database and backs the container healthcheck.

### Running the app outside Docker

Keep the database container and run the server on the host — same port, so
`APP_URL` and the links in emails stay correct. Stop `arc-web` first, or the
port is taken.

```bash
docker compose up -d db && npm install && npm run db:push && npm run db:seed && npm run dev
```

Postgres is published on **5434** for `psql` and `npm run db:studio`; inside the
compose network the app reaches it at `db:5432`.

### Configuration

Everything lives in `.env` (see `.env.example`), which `docker compose` reads
automatically. Only `DATABASE_URL` is required for host-side tooling — the
containers get theirs from compose. The app degrades gracefully without the rest.

| Variable | Effect when unset |
| --- | --- |
| `APP_URL` | `http://localhost:3321` |
| `RESEND_API_KEY` | mail is logged instead of sent, nothing fails |
| `EMAIL_FROM` | falls back to `onboarding@resend.dev` |
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub sign-in and repo import are hidden |
| `GITHUB_WEBHOOK_SECRET` | the webhook returns 503; the in-app simulator still runs every rule |
| `CRON_SECRET` | the daily digest endpoint is disabled |
| `SESSION_SECRET` | a development default is used — set this in production |

The seed builds Acme Engineering: 3 projects, 97 issues, 7 sprints of history,
5 epics, an inbox, and enough status-change trail for Insights to compute real
velocity, cycle time and flow.

---

## The screens

| Route | Design | What it does |
| --- | --- | --- |
| `/login`, `/signup` | 3a | Password or GitHub; split layout |
| `/onboarding/organization` | 3b | Name + live slug availability + GitHub connect |
| `/onboarding/invite` | — | Skippable bulk invite |
| `/onboarding/project` | 3c | Pick a repo, import issues, labels become epics |
| `/home` | 3d | Four counters, project cards, live activity |
| `/projects/[key]/board` | 1e | Kanban, drag between columns, WIP limits, inline compose, bulk bar |
| `/issues/[key]` | 3e | Inline-editable everything, subtasks, git panel, activity/comments/history |
| `/projects/[key]/backlog` | 3f | Grouped rows, range-select, drag into the sprint, capacity from velocity |
| `/roadmap` | 3g | Epic bars across quarters, today line, derived milestone risk |
| `/my-work` | 3h | One queue, `j/k/⏎/e`, split detail, reply without leaving |
| `⌘K` anywhere | 3i | Issues, epics, projects, people and actions |
| `/settings/members` | 3j | Roles, teams, pending invites, resend |
| `/settings/integrations` | 3k | GitHub, automation toggles, API tokens, usage |
| `/insights` | 3l | Velocity, cycle time, review wait, flow, one nudge |

Also `/projects/[key]/epics`, `/projects/new`, `/settings/{general,notifications,usage,danger}`,
`/invite/[token]`, `/forgot-password`, `/reset-password`, `/verify-email`.

---

## Issues that move themselves

Four rules ship enabled-by-default (the CI one is off — it's noisy). They match
issues by the key in a branch name or PR title, e.g. `fix/WEB-408-auth`.

| Trigger | Effect |
| --- | --- |
| Branch pushed | → **In progress**, branch recorded |
| PR opened | → **In review**, reviewers become watchers |
| PR merged | → **Done**, remaining subtasks close |
| CI red | comments on the issue, notifies watchers |

Point GitHub at `POST /api/webhooks/github` with `GITHUB_WEBHOOK_SECRET` and it
runs for real (signature checked with a timing-safe HMAC; `push`, `pull_request`,
`check_run` and `workflow_run` are handled). Without a webhook, **Settings →
Integrations → Try an automation** fires the same code path against any issue you
name — that is how the table above was verified.

Rules are editable: toggle them off, or add your own trigger→action pair.

---

## API

Every screen is backed by REST route handlers under `/api`, and the same routes
accept an API token, so the UI and the public API are one surface.

```bash
curl -H "Authorization: Bearer arc_…" http://localhost:3000/api/issues?project=WEB
```

Create a token in **Settings → Integrations → CLI & API tokens** (shown once,
stored as a SHA-256 hash). Tokens carry their creator's role.

Main endpoints: `issues` (+ `/bulk`, `/move`, `/[key]/{comments,subtasks,blocks,watch}`),
`projects`, `epics`, `sprints`, `labels`, `members`, `teams`, `invites`, `rules`,
`tokens`, `milestones`, `notifications`, `prefs`, `search`, `org`, `digest/me`,
`cron/digest`, `webhooks/github`.

**Permissions** are three fixed roles, deliberately not a matrix:
Owner (billing, delete org) → Admin (settings, integrations, members) →
Member (everything else). Enforced server-side on every route, not just in the UI.

---

## Email

Eight templates go out through Resend — verification, password reset, invite,
mention, assignment, blocking nudge, CI failure, daily digest. All respect
per-user preferences in **Settings → Notifications**.

```bash
npm run emails
```

writes every template to `.preview/emails/` so you can look at them without
sending. **Send test digest** on the notifications screen runs the real job
against your own account.

The digest fan-out is `POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET` —
point Vercel Cron or any scheduler at it.

---

## Layout

```
Dockerfile               deps → builder → tools (migrations) / runner (standalone)
docker-compose.yml       db + one-shot migrate + web on 3321
prisma/schema.prisma     24 models — org, projects, epics, sprints, issues,
                         subtasks, git branches/PRs, activity, inbox, rules, tokens
prisma/seed.ts           Acme Engineering, with enough history for Insights
src/lib/                 db, auth (scrypt + sessions), issues, automation, insights,
                         digest, github, mail, validators (zod)
src/app/api/             route handlers — session or bearer-token auth
src/app/(app)/           the signed-in shell and its screens
src/app/(auth)/          login, signup, password reset, verification
src/components/          board, backlog, roadmap, issue, mywork, insights, settings
src/app/globals.css      the design tokens, lifted from the design file
```

Passwords are scrypt-hashed; sessions are random tokens stored as SHA-256 hashes
and invalidated wholesale on password reset. Login is deliberately vague about
whether an address exists.

## Scripts

| Command | Does |
| --- | --- |
| `npm run docker:up` / `:down` / `:reset` / `:logs` | the whole stack |
| `npm run dev` | host dev server on 3321 |
| `npm run build` | prisma generate + next build |
| `npm run db:push` | sync schema |
| `npm run db:seed` | reset and reseed the demo org |
| `npm run db:studio` | Prisma Studio |
| `npm run emails` | render every email template to `.preview/emails/` |

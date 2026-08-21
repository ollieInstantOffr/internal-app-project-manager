# Arc

Git-native project management. An issue needs only a title; branches and pull
requests move it the rest of the way.

Built from the `App Design.dc.html` Claude Design file — all twelve screens, the
APIs behind them, the schema, and the automation engine that makes the tagline true.

**Next.js 16 · React 19 · PostgreSQL 16 · Prisma 7 · Resend**

---

## Running it

```bash
docker compose up -d
```

```bash
npm install && npx prisma db push && npm run db:seed && npm run dev
```

Then open http://localhost:3000 and sign in as **sam@acme.dev / arcdemo123**
(`mira@`, `dev@` and `ana@` share the password; Sam is the owner, Mira an admin,
Dev and Ana members).

The seed builds Acme Engineering: 3 projects, 97 issues, 7 sprints of history,
5 epics, an inbox, and enough status-change trail for Insights to compute real
velocity, cycle time and flow.

### Configuration

Everything lives in `.env` (see `.env.example`). Only `DATABASE_URL` is required —
the app degrades gracefully without the rest.

| Variable | Effect when unset |
| --- | --- |
| `DATABASE_URL` | required |
| `RESEND_API_KEY` | mail is logged instead of sent, nothing fails |
| `EMAIL_FROM` | falls back to `onboarding@resend.dev` |
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub sign-in and repo import are hidden |
| `GITHUB_WEBHOOK_SECRET` | the webhook returns 503; the in-app simulator still runs every rule |
| `CRON_SECRET` | the daily digest endpoint is disabled |
| `APP_URL` | links in emails default to `http://localhost:3000` |

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
npx tsx scripts/preview-emails.ts
```

writes every template to `.preview/emails/` so you can look at them without
sending. **Send test digest** on the notifications screen runs the real job
against your own account.

The digest fan-out is `POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET` —
point Vercel Cron or any scheduler at it.

---

## Layout

```
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
| `npm run dev` | dev server |
| `npm run build` | prisma generate + next build |
| `npm run db:push` | sync schema |
| `npm run db:seed` | reset and reseed the demo org |
| `npm run db:studio` | Prisma Studio |

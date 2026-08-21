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
npm run init:env && docker compose up -d --build
```

`init:env` writes `.env` with a generated database password and secrets; it
won't overwrite an existing one. Open **http://localhost:3321**. The app ships with **no data at all** — you land
on sign-up, and the first account you create becomes the owner of its
organization. From there it's three short steps: name the organization, invite
anyone you want, create the first project.

Three services come up: `db` (Postgres 16), `migrate` (a one-shot that syncs the
schema), and `web` (the Next.js standalone server). Cold start from an empty
volume to a healthy app takes about 10 seconds.

| Command | Does |
| --- | --- |
| `npm run init:env` | write `.env` with generated secrets |
| `npm run docker:up` | build and start everything |
| `npm run docker:logs` | tail the app |
| `npm run docker:down` | stop, keep the data |
| `npm run docker:reset` | wipe the volume and start over from empty |

`GET /api/health` round-trips the database and backs the container healthcheck.
The server listens on **3321 inside the container as well**, so the port is the
same everywhere and nothing ever binds 3000.

### Running the app outside Docker

Keep the database container and run the server on the host — same port, so
`APP_URL` and the links in emails stay correct. Stop `arc-web` first, or the
port is taken.

```bash
docker compose up -d db && npm install && npm run db:push && npm run dev
```

Postgres is published on **5434** for `psql` and `npm run db:studio`; inside the
compose network the app reaches it at `db:5432`.

### Configuration

Everything lives in `.env` (see `.env.example`), which `docker compose` reads
automatically. Only `DATABASE_URL` is required for host-side tooling — the
containers get theirs from compose. The app degrades gracefully without the rest.

| Variable | Effect when unset |
| --- | --- |
| `POSTGRES_PASSWORD` | **required** — compose refuses to start without it |
| `APP_URL` | `http://localhost:3321` |
| `RESEND_API_KEY` | mail is logged, and sign-in links are shown in-browser so you can still get in |
| `EMAIL_FROM` | falls back to `onboarding@resend.dev` |
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub sign-in and repo import are hidden |
| `GITHUB_WEBHOOK_SECRET` | the webhook returns 503; the in-app simulator still runs every rule |
| `CRON_SECRET` | the daily digest endpoint is disabled |
| `SESSION_SECRET` | a development default is used — set this in production |

---

## Deploying

The app is served at whatever `APP_URL` says — every link it generates (sign-in
links, invite emails, the OAuth callback, the webhook it registers) is built
from that one value, so setting it correctly is most of the work.

```bash
# .env on the host
APP_URL="https://arc.internal.instantoffr.com"
POSTGRES_PASSWORD="…"          # npm run init:env generates one
SESSION_SECRET="…"
```

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The overlay stops publishing Postgres to the host and binds the app to
`127.0.0.1:3321`, so a reverse proxy terminates TLS in front of it.
`Caddyfile.example` is a working starting point.

Session cookies are marked `Secure` automatically whenever `APP_URL` is
`https://` — no separate flag to remember, and no silently-insecure cookie if
you forget one.

### OAuth and webhooks reach the app from different directions

This matters for an internal hostname, because the two have different
reachability requirements:

| | Who calls the URL | Needs to be reachable from |
| --- | --- | --- |
| OAuth callback `/api/auth/github/callback` | the **user's browser**, via redirect | wherever your people are — internal is fine |
| Webhook `/api/webhooks/github` | **GitHub's servers**, outbound POST | the public internet |

So GitHub sign-in works perfectly well on an internal-only host. Webhooks do
not — GitHub cannot reach a name that only resolves inside your network. Either
expose just `/api/webhooks/*` publicly (see the Caddyfile), put a tunnel in
front of that path, or allowlist GitHub's hook ranges from
`https://api.github.com/meta`.

Nothing breaks without webhooks — issues simply stop moving on their own, and
**Settings → Integrations → Try an automation** still exercises every rule.

## Responsive

Desktop is the design's native size and is unchanged. Below that the fixed panes
give way rather than compress:

| Width | Behaviour |
| --- | --- |
| ≥ 1180px | as designed |
| ≤ 1180px | side panes narrow — rail, issue sidebar, sprint panel, queue |
| ≤ 1024px | panel headers wrap instead of overflowing; stat tiles go 2-up; backlog, settings and onboarding stack; wide tables scroll |
| ≤ 767px | rail becomes a drawer behind a top bar; board columns scroll one at a time with snap; issue sidebar moves below the content; My work drops the detail pane and a row opens the issue |
| ≤ 360px | stat tiles go full width |

Keyboard affordances (`⌘K`, `↑↓ next issue`, the shortcut card) are hidden on
touch, tap targets grow, and the bulk action bar scrolls horizontally rather
than running off the edge.

## The screens

| Route | Design | What it does |
| --- | --- | --- |
| `/` | — | Sends you to the app, the next onboarding step, or sign-in |
| `/login`, `/signup` | 3a | Passwordless: GitHub or a magic link; split layout |
| `/auth/verify` | — | Burns a sign-in link and starts the session |
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

Also `/projects/[key]/epics`, `/projects/new`, `/settings/{general,notifications,usage,danger}`
and `/invite/[token]`.

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
curl -H "Authorization: Bearer arc_…" http://localhost:3321/api/issues?project=WEB
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

Seven templates go out through Resend — sign-in link, invite, mention,
assignment, blocking nudge, CI failure, daily digest. All respect
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
prisma/schema.prisma     28 models — org, projects, epics, sprints, issues,
                         subtasks, git branches/PRs, activity, inbox, rules, tokens
src/lib/                 db, auth (sessions), magic-link, issues, automation, insights,
                         digest, github, mail, validators (zod)
src/app/api/             route handlers — session or bearer-token auth
src/app/(app)/           the signed-in shell and its screens
src/app/(auth)/          sign-in and sign-up (both passwordless)
src/components/          board, backlog, roadmap, issue, mywork, insights, settings
src/app/globals.css      the design tokens, lifted from the design file
```

**There are no passwords.** You sign in with GitHub, or with a link emailed to
your address — the same act whether the account exists yet or not.

Sign-in links are single-use, expire in 15 minutes, and are stored as SHA-256
hashes, so a database leak can't be replayed into a session. Opening one retires
any other outstanding links for that account. Requests are rate-limited to 5 per
address per 15 minutes, `redirectTo` accepts relative paths only (no open
redirect), and the response is identical for known and unknown addresses so it
can't be used to enumerate accounts. Sessions are random tokens, also stored
hashed.

With no `RESEND_API_KEY` set there would be no way in at all, so in that case
the link is returned to the browser and logged. That path is unreachable the
moment a key is configured.

## Scripts

| Command | Does |
| --- | --- |
| `npm run docker:up` / `:down` / `:reset` / `:logs` | the whole stack |
| `npm run dev` | host dev server on 3321 |
| `npm run build` | prisma generate + next build |
| `npm run db:push` | sync schema |
| `npm run db:studio` | Prisma Studio |
| `npm run emails` | render every email template to `.preview/emails/` |

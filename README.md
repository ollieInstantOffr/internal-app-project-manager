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
| `/projects/[key]/code` | 6a | Repo browser — file tree, reader, and the issues touching each file |
| `/projects/[key]/api` | 4a | API console — collections, request/response, assertions |
| `/projects/[key]/api/runs/[id]` | 4b | Run results, and one click from a failure to an issue |
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

## Repo browser

Read-only by design — editing lives in your editor. What the app adds is the
mapping a git host can't give you: **which issues touch this file**, which epic
owns the directory, who has been changing it, and which branches and PRs are in
flight against it.

The tree mirrors a branch (switchable), marks files that have open issues with a
dot, and `⌘P` filters by path. The reader syntax-highlights the file and shows
its size, line count and last commit.

**Select lines → open an issue against exactly those lines.** Click a line
number to anchor, shift-click to extend, then *New issue*. The range is stored
against the issue, so the sidebar can show `lines 42–48` next to it and the link
survives the file being edited. A range can also be attached to an existing
issue rather than creating a new one.

Ownership and last-changed come from the commits touching that path; the owning
epic is inferred from the issues already mapped into the directory. Trees,
files and commit lists are cached briefly so browsing doesn't burn GitHub's
rate limit.

## API console

A fifth item under each project. Collections come from the repository rather
than being maintained by hand: **when a project is linked to a repo, Arc finds
its `/api` folder and builds the collection automatically** — on creation, and
again whenever you press *Sync from repo*.

Next.js route handlers are understood properly. `src/app/api/issues/[key]/route.ts`
exporting `GET`, `PATCH` and `DELETE` becomes three requests at `/api/issues/:key`,
grouped into an **Issues** collection. Pages-router and plain files degrade to one
`GET` per file. Re-syncing keeps ids, so assertions you wrote survive a deploy,
and endpoints deleted from the repo disappear from the console.

**Imported requests arrive ready to send.** The sync reads each handler's own
Zod schema — following the import into `@/lib/validators` if that's where it
lives — and generates an example body from the *required* fields, which is the
smallest body that should succeed:

```jsonc
// POST /api/issues, from issueCreateSchema
{ "projectId": "string", "title": "string" }
```

Routes that validate by hand work too — no schema library required. Given the
common shape:

```ts
const body = await req.json().catch(() => null);
const name = typeof body?.name === "string" ? body.name : "";
```

it finds the variable bound to `req.json()`, collects every field read off it,
and takes the type from the `typeof` guard or an `Array.isArray` check.

It also picks up query params from `searchParams.get(...)` and adds
`Authorization: Bearer $env.API_TOKEN` to routes that read one.

**Re-syncing fills gaps rather than starting over.** A body you've edited is
never touched; one still empty — `null`, `{}` or whitespace — gets the generated
one, and the same goes for headers, params and assertions. The toast reports
what actually changed: `Synced 91 requests · 50 bodies filled`.

Collections and requests are editable: rename, duplicate, move a request between
collections, or delete either. Renaming a repo-derived collection detaches it
from its folder, so a later sync recreates the folder rather than reclaiming
your version. Deleting one warns you it will come back on the next sync.
Environments can be edited or deleted too, including the variables that
`$env.NAME` resolves against. Deletes happen immediately and offer an **Undo**
in the toast — no browser dialogs anywhere.

Environments are the deploys you already have, including per-PR previews.
`$env.NAME` and `{{NAME}}` interpolate into the URL, headers and body.

### Assertions

A small language, evaluated against the real response:

```
status == 200
body.token exists
body.user.role == owner
duration < 500ms
headers["set-cookie"] contains "Secure"
body.email matches ^\w+@
```

Supports `== != > < >= <= contains matches exists` against `status`, `duration`,
`body.<path>` and `headers[...]`. A line that can't be parsed **fails** rather
than silently passing, so a typo can never look green.

### The loop

Run a collection → an assertion fails → the failure panel prefills an issue with
the failing assertion as the title, and attaches the exact request and response
so it's reproducible. One result can only become one issue; filing it twice is
refused. Shortcuts: `⌘⏎` send, `⌘E` cycle environment, `⌘⇧I` issue from run.

Requests are executed server-side, so the console can reach hosts a browser
can't. That is deliberate — it's how you test an internal deploy — but it does
mean anyone who can add an environment can make the server issue HTTP requests
to it. Only `http` and `https` are allowed, and there's a 20s timeout.

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

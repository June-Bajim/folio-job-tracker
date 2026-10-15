# Folio

A responsive, authenticated job application tracker. Next.js / React / Tailwind frontend, Fastify API, PostgreSQL / Prisma, Better Auth, and a separate BullMQ / Redis reminder worker. All application data belongs to the signed-in user; no demo data is inserted on startup.

## Local setup (PowerShell, from this directory)

Requirements: Node.js 22.14 or newer, npm, Docker Desktop running Linux containers, and Google Chrome for the browser tests.

```powershell
npm ci --include=dev
Copy-Item .env.example .env
# Edit .env: replace BETTER_AUTH_SECRET with a random secret, at least 32 characters.
# Generate one with: node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

Open http://localhost:3000 and register an account. Open Mailpit at http://localhost:8025, follow the verification link, then sign in. Registration creates an empty workspace. The web app, API, and worker run together; Ctrl+C stops all three. PostgreSQL, Redis and the mail inbox remain running until `docker compose stop`. Data survives restarts in Docker volumes. Do not use `docker compose down -v` unless you intend to erase the development database and queue.

Services:

| Service       | Address               | Command                                                   |
| ------------- | --------------------- | --------------------------------------------------------- |
| Web           | http://localhost:3000 | `npm run dev:web`                                         |
| API           | http://localhost:4000 | `npm run dev:api`                                         |
| Worker        | No HTTP listener      | `npm run dev:worker`                                      |
| PostgreSQL    | localhost:5432        | Docker Compose                                            |
| Redis         | localhost:6381        | Docker Compose (6381 avoids a common existing Redis port) |
| Mailpit inbox | http://localhost:8025 | Docker Compose                                            |
| Mailpit SMTP  | localhost:1025        | Docker Compose                                            |

The frontend proxies `/api/*` to Fastify. Browsers use same-origin HTTP-only session cookies; server-rendered protected pages forward the session cookie to `/api/me`. Password hashing, session creation, logout and recovery are handled by Better Auth. Passwords must have at least ten characters. Reset links appear in Mailpit locally.

Next.js uses Webpack for both development and production because Turbopack's CSS subprocess failed on the Windows verification host.

## Configuration

Copy the root `.env.example`; API and worker load the root `.env`. The web server uses `API_URL` from its process environment (defaults to http://localhost:4000). For a different API host, set `API_URL` in the deployment environment, or in `apps/web/.env.local` during local development. The API destination is needed at both web build and runtime. No server secrets use the `NEXT_PUBLIC_` prefix.

| Variable                      | Meaning                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | PostgreSQL connection string; use a dedicated application database and TLS in production.                                                     |
| `REDIS_URL`                   | Redis URL; supports credentials, database path and `rediss:` TLS. Local default uses port 6381.                                               |
| `BETTER_AUTH_SECRET`          | Stable cryptographically random secret, at least 32 characters. Never commit it. Changing it invalidates sessions.                            |
| `BETTER_AUTH_URL`             | Public URL of the authentication server. Local: http://localhost:4000. Production: the public web origin when `/api/*` is proxied.            |
| `WEB_URL`                     | Exact public frontend origin, without trailing slash. Used for trusted origins, recovery redirects, and reminder links.                       |
| `API_PORT`                    | Fastify listener port; default 4000.                                                                                                          |
| `API_URL`                     | Internal API origin used by Next.js, without trailing slash. Default http://localhost:4000.                                                   |
| `EMAIL_PROVIDER`              | `smtp` for local development or `resend` for production.                                                                                      |
| `EMAIL_FROM`                  | Sender identity. Resend requires a verified sending domain.                                                                                   |
| `SMTP_HOST` / `SMTP_PORT`     | Local Mailpit: localhost / 1025. Used only with SMTP.                                                                                         |
| `SMTP_SECURE`                 | `true` for implicit SMTP TLS; local Mailpit uses `false`.                                                                                     |
| `SMTP_USER` / `SMTP_PASSWORD` | Optional authenticated SMTP credentials. Leave blank for Mailpit.                                                                             |
| `RESEND_API_KEY`              | Required only with `EMAIL_PROVIDER=resend`. Keep in the API and worker secret stores.                                                         |
| `NODE_ENV`                    | Set `production` for deployed API and worker. Production startup checks HTTPS URLs, a non-example secret, and the idempotent Resend provider. |

## Features and API

The dashboard computes real totals and status counts, upcoming interviews, reminders due within seven days, overdue reminders and recent status activity. Applications support all six statuses, notes, salary ranges, work arrangements and optional job URLs. List search, filters, sort and page are stored in query parameters. Application detail pages include editing, notes, status history, interview management and reminder management. Settings control name and IANA timezone. All timestamps are stored as UTC and rendered in the account timezone; application dates remain calendar dates. Event forms reject nonexistent daylight-saving times; for repeated autumn times, Luxon chooses an offset consistently.

Public endpoints are `/health` and Better Auth's `/api/auth/*` routes. Every other API route requires a session. The server scopes reads and mutations to the authenticated owner, including nested interviews and reminders. Invalid requests return `{ "error": { "code": "...", "message": "..." } }`, with validation issues on schema failures. Better Auth endpoints retain their library response format.

| Method           | Route                                               | Purpose                                    |
| ---------------- | --------------------------------------------------- | ------------------------------------------ |
| GET, PUT         | `/api/me`                                           | Account preferences                        |
| GET, POST        | `/api/applications`                                 | List / create                              |
| GET, PUT, DELETE | `/api/applications/:id`                             | Read / replace fields / cascade delete     |
| POST             | `/api/applications/:id/interviews`                  | Create interview                           |
| PUT, DELETE      | `/api/applications/:id/interviews/:childId`         | Update / delete interview                  |
| POST             | `/api/applications/:id/reminders`                   | Create reminder                            |
| PUT, DELETE      | `/api/applications/:id/reminders/:childId`          | Update and reschedule / delete             |
| POST             | `/api/applications/:id/reminders/:childId/complete` | Mark complete                              |
| POST             | `/api/applications/:id/reminders/:childId/cancel`   | Cancel                                     |
| GET              | `/api/schedule`                                     | Upcoming interviews and all open reminders |
| GET              | `/api/dashboard`                                    | Owner-scoped dashboard                     |

List query: `search`, `status`, `arrangement`, `sort` (`createdAt`, `dateApplied`, `company`), `page` (1-based), `pageSize` (1–100, default 10). PUT application requests contain the full editable record; optional values can be cleared with null. See `packages/shared/schemas.ts` for the reusable TypeScript/Zod request contract. A future Expo client can reuse these schemas and API endpoints; no mobile app is included.

## Reminder delivery and failure handling

PostgreSQL is the durable scheduling ledger. Every five seconds the worker reconciles pending reminders within a rolling 24-hour horizon into persistent delayed BullMQ jobs. Reminders farther away remain safely in PostgreSQL until their scheduling window. Redis uses AOF persistence and `noeviction`. Missing Redis jobs are recreated from the database.

Each edit increments a reminder revision, clears prior delivery data, and schedules a new delivery. Completion, cancellation and deletion invalidate old jobs immediately in the database; reconciliation removes obsolete queued jobs. Active jobs re-check ownership-related existence, revision, cancellation, completion and delivery state under a PostgreSQL row lock. An email already accepted before a cancellation cannot be recalled. Completion and email delivery are independent fields: sending never marks the reminder complete.

The worker retries up to eight times with exponential backoff from five seconds. The first attempt freezes the recipient and message body durably, and every retry uses a stable key derived from reminder ID and revision. A row lock prevents two workers from delivering the same revision concurrently. Resend's provider-side idempotency closes the crash window between provider acceptance and recording `sentAt`. Its keys last 24 hours, so the worker stops uncertain deliveries after 23 hours rather than risk a duplicate. Such reminders show a failed delivery with instructions to inspect provider logs before explicitly rescheduling. Completed deliveries are retained in PostgreSQL even after queue cleanup.

SMTP/Mailpit is a working local email alternative, but SMTP cannot guarantee exactly-once acceptance across a process crash after sending. A deterministic Message-ID helps inspection; it is not a provider deduplication guarantee. Production startup therefore requires Resend. `sent` means provider acceptance, not guaranteed inbox delivery. Configure provider bounce/delivery monitoring separately.

## Verification

Run against the local development services. Tests create uniquely named fictional accounts and clean up their own records; they do not truncate the database. Do not point tests at a production database. Stop a separately running reminder worker before integration tests, since those tests exercise the same queue.

```powershell
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run build
```

Unit tests cover server validation. Integration tests cover registration/login/logout, CRUD, filtering, searching, pagination, ownership isolation, status history, preferences, cascades, persistent jobs, rescheduling, cancellation/completion, retries and duplicate prevention. Browser tests cover registration, login, adding an application, changing status, and creating an interview and reminder, plus mobile overflow checks. Playwright starts its own API/web servers or reuses existing local servers. It uses installed Chrome; change the configured browser channel if your CI supplies a different Chromium installation. Browser traces are retained on failure.

## Production deployment

Use three long-running Node services, managed PostgreSQL, managed Redis with persistence, and a Resend account. This worker requires an always-running host; it is not a browser timer or a serverless request handler.

1. Provision PostgreSQL and Redis on private networking; enable TLS and backups. Set all applicable variables above in secret/environment stores, including `NODE_ENV=production`, `EMAIL_PROVIDER=resend`, a verified `EMAIL_FROM`, and `RESEND_API_KEY` on the API and worker.
2. Put the web frontend on a public HTTPS origin, for example `https://jobs.example.com`. Set `WEB_URL` and `BETTER_AUTH_URL` to that origin. Set `API_URL` to the private Fastify service origin on the web service at **build and runtime**. Next proxies `/api/*`; do not rewrite or strip `/api/auth`. Preserve `Origin`, cookies and `Set-Cookie`. Keep cookies on the same public site.
3. Install and generate: `npm ci`, then `npm run db:generate`. Build with `npm run build`. Run migrations once as a release step with `npm run db:migrate` before starting the new services. The build includes emitted TypeScript for both backend services. Keep the generated Prisma client and its platform-specific engine in the deployed artifact; build on the deployment platform.
4. Frontend process: `npm run start:web` (port 3000; use `PORT` to change it). API process: `npm run start:api` (`API_PORT`, default 4000). Worker process: `npm run start:worker` (no HTTP port). Set working directory to the repository root. Deploy the worker and API from the same schema-compatible release.
5. Configure process supervision with automatic restart and graceful SIGTERM. Fastify and the worker shut down connections on termination. Use API `/health` for process liveness and monitor PostgreSQL/Redis connectivity separately. Scale worker replicas only within the database connection budget; row locks and provider idempotency coordinate replicas.
6. Verify registration, recovery email, owner-isolated data, an imminent reminder, and delivery through your provider's logs before enabling real traffic. No external deployment or production email delivery is implied by local tests.

## Operations

API logs use Fastify/Pino JSON; request query strings, cookies and authorization headers are omitted from request logs. Worker logs include scheduling and delivery errors. Collect stdout/stderr centrally, alert on worker restarts, repeated scheduling failures, queue failures and database reminders with `deliveryStatus='failed'`. Check provider acceptance and bounce logs when investigating delivery. Do not log passwords, secrets, session tokens or email bodies. Configure retention appropriate to job search data.

Use automated encrypted PostgreSQL backups with point-in-time recovery, restricted access and regular restore drills. A local backup example:

```powershell
New-Item -ItemType Directory -Force backups
docker compose exec postgres pg_dump -U folio -Fc -f /tmp/folio.dump folio
docker compose cp postgres:/tmp/folio.dump ./backups/folio.dump
```

Restore into a separate empty database with `pg_restore` and verify before switching services. Back up Redis AOF as operational state; PostgreSQL reconciliation can rebuild pending schedules after Redis loss. Avoid replaying old database backups against live email delivery without reviewing sent records and provider logs, as restored snapshots can predate accepted emails.

The repository has no default seed account. Automated tests use fictional records explicitly and remove them. External Resend credentials, a verified sender, production hosting, DNS/TLS, backups and monitoring remain deployment configuration.

## Workspace tools and account controls

Applications now support CSV import/export from the list page. Download the blank template for canonical headers; `company` and `jobTitle` are required. Optional columns are `jobUrl`, `location`, `arrangement`, `salaryMin`, `salaryMax`, `currency`, `status`, `dateApplied` and `notes`. Dates use YYYY-MM-DD, salaries are numeric, and values follow the existing application schemas. Import accepts at most 500 rows / 1 MB, shows the first ten normalized rows, reports row-level errors, and requires confirmation. Invalid batches save nothing. Import and initial status history are committed atomically. A per-user normalized batch checksum prevents reimporting the same data; it does not deduplicate individual records from different files. Export includes all of the owner's applications and protects spreadsheet formula-leading cells. Folio imports restore the escaped leading characters for a round trip.

Contacts support name, company, title, email, phone, profile URL and communication notes. Add a contact from application details to link it; manage all contacts from the Contacts page. Deleting an application unlinks its contacts and preserves them in the owner's contact list. Deleting the account removes the contacts.

The document library stores resume/cover-letter PDF and DOCX files as PostgreSQL binary data. No new object-storage credentials are needed. Files are limited to **3 MB each** and **100 MB per account**, which keeps JSON/base64 uploads suitable for the existing Netlify proxy. The server checks extension and file signatures, rejects unsafe filenames, derives the download MIME type, and provides authenticated attachment downloads with no-store/nosniff headers. The web app transfers file data through authenticated JSON responses and downloads a local Blob so that errors are shown before a file is saved; direct attachment endpoints remain available for API clients.

Each upload creates an immutable, numbered version with its label, notes, size and SHA-256 digest. Application details link a specific version rather than a moving latest-version pointer. New versions leave submitted files unchanged. Deleting a document explicitly deletes all versions and removes its application links. PostgreSQL backups now contain the files; size backup retention and encryption accordingly. For substantially larger libraries, migrate the binary storage to an authenticated object store while retaining these version IDs.

Email verification is required for password sign-in and protected API access. Registration sends a one-hour verification link; `/verify-email` can resend it. **Existing unverified accounts must verify their email too**. Production must have a working verified Resend sender before releasing this change. Locally, open Mailpit at http://localhost:8025, follow the verification link, and sign in. Password changes verify the current password and revoke other sessions; password recovery also revokes other sessions. Account deletion requires the current password and the exact `DELETE` confirmation, then uses Better Auth to remove the user and sessions. Database cascades remove owned applications, interview/reminder/history records, contacts, import records, documents, binary versions and document links. Queued jobs contain only record IDs/revisions and are invalidated by deletion; reconciliation removes stale jobs. An email already accepted by a provider cannot be recalled. Historical backups and mail-provider retention remain governed by their retention policies.

## Delivery monitoring

The Email delivery page shows the signed-in owner's pending, accepted, failed and delayed reminder emails, plus worker heartbeat status and recent attempt history. A dashboard notice links to open failures. Explicit retry requires confirmation and creates a new revision. For uncertain sends, inspect provider logs first; retrying an email already accepted under an older key can send another copy. Unverified owners' reminders fail without emailing them and can be retried after verification.

Workers persist heartbeat and reconciliation success every five seconds. A worker is stale after two minutes; reminders pending more than five minutes after their due time count as delayed. Durable attempt records distinguish success from temporary/exhausted failure and remain separate from reminder completion. Customer-visible errors are generic; structured failure logs contain record IDs, revision and error class, without recipients or email bodies. Stopped-worker heartbeat records age out after seven days.

For external uptime/incident monitoring, set a separate random **MONITORING_TOKEN** (at least 32 characters) on the API service, then configure your monitoring service to request:

```text
GET https://YOUR-API.up.railway.app/health/worker
Authorization: Bearer YOUR_MONITORING_TOKEN
```

The endpoint returns 200 only when a worker has recently reconciled successfully and there are no open failed or delayed deliveries; otherwise it returns 503 (or 500 if the database cannot be read). Without the correct token it returns 401. Its aggregate counts span the service and are therefore available only with this operations token. Keep it out of Netlify's browser variables. `/health` remains a separate process-liveness endpoint. Configure the external monitor to alert on non-200 responses and recovery; no external monitor is automatically provisioned by this repository.

## Releasing this update to Railway and Netlify

1. Ensure the production Resend key and verified sender work; existing accounts will need a verification email after this release. All public origin variables should point to the appropriate site without a path.
2. Deploy the API first with `npm run db:migrate` as its Railway pre-deploy command. Migration `202610150003_workspace_tools` adds the new tables and delivery fields without removing existing applications. The backend build command is `npm ci --include=dev && npm run db:generate && npx tsc -p tsconfig.build.json`; keep the repository root as the service root. Keep development dependencies available for release migrations (`RAILPACK_PRUNE_DEPS=false` when using Railpack).
3. Deploy the worker from the same commit, after the migration. Its start command remains `npm run start:worker`. Set the optional MONITORING_TOKEN on the API if using external health checks.
4. Deploy Netlify from that commit. Base directory: repository root; package directory: `apps/web`; build command: `npx prisma generate && npx next build apps/web --webpack`; publish: `apps/web/.next`; leave custom Functions directory unset. Set API_URL to the public Railway API origin for both Builds and Functions.
5. Verify a real email verification, CSV preview/import/export, a PDF upload and version link, and a due reminder in your deployed environment. Local tests are not proof of external delivery or hosting success.

### Additional API routes

All `/api` routes below require an authenticated, verified owner except the Better Auth verification endpoints.

| Method      | Route                                     | Purpose                                                                           |
| ----------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| GET         | `/api/applications/export`                | Application CSV; `?format=json` returns a base64 file envelope for the web client |
| GET         | `/api/applications/import/template`       | Blank CSV template; also supports `?format=json`                                  |
| POST        | `/api/applications/import/preview`        | Validate `{csv}` and preview the first ten rows                                   |
| POST        | `/api/applications/import`                | Atomically import a valid `{csv}` batch                                           |
| GET, POST   | `/api/contacts`                           | Search/list and create contacts                                                   |
| PUT, DELETE | `/api/contacts/:id`                       | Replace contact fields or delete                                                  |
| GET, POST   | `/api/documents`                          | List metadata or upload a new document with its first version                     |
| POST        | `/api/documents/:id/versions`             | Append a new immutable version                                                    |
| GET         | `/api/document-versions/:id/download`     | Authenticated attachment download                                                 |
| GET         | `/api/document-versions/:id/content`      | Authenticated `{filename,mimeType,content}` base64 envelope                       |
| DELETE      | `/api/documents/:id`                      | Delete the document, all versions and application links                           |
| GET, POST   | `/api/applications/:id/documents`         | List submitted versions or link `{versionId}`                                     |
| DELETE      | `/api/applications/:id/documents/:linkId` | Unlink a submitted version                                                        |
| GET         | `/api/delivery-status`                    | Owner's delivery counts, failures, attempts and worker status                     |
| GET         | `/api/reminders/:id/attempts`             | Recent delivery attempt history                                                   |
| POST        | `/api/reminders/:id/retry`                | Explicitly retry a failed, open reminder with `{confirm:true}`                    |
| POST        | `/api/auth/send-verification-email`       | Send verification to `{email,callbackURL}`                                        |
| POST        | `/api/auth/change-password`               | Better Auth `{currentPassword,newPassword,revokeOtherSessions:true}`              |
| POST        | `/api/auth/delete-user`                   | Better Auth account deletion with `{password,confirmation:"DELETE"}`              |

Document uploads use `{name,kind,label,filename,content,notes}`. `kind` is `resume` or `cover_letter`; `content` is base64; `label` identifies the immutable version. Repeated uploads to the versions endpoint keep the existing document name/type. Contact fields are defined in `contactSchema` in `packages/shared/schemas.ts`.

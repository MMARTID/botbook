# BotBook — AI Coding Agent Reference

## Project Overview

BotBook is a multi-tenant SaaS platform that provides AI-powered voice receptionists for small businesses in Spain (hair salons, barbershops, physiotherapy clinics, beauty centers, etc.). Each business gets one or more voice agents built on top of the Vapi or Retell voice-AI platform. European accounts use Retell.ai by default for RGPD compliance; Vapi is kept for future expansion outside Europe. The agents handle incoming phone calls, answer questions, check business hours, check availability, and book appointments directly into the business's Google or Outlook calendar.

The codebase is fully in Spanish — UI copy, comments, variable names, and business logic are written in Spanish. Keep everything in Spanish when modifying code or adding user-facing text.

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Backend runtime** | Node.js 20, TypeScript 5.9, ESM (`"type": "module"`) |
| **HTTP framework** | Fastify 5 |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS v3 |
| **Database** | PostgreSQL 15 + Prisma ORM |
| **Cache / Queue** | Redis 7 + BullMQ |
| **Voice AI** | Vapi API + Retell.ai |
| **LLM** | Anthropic Claude (call classification) |
| **Object storage** | Cloudflare R2 (S3-compatible) |
| **Telephony** | Twilio (phone number purchase, inbound/outbound) |
| **Billing** | Stripe (Checkout Sessions, Customer Portal, webhooks) |
| **Calendar** | Google Calendar API, Microsoft Graph (Outlook) |
| **Auth** | JWT (custom) + Google OAuth 2.0 |
| **Containerization** | Docker + Docker Compose |
| **Testing** | Vitest (backend), MSW (mocking), @testcontainers/postgresql |

## Monorepo Layout

```
/
├── src/                    # Backend source (ESM TypeScript)
│   ├── server.ts           # Fastify entry point
│   ├── plugins/            # Fastify plugins (auth, CORS, rate-limit, multipart)
│   ├── modules/            # Domain route modules (one folder per domain)
│   ├── adapters/           # External API adapters (Vapi, Retell, Twilio)
│   ├── lib/                # Shared utilities (Prisma, Redis, Stripe, queue, storage)
│   ├── jobs/               # BullMQ background workers
│   └── config/             # Static configuration constants
├── frontend/               # Next.js 14 application
│   ├── src/app/            # App Router pages
│   ├── src/components/     # React components
│   ├── src/lib/            # API client, types, helpers, SEO, ROI
│   └── src/hooks/          # Custom React hooks
├── prisma/                 # Prisma schema + migrations
├── dist/                   # Compiled backend output (tsc)
├── scripts/                # One-off scripts (e.g. E2E tests)
├── tests/                  # Vitest test suite
├── Dockerfile              # Multi-stage build
└── docker-compose.yml      # Postgres + Redis + backend + ngrok (dev profile)
```

### Backend Module Organization (`src/modules/`)

Each module is a folder containing a `routes.ts` file (and optionally `service.ts`, `schemas.ts`). Routes are registered in `src/server.ts` with a prefix when needed.

| Module | Prefix | Auth | Purpose |
|--------|--------|------|---------|
| `auth` | `/auth` | No | JWT login, Google OAuth callback, token issuance, registration |
| `businesses` | *(none)* | Yes | Business CRUD, stats, `me` endpoints, agent prompt rebuild on update |
| `agents` | *(none)* | Yes | Agent CRUD, sync to Vapi/Retell assistants |
| `calls` | *(none)* | Yes | Call logs, transcripts, outcomes (paginated) |
| `recordings` | *(none)* | Yes | Recording metadata, review notes |
| `calendar` | `/calendar` | Yes* | Google/Outlook OAuth, list events, book appointments |
| `bookings` | `/booking-settings` | Yes | Services, professionals, booking capacity |
| `billing` | `/billing` | Yes* | Stripe checkout, portal, subscription summary, webhooks |
| `phone` | `/phone` | Yes | Twilio phone number status, manual provisioning retry |
| `places` | *(none)* | Yes | Google Places autocomplete & details |
| `files` | `/agents` | Yes | Agent file uploads (multipart, 10MB limit) |
| `onboarding` | *(none)* | Yes | Onboarding state: progress, dismiss, complete |
| `demo` | `/demo` | No | Public landing voice demo: `POST /demo/web-call` accepts `{ niche? }` and creates a Retell web call against that niche's demo agent, falling back to the generic one (10 req/min) |

\* Except OAuth callbacks (`/calendar/auth/*/callback`) and Stripe webhook (`/billing/webhook`).

### Key Libraries (`src/lib/`)

- `prisma.ts` — Prisma Client singleton with `globalThis` hot-reload guard.
- `redis.ts` — IORedis connection (used by BullMQ and caching).
- `queue.ts` — BullMQ queues (`recordingQueue`, `classifyQueue`).
- `storage.ts` — R2/S3 client for file uploads (recordings, agent files).
- `stripe.ts` — Stripe SDK client singleton.
- `twilio.ts` — Twilio SDK singleton. Uses API Key + Secret when available; falls back to Auth Token.
- `microsoftGraph.ts` — Microsoft Graph OAuth + Calendar API helpers.
- `agentBootstrap.ts` — Default agent config, Vapi/Retell payload builder, safe assistant naming.
- `businessSchedule.ts` — Business hours validation logic with Zod schemas.
- `availability.ts` — Booking availability check (professionals, capacity, overlapping bookings). Returns available professionals with IDs for explicit selection.
- `logUtils.ts` — Shared logging helpers (`errorMessage`, `callLabel`).
- `managedAgentPrompt.ts` — Dynamic system prompt builder from business settings (tone, goal, style, escalation).
- `ngrok.ts` — Fetches public ngrok URL for local Vapi/Retell webhooks.

### Configuration (`src/config/`)

- `serverConfig.ts` — Mutable singleton for runtime config (e.g. `webhookUrl` from ngrok).
- `vapi.ts` — Vapi catalog constants: voice providers (9), voice IDs (28), LLM providers (4) + models, STT providers (7) + models.

## Frontend Architecture

### Framework & Routing

- **Next.js 14** with App Router (`frontend/src/app/`).
- Port 3001 for dev and production.
- **Proxy:** `/api/backend/:path*` → `http://localhost:3000/:path*` (next.config.mjs rewrites).
- **Redirects:** Plurals to singulars (`/peluquerias` → `/peluqueria`).

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Dashboard (protected) — calls, stats, setup score, file uploads, upcoming events |
| `/landing` | Generic conversion landing |
| `/login`, `/register`, `/register/business`, `/register/business/niche`, `/register/business/services`, `/register/business/team`, `/register/business/calendar` | Auth flow |
| `/auth/google/callback` | Google OAuth session consumption |
| `/barberia`, `/peluqueria`, `/fisioterapia`, `/centro-de-estetica`, `/salon-de-unas` | Niche SEO landings |
| `/planes` | Pricing page with ROI-aware headline |
| `/checkout?plan=` | Stripe Embedded Checkout |
| `/checkout/resultado` | Post-checkout reconciliation polling |
| `/ajustes` | Full business setup (schedule, services, professionals, calendar, agent settings) |
| `/ajustes/facturacion` | Billing summary & Stripe Customer Portal |
| `/settings` | Calendar OAuth callback handler (Google/Outlook) |
| `/legal/privacidad` | Privacy policy — covers the voice demo, recorded calls and calendar scopes |
| `/legal/aviso-legal` | Legal notice — service terms, trial, withdrawal |

`/legal/*` routes must stay listed in `AppShell`'s `publicRoutes`, otherwise they inherit the
authenticated chrome. Both pages carry `LegalTodo` blocks marking the registration data
(razón social, CIF, domicilio) that a human must supply before launch — do not invent those
values, and do not delete the markers until they are filled.

`app/opengraph-image.tsx` renders the shared social card with `next/og` using the design tokens.
There is no static OG asset; edit that file to change what WhatsApp and X display.

### State & Data

- **TanStack Query** (`@tanstack/react-query`) for all server state. Config: `staleTime: 30s`, no retry, no refetch on focus.
- **BusinessProvider** context exposes `business`, `isLoadingBusiness`, `hasToken`, `isError`.
- **Auth token** stored in `localStorage` as `botbook_token` (legacy keys `token`, `jwt` also checked).
- **Pending plan** stored in `localStorage` as `botbook_pending_plan` for post-registration checkout flow.
- **ROI context** stored in `localStorage` + `sessionStorage` with 1-hour TTL for calculator → pricing continuity.

### Key Components

- `SiteLanding` — Reusable landing page with niche content injection. Renders `SectorDataSection`
  unconditionally: niche pages pass their own `sectorData`, the generic landing falls back to
  `generalSectorData`. Every published figure needs an external cited source (see Evidence rules).
- `LandingHero` — Hero with CTA and `HeroConversation` widget. The hero only claims full viewport
  height from `lg` up; on mobile the proof panel must stay above the fold.
- `HeroConversation` — Silent, non-audio demo of a call. Doubles as the accessible alternative to
  the microphone demo: its `sr-only` description is generated from the scene currently on screen,
  so it must stay in sync if the scenes change. Minimum type size is 14px.
- `RevenueLossCalculator` — Interactive sliders (ticket, lost calls/week) with ROI math. The CTA
  always calls `activateRoiContext`, touched or not: the button names a figure and `/planes` has
  to receive it.
- `PlansWithRoi` / `PlansHeadline` — Pricing cards, ROI-aware copy. Reads `?plan=` from the URL to
  flag the card the visitor already chose, and renders the value contrast from
  `calculatePlanValueContrast` only when the visitor's own estimate covers the plan.
- `DemoVoiceCall` — Real Retell voice demo using `retell-client-js-sdk` with live transcription.
  The browser asks the backend for a web call (`POST /demo/web-call`, public, 10 req/min), which
  creates it via Retell `create-web-call` and returns the access token. The landing sends its
  niche slug (`peluqueria`, `barberia`, …) and the backend picks the matching
  `RETELL_DEMO_<NICHO>_AGENT_ID`, falling back to the generic `RETELL_DEMO_AGENT_ID`.
  It is a real dialog: `role="dialog"`, `aria-modal`, focus trap on Tab, body scroll lock.
  All failures go through `describeDemoError`, which maps config/permission/network causes to
  Spanish copy. **Never surface `error.message` from the SDK or an env-var name to the user.**
- `LegalPage` / `LegalSection` / `LegalTodo` — Read-mode shell for the `/legal/*` pages.
- `BusinessHoursEditor` — Weekly schedule editor (up to 3 intervals per day).
- `AgentSettingsEditor` — Tone, goal, response style, escalation strategy.
- `UpcomingCalendarEvents` — Horizontal carousel of upcoming calendar events, refreshes every 5 min.
- `AppShell` — Protected layout with nav (Panel, Ajustes, Facturacion), logout, mobile back button.

### Frontend Lib (`frontend/src/lib/`)

- `api.ts` — Axios client with Bearer token interceptor. All backend endpoint wrappers.
- `types.ts` — Domain types: `Business`, `Agent`, `Call`, `BillingSummary`, `CalendarEvent`, etc.
- `plans.ts` — Static plan definitions: Inicio (69€/100min), Pro (149€/400min), Scale (299€/1000min).
  Also exports `TRIAL_DAYS` and `TRIAL_REASSURANCE`; `TRIAL_DAYS` must match `CHECKOUT_TRIAL_DAYS`
  in `src/modules/billing/service.ts`, which is what Stripe actually applies. Never hardcode a
  plan name in copy — derive it from `starterPlan.name` or the `plan` object.
- `niche-landings.ts` — 600+ lines of SEO copy, hero text, conversations, benefits, FAQ per niche,
  plus `generalSectorData` (the cross-niche proof block used by the generic landing).
- `roi-context.ts` — ROI calculation and plan value contrast.
- `seo.ts` — Site metadata, structured data (JSON-LD), absolute URL builder.
- `format.ts` — Currency, date, duration, call status labels.
- `billing-navigation.ts` — Pending plan helpers.
- `business-type.ts` — Business type labels, Places API keyword detection and per-niche onboarding texts (`BUSINESS_TYPE_ONBOARDING_TEXTS`).
- `vapi.ts` — Vapi configuration constants (mirrors backend catalog).
- `service-templates.ts` — Per-niche service templates shown during registration (`/register/business/services`).

## Build & Run Commands

### Backend

```bash
# Development (tsx watch)
npm run dev

# Compile
npm run build

# Production start
npm start

# Database
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio

# Lint / type-check
npm run lint
npm run typecheck

# Tests
npm run test          # vitest run
npm run test:watch    # vitest
npm run test:coverage # vitest run --coverage
```

### Frontend

```bash
cd frontend

# Development server on port 3001
npm run dev

# Production build
npm run build

# Start production server
npm start

# Type-check without emitting (there is no `typecheck` script in frontend/package.json)
npx tsc --noEmit

# Lint
npm run lint
```

> **Never run `npm run build` while `npm run dev` is running.** Both write to `frontend/.next`, and
> the production build invalidates the dev server's CSS and route manifests — the site keeps
> returning 200 but renders completely unstyled. Same trap if two dev servers race for port 3001.
> Recovery: stop the dev server, `rm -rf frontend/.next`, start it again.

### Docker Compose

```bash
# Development (backend with tsx watch, ngrok, postgres, redis)
docker compose --profile dev up

# Production (compiled backend only)
docker compose --profile prod up
```

- Backend exposed on `localhost:3000`
- Prisma Studio exposed on `localhost:5555`
- Frontend exposed on `localhost:3001`
- Ngrok dashboard on `localhost:4040` (dev profile)

## Environment Variables

Copy `.env.example` to `.env` and fill in all required secrets. Key groups:

| Group | Variables |
|-------|-----------|
| **Database** | `DATABASE_URL` |
| **Redis** | `REDIS_URL` |
| **Vapi** | `VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `VAPI_BASE_URL` |
| **Retell** | `RETELL_API_KEY`, `RETELL_BASE_URL` |
| **Demo (landing)** | `RETELL_DEMO_AGENT_ID` (genérico), `RETELL_DEMO_<NICHO>_AGENT_ID` (por landing de nicho: `PELUQUERIA`, `CENTRO_ESTETICA`, `SALON_UÑAS`, `BARBERIA`, `FISIOTERAPIA`), `RETELL_DEMO_MAX_DURATION_SECONDS` |
| **JWT** | `JWT_SECRET` — required; server exits if missing |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_INICIO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **Google Calendar OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| **Outlook Calendar OAuth** | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` |
| **Google Login OAuth** | `GOOGLE_AUTH_CLIENT_ID`, `GOOGLE_AUTH_CLIENT_SECRET`, `GOOGLE_AUTH_REDIRECT_URI` |
| **Google Places** | `GOOGLE_PLACES_API_KEY` |
| **R2 / S3** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_REGION`, `R2_ENDPOINT` |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (dev), `TWILIO_API_KEY`, `TWILIO_API_SECRET` (prod), `TWILIO_PHONE_NUMBER_COUNTRY`, `TWILIO_SPAIN_BUNDLE_SID` |
| **Server** | `FRONTEND_URL`, `PORT`, `NODE_ENV`, `LOG_LEVEL` |

## Authentication & Authorization

The backend uses a custom JWT scheme:

1. On login / Google OAuth, the server issues a JWT signed with `JWT_SECRET` (7-day expiry).
2. The frontend stores the token in `localStorage` under key `botbook_token` (legacy keys `token` and `jwt` are also checked).
3. The token is sent as `Authorization: Bearer <token>`.
4. The `authPlugin` (`src/plugins/auth.ts`) decodes it with `jsonwebtoken` and decorates `request.user` with `{ id, businessId }`.
5. Routes that need auth use `onRequest: fastify.authenticate` or `preValidation: [fastify.authenticate]` in their route options.

All business-scoped data is filtered by `businessId` from the token. Never trust a `businessId` coming from the request body for read/write operations — always use `request.user.businessId`.

### Google OAuth Flow (Auth)

- `GET /auth/google` generates an OAuth URL with `select_account` prompt and stores `state` in Redis (60s TTL).
- `GET /auth/google/callback` validates `state` against Redis, exchanges `code` for tokens, verifies ID token, creates/links user, stores JWT in a **HttpOnly session cookie**, and redirects to frontend.
- `POST /auth/google/session` reads the session cookie, retrieves JWT from Redis (atomic get+delete), clears the cookie, and returns the token to the frontend.

## Request Validation & Error Handling

- **Validation:** Use `zod` schemas for route bodies and params. Return `400` with `error.errors` on `ZodError`.
- **Global error handler** (`server.ts`): Normalizes all errors to `{ statusCode, error, message }`. Handles both `Error` instances and plain error objects (e.g. rate-limit errors from `@fastify/rate-limit`). Logs full error details with Pino. Returns generic "Internal server error" for 5xx to avoid leaking internals.
- **Rate limiting:** Default 100 req/min. Vapi and Retell webhook endpoints override to 300 req/min. Auth endpoints have stricter limits: 10/min (`/login`, `/register`) and 5/min (`/register-first-user`). Places endpoints use 10/min.

## Database (Prisma)

The schema lives in `prisma/schema.prisma`. Key models:

- `Business` — tenant root; holds Stripe billing state, calendar tokens (encrypted), schedule JSON, agent settings, booking capacity.
- `User` — belongs to a Business; supports password (bcrypt) + Google OAuth login (`googleId`).
- `Agent` — voice agent config; `vapiAssistantId` links to Vapi and `retellAgentId`/`retellLlmId` link to Retell. Includes voice/LLM/STT provider configs, files, integrations.
- `Call` — a phone call handled by Vapi or Retell. Status enum: `INITIATED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `TIMED_OUT`. Outcome enum: `RESOLVED`, `FRUSTRATED`, `NO_ANSWER`, `ESCALATED`, `LEAD_CAPTURED`.
- `Booking` — outcome extracted from a call; now stores `professionalId`, `serviceId` and `durationMinutes` to track who performs the appointment and how long it lasts.
- `Transcript` / `Recording` — call artifacts. Recording has `storageKey` and `storageUrl` for R2.
- `Lead` — structured lead data captured during a call.
- `Service` / `Professional` / `ProfessionalService` — booking catalog (many-to-many between professionals and services).
- `OnboardingState` — per-business onboarding state. Tracks `dismissedAt`, `completedAt` and optional step metadata. The actual step completion is computed live from `Business.schedule`, `Service`, `Professional` and calendar connection state.
- `StripeWebhookEvent` — idempotency guard for Stripe webhooks.

### Stripe Billing Fields on `Business`

```
stripeCustomerId (unique)
stripeSubscriptionId (unique)
stripePriceId
subscriptionStatus (enum SubscriptionStatus)
subscriptionCurrentPeriodStart / End
subscriptionTrialEnd
subscriptionCancelAtPeriodEnd (boolean)
```

### Twilio Phone Number Fields on `Business`

```
twilioPhoneNumber (unique)
twilioPhoneNumberSid (unique)
twilioPhoneNumberPurchasedAt
twilioPhoneNumberStatus (default "pending")
vapiPhoneNumberId (unique)
retellPhoneNumberId (unique)
retellPhoneNumber (unique)
```

### Calendar Fields on `Business`

```
calendarProvider
googleRefreshToken (Text)
googleCalendarId
googleCalendarConnected (default false)
googleCalendarDisconnectedAt
googleCalendarLastError (Text)
outlookRefreshToken (Text)
outlookCalendarId
outlookUserEmail
outlookCalendarConnected (default false)
outlookCalendarDisconnectedAt
outlookCalendarLastError (Text)
```

### Orchestrator Field on `Business`

```
orchestrator (String, default "retell")
```

Determines the voice-AI provider for the business. `detectVoiceOrchestrator(countryCode)` defaults to `retell` for RGPD-compliant European countries and `vapi` for the rest. The value is set at registration and stored in `Business.orchestrator`.

### Business Type Field on `Business`

```
businessType (String, default "other")
```

Stores the business niche selected during registration. Used to label agents and to drive per-niche agent templates in `agentBootstrap.ts`.

Run migrations in dev with `npm run prisma:migrate`. In production, generate the client before starting (`prisma generate`).

## Background Jobs (BullMQ)

Workers are initialized in `src/server.ts` and consume from Redis-backed queues:

1. **`process-recording`** (`src/jobs/processRecording.ts`)
   - Downloads the call recording from Vapi or Retell and uploads it to R2.
   - Worker concurrency: 3.
   - Updates `Recording` with `storageKey` and `storageUrl`.
   - Job options: 3 retries, exponential backoff 2s base.

2. **`classify-call`** (`src/jobs/classifyCall.ts`)
   - Sends the transcript to Anthropic Claude (`claude-haiku-4-5`, `max_tokens: 10`) to classify the call outcome.
   - Worker concurrency: 5.
   - Prompt asks for ONE of: `RESOLVED`, `FRUSTRATED`, `NO_ANSWER`, `ESCALATED`, `LEAD_CAPTURED`.
   - Post-processes: trims, uppercases, validates against Prisma enum. Falls back to `NO_ANSWER` on invalid response.

3. **Zombie call cleanup** (`src/jobs/cleanupZombieCalls.ts`)
   - Scheduled job every 15 minutes (fixed jobId `zombie-call-cleanup-scheduler`).
   - Threshold: 60 minutes.
   - Marks stale `IN_PROGRESS` calls as `TIMED_OUT`.

All workers log to stdout. Jobs retry up to 3 times with exponential backoff.

## Voice Orchestrators (Vapi & Retell)

The backend supports two voice-AI orchestrators. `Business.orchestrator` decides which adapter is used for a given business (`vapi` or `retell`). Registration defaults to Retell for European countries and Vapi for the rest.

### Vapi (`src/adapters/vapi/VapiAdapter.ts`)

- Single source of truth for all Vapi API calls. Never call the Vapi API directly from route handlers.
- **Endpoints used:** `POST /assistant`, `PATCH /assistant/{id}`, `GET /assistant/{id}`, `DELETE /assistant/{id}`, `GET /call/{id}`, `POST /file`, `GET /assistant?limit=1` (health check), `POST /phone-number`, `PATCH /phone-number/{id}`, `DELETE /phone-number/{id}`, `GET /phone-number`.
- Webhooks from Vapi hit `POST /webhooks/vapi`. The endpoint verifies the HMAC-SHA256 signature (`x-vapi-signature`) using `VAPI_WEBHOOK_SECRET` with timing-safe comparison.
- Supported Vapi webhook events: `function-call`, `end-of-call-report`, `status-update`. Other events are acknowledged (`200`) but ignored.
- `function-call` handlers are in `src/adapters/vapi/webhookHandlers.ts`. They implement `check_business_hours`, `check_availability` and `book_appointment` (Google and Outlook Calendar supported).
- When an agent is created or updated, the backend syncs the assistant configuration to Vapi via `vapiAdapter.createAssistant` / `updateAssistant`.
- When a business connects a calendar, `calendarService.syncCalendarToolsToAgents` injects the booking tools into every Vapi agent config.
- **Redis caching:** Agent calendar configs are cached in Redis under `vapi_config:<assistantId>` with TTL 3600s.

### Vapi Configuration Catalog (`src/config/vapi.ts`)

- **Voice providers:** `cartesia`, `11labs`, `openai`, `deepgram`, `playht`, `rime-ai`, `azure`, `lmnt`, `neuphonic`.
- **LLM providers:** `openai`, `anthropic`, `custom`, `groq`.
- **STT providers:** `deepgram`, `google`, `openai`, `azure`, `gladia`, `talkscriber`, `assembly-ai`.
- Defaults: voice `cartesia` / `sonic-3.5`, LLM `groq` / `openai/gpt-oss-20b`, STT `deepgram` / `nova-2`.

### Retell (`src/adapters/retell/RetellAdapter.ts`)

- Single source of truth for all Retell API calls.
- **Endpoints used:** `POST /create-retell-llm`, `POST /create-agent`, `PATCH /update-agent/{id}`, `GET /get-agent/{id}`, `DELETE /delete-agent/{id}`, `GET /list-phone-numbers`, `POST /create-phone-number`, `POST /import-phone-number`, `DELETE /delete-phone-number/{id}`, `GET /get-call/{id}`, `POST /v2/create-web-call` (public landing demo).
- Webhooks from Retell hit `POST /webhooks/retell`. The endpoint verifies the `x-retell-signature` using `retellAdapter.validateWebhookSignature` (timing-safe comparison with the Retell API key).
- Supported Retell webhook events: `call_started`, `call_ended`, `call_analyzed`. Other events are acknowledged (`200`) but ignored.
- Retell custom tools are exposed under `POST /webhooks/retell/tools/:retellAgentId/:toolName`. The `retellAgentId` path segment is required because Retell never includes an agent identifier in the tool-call body, so it's embedded in the URL itself (done in `buildRetellCalendarTools`, `src/modules/calendar/service.ts`). Our tools are registered with `args_at_root: false` (see `RetellAdapter.createLlm`/`updateLlm`), so Retell sends `{name, call, args}` — `call.call_id` is threaded through as `callId` to `executeVoiceTool` so `book_appointment` can link the booking to the exact call instead of guessing "the most recent call for this business". The route still tolerates a flat args-only body (no `call_id`) for businesses not yet resynced with this config. The endpoint validates the `x-retell-signature` before executing any tool. Execution is delegated to `executeVoiceTool` in `src/modules/voiceTools/service.ts`, which implements `check_business_hours`, `check_availability` and `book_appointment` (Google and Outlook Calendar supported).
- When an agent is created or updated for a Retell business, `agentBootstrap.ts` creates/updates the LLM and agent in Retell and stores `retellAgentId`/`retellLlmId` in the `Agent` row.
- Retell agents use the name built by `buildAgentDisplayName(businessName, businessType)` so they are easy to identify in the Retell dashboard.

### Retell Configuration

- Retell agent defaults live in `src/lib/agentBootstrap.ts` (`DEFAULT_RETELL_AGENT_CONFIG`).
- Default LLM: `gpt-4.1`.
- Default voice: `retell-Cimo`.
- Default language: `es-ES`, timezone: `Europe/Madrid`.
- Payload builders: `buildRetellAgentPayload` and `buildRetellLlmPayload`.

### Phone provisioning

`provisionPhoneNumber` buys a Twilio number and links it in the active orchestrator (Vapi phone number or Retell phone number). Failures in Twilio do not fail the Stripe webhook response.

Only Spain (`TWILIO_PHONE_NUMBER_COUNTRY=ES`) is supported today — searches only `local`-type numbers (Spain prohibits ISVs/resellers from using national/mobile numbers, see [Twilio's Spain regulatory guidelines](https://www.twilio.com/en-us/guidelines/es/regulatory)) and requires `TWILIO_SPAIN_BUNDLE_SID`, a single platform-level regulatory bundle reused across every business (not one bundle per business). Numbers whose `addressRequirements` isn't `none` are skipped, since no `AddressSid` is configured yet; provisioning fails with a specific error message rather than a generic one when no bundle is configured or every available number needs an address.

## Stripe Billing

- Uses **Stripe Checkout Sessions** (embedded UI mode) for subscription sign-ups.
- Plans are defined in `src/modules/billing/catalog.ts`:
  - `inicio` — 100 min included, 0.60€/min extra.
  - `pro` — 400 min included, 0.45€/min extra (featured).
  - `scale` — 1000 min included, 0.35€/min extra.
- Each plan maps to a `STRIPE_PRICE_*` environment variable.
- New subscriptions get a 7-day trial (`CHECKOUT_TRIAL_DAYS = 7`).
- `createCheckoutSession` rejects if the business already has an active subscription or trial.
- Stripe webhooks are processed in `billing/service.ts` (`handleStripeEvent`). Events are deduplicated via `StripeWebhookEvent` table.
- After a successful checkout, the frontend calls `POST /billing/checkout-session/:sessionId/reconcile` to sync the subscription state to the `Business` record.
- `getBillingSummary` calculates consumed minutes in the current period via `call.aggregate({ _sum: { durationSecs } })` on non-`IN_PROGRESS` calls.
- **Automatic phone provisioning:** On Stripe webhook `checkout.session.completed`, the backend triggers `provisionPhoneNumber(businessId)` asynchronously after reconciling the subscription. This purchases a Twilio number and links it in the business's active orchestrator (Vapi or Retell). Failures in Twilio do not fail the Stripe webhook response.

## Calendar Integration

- **Google Calendar:** OAuth 2.0 offline access (`prompt: consent`, `access_type: offline`). Refresh tokens are stored in `Business.googleRefreshToken`. Supports `primary` calendar or a specific `googleCalendarId`.
- **Outlook Calendar:** Microsoft Graph OAuth. Stores refresh token in `Business.outlookRefreshToken`. After OAuth, the user selects a calendar from a list; then `connectMicrosoftCalendar` saves the choice.
- **Calendar selection:** Google callback redirects directly to frontend. Microsoft callback returns a JSON payload with calendar list; frontend shows selector and calls `POST /calendar/auth/microsoft/connect`.
- **Switching calendars:** `GET /calendar/calendars` lists the calendars of the connected account (Google `calendarList` or Microsoft Graph) with `{ provider, selectedCalendarId, calendars: [{ id, name, primary }] }`; `POST /calendar/select` with `{ calendarId }` switches the active calendar for either provider. The `/ajustes` calendar section uses both for its "Cambiar de calendario" picker.
- `getUpcomingEvents` normalizes events from both providers into a common format.
- If a refresh token becomes invalid (`invalid_grant`), the backend throws a `CalendarBusinessError` with code `GOOGLE_CALENDAR_RECONNECT_REQUIRED` or `OUTLOOK_CALENDAR_RECONNECT_REQUIRED`. The frontend should prompt the user to reconnect.
- **Appointment booking** (`book_appointment` webhook handler) supports both Google and Outlook Calendar. It creates the calendar event and persists a `Booking` row with `professionalId`, `serviceId` and `durationMinutes`. If no `professionalId` is provided, it selects the first available professional from `checkAvailability`.

## Booking & Availability

### Models

- `Service` — `name`, `durationMinutes` (5–480), `active`.
- `Professional` — `name`, `active`.
- `ProfessionalService` — many-to-many link with `assignedAt`.

### Business Schedule (`src/lib/businessSchedule.ts`)

- Zod schema: `BusinessScheduleSchema` with `version: 1`, 7 days (`monday`–`sunday`), each day has `enabled` + up to 3 non-overlapping intervals (`HH:mm` format).
- Default: L–V 09:00–18:00, S–D closed.
- `checkBusinessHours(schedule, timezone, startDateTime, durationMinutes)` converts to local time and validates against intervals.
- Returns codes: `WITHIN_BUSINESS_HOURS`, `OUTSIDE_BUSINESS_HOURS`, `BUSINESS_HOURS_NOT_CONFIGURED`, `INVALID_DATE_TIME`.

### Availability (`src/lib/availability.ts`)

`checkAvailability({ businessId, schedule, timezone, bookingCapacity, startDateTime, durationMinutes, serviceId? })`

1. Validates business hours first.
2. Finds active professionals (optionally filtered by `serviceId` via `serviceLinks`).
3. Finds overlapping bookings in the time slot, using each booking's stored `durationMinutes` for overlap calculation.
4. If `bookingsInSlot >= bookingCapacity` → `CAPACITY_REACHED`.
5. Identifies busy professionals by `professionalId` from overlapping bookings and returns the free ones with `id` and `name`. If none → `ALL_PROFESSIONALS_BUSY`.
6. Otherwise → `available: true` with `availableProfessionals` (array of `{ id, name }`) and capacity counts.

## Agent Configuration

### Managed Agent Prompt (`src/lib/managedAgentPrompt.ts`)

Dynamic system prompt built from business settings:

- **Tone:** `warm` / `professional` / `direct`
- **Primary goal:** `bookings` / `customer_service` / `lead_capture`
- **Response style:** `concise` / `balanced`
- **Escalation:** `take_message` / `request_callback`

The prompt includes:
- Business identity and verified info block (`INFORMACION_VERIFICADA_DEL_NEGOCIO`)
- Structured schedule block (`HORARIO_ESTRUCTURADO_DEL_NEGOCIO`)
- Instructions to NEVER invent data, always use `check_business_hours`, verify data before `book_appointment`

### Agent Settings (`AgentSettingsSchema`)

Stored in `Business.agentSettings` (JSON). Parsed with Zod; falls back to `DEFAULT_AGENT_SETTINGS` on invalid data.

### Agent Defaults (`src/lib/agentBootstrap.ts`)

- `firstMessage`: "Hola, soy la recepcionista virtual. ¿En qué te ayudo?"
- `firstMessageMode`: `assistant-speaks-first`
- `backgroundSound`: `office`
- `backgroundDenoisingEnabled`: true
- `startSpeakingPlan` with `smartEndpointingPlan`
- Transcriber fallbackPlan to `nova-3`

### Business Type (`Business.businessType`)

The `businessType` field stores the business niche selected during registration. Supported values: `peluqueria`, `centro-de-estetica`, `salon-de-unas`, `barberia`, `fisioterapia`, `other`. It is persisted in `Business.businessType` and used by `agentBootstrap.ts` to:

- Build a readable agent display name (`buildAgentDisplayName`) that includes the niche label, making agents easy to identify in orchestrator dashboards.
- Resolve the agent template (`getAgentTemplateForBusinessType`). Currently all niches share the same base config; this is the extension point for per-niche system prompts, TTS, LLM and STT settings.
- Sync the agent name in Retell/Vapi when the business type is updated via `PATCH /business/me`.

Niche landings pass `?niche=<slug>` to `/planes` and on to `/register`, so the type can be pre-selected. If the user comes from the generic flow, the type is inferred from the `types` array returned by Google Places API (`src/modules/places/service.ts`) using the keywords defined in `BUSINESS_TYPE_PLACE_KEYWORDS` (both in `src/lib/businessType.ts` and `frontend/src/lib/business-type.ts`). Each niche has exactly 2 keywords; if any place type contains at least one of them, that niche is assigned. The mapping is ordered from most specific to most generic:

| Niche | Keywords |
|-------|----------|
| `barberia` | `barber_shop`, `barber` |
| `salon-de-unas` | `nail_salon`, `nail` |
| `peluqueria` | `hair_care`, `hair_salon` |
| `centro-de-estetica` | `beauty_salon`, `spa` |
| `fisioterapia` | `physiotherapist`, `health` |

The inferred type is shown for confirmation on `/register/business/niche` after the Places API step; if no type can be inferred, the user selects it manually from the list.

After confirming the business type, the user is taken to `/register/business/services`, which offers a template of common services for the selected niche (defined in `frontend/src/lib/service-templates.ts`). Services are rendered as selectable pills showing name and duration. Selected services are created via `POST /booking-settings/services`; the user can also skip this step and configure services later in `/ajustes`.

The next step is `/register/business/team`, where the user sets the number of employees (1–20) and booking capacity (1–50). The backend creates placeholder professionals (`Profesional 1…N`) and updates `Business.bookingCapacity`.

The final setup step is `/register/business/calendar`, where the user connects Google or Outlook Calendar. The frontend stores `registration_next_step` in `localStorage` before starting OAuth so `/settings` can bounce the user back into the registration flow after the provider callback. The flow always ends at `/checkout?plan=` (if a plan is pending) or `/planes?from=register` (to select one).

Onboarding texts for headings, subheadings and CTAs are dynamically selected per business type via `BUSINESS_TYPE_ONBOARDING_TEXTS` in `frontend/src/lib/business-type.ts`.

Google Places autocomplete is filtered by the country selected during registration and stored in `localStorage` under `botbook_registration_country`. The `/register/business` page shows the country as a summary with an optional "Cambiar" link; the selector only appears when no country is saved or when the user explicitly chooses to change it. The country is sent as the `country` query param and passed to `includedRegionCodes` in `src/modules/places/service.ts`.

## Onboarding Flow

The onboarding flow is embedded in the `/ajustes` page. It guides the business through four setup steps:

1. **Schedule** — valid `BusinessSchedule` configured.
2. **Services** — at least one active `Service` created.
3. **Professionals** — at least one active `Professional` created.
4. **Calendar** — Google or Outlook calendar connected.

### Backend (`src/modules/onboarding/routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/business/me/onboarding` | Computes step completion live from business data and returns progress, dismissed/completed timestamps and `isActive`. |
| `POST` | `/business/me/onboarding/dismiss` | Persists `dismissedAt`. |
| `POST` | `/business/me/onboarding/complete` | Persists `completedAt`. |

### Frontend (`frontend/src/app/ajustes/page.tsx`)

- Fetches onboarding state via TanStack Query (`["onboarding-state"]`).
- Shows the `SetupGuide` whenever `onboardingQuery.data?.isActive === true`, regardless of the `?from` query param. Any authenticated user that has not completed or dismissed onboarding sees the guide.
- Calls `dismissOnboarding()` when the user closes the guide.
- Auto-completes onboarding via `completeOnboarding()` when computed progress reaches 100%.
- Real-time invalidation: `invalidateAll()` also invalidates `["onboarding-state"]` so the guide progress updates immediately after creating services/professionals or updating capacity. `scheduleMutation` calls `invalidateAll()` after saving the business schedule so the schedule step is marked as done right away.

## Frontend Design System

The frontend follows a **conservative, professional SaaS aesthetic** tailored to traditional Spanish businesses (peluquerías, clínicas, barberías). Avoid generic startup or consumer-app styling.

> The full system lives in **`DESIGN.md`** at the repo root (named colors, type roles, named
> rules) with a machine-readable sidecar at `.impeccable/design.json`. Product truth lives in
> **`PRODUCT.md`**. This section is the short operational version; `DESIGN.md` wins on conflict,
> and any token change must be mirrored in both files.

### Color Palette

Defined in `frontend/src/app/globals.css`:

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#eef2eb` | Body background gradient base |
| `--foreground` | `#17211c` | Main text color |
| `--surface` | `#ffffff` | Card/panel backgrounds |
| `--surface-soft` | `#f6f7f1` | Second-level surfaces, nested sections |
| `--muted` | `#5f6a5e` | Secondary text, descriptions |
| `--accent` | `#1e2b22` | Primary buttons, headings, emphasis |
| `--accent-strong` | `#243026` | Hover states on primary elements |
| `--accent-soft` | `#b8d96e` | Focus rings, subtle highlights |
| `--success` | `#2c7334` | Success states, connected indicators |
| `--warning` | `#9f7a15` | Warning states |
| `--error` | `#c53030` | Error states, validation failures |

**`--muted` was `#687267` and is now `#5f6a5e`.** The old value measured 4.42:1 against the paper
background and missed WCAG AA; the new one passes on white (5.66:1), paper (5.00:1) and
surface-soft (5.25:1). Consume it through the `.text-muted` utility — do **not** write the hex
inline, so the token stays the single point of change.

**Do NOT use:**
- `#101814` (pure black with green tint) — replaced by `#1e2b22`
- `#d6ff72` (neon lime) — replaced by `#b8d96e`
- `#0b110e` (footer black) — replaced by `#1e2b22`
- `#8b9a7f` (2.99:1), `#7a8774` (3.79:1), `#718064` (4.22:1), `#8e968d` (3.04:1) — all failed AA
  on white. Use `#54634b` (6.44:1) for secondary text on light surfaces, `#6b756a` for
  placeholders, or the `--muted` token.

As of the last pass there are **zero** occurrences of any banned colour in `frontend/src`. Keep it
that way: `grep -rnE '#d6ff72|214,\s*255,\s*114|#101814|16,\s*24,\s*20|#0b110e' frontend/src`
must return nothing.

### Accessibility Baseline

`PRODUCT.md` commits the project to **WCAG 2.1 AA**, which the European Accessibility Act makes
non-optional for a service sold online in the EU. Concretely:

- Text contrast ≥ 4.5:1 (≥ 3:1 for large text). Compute it, don't eyeball it — several colours in
  this palette look fine and fail.
- Every interactive control is at least 44px tall. Inline links inside prose are exempt.
- Body text never drops below 14px. 12px is for badges and column headers only.
- Focus is always visible (`focus-visible` ring in `#9dbb55`).
- Modals need `role="dialog"`, `aria-modal`, a focus trap and body scroll lock.
- Anything driven by audio needs a non-audio equivalent.

### Base Classes

| Class | Purpose | Key properties |
|-------|---------|----------------|
| `.panel` | Card/container | `rounded-2xl`, `bg-white/95`, subtle shadow, glassmorphism |
| `.field` | Text inputs | `rounded-lg` (8px), `h-11`, border `#d2dacd`, focus ring |
| `.btn-primary` | Primary action | `rounded-lg` (8px), `bg-[#1e2b22]`, white text |
| `.btn-secondary` | Secondary action | `rounded-lg` (8px), white bg, border `#d2dacd` |
| `.badge-soft` | Status badges | `rounded-full`, `bg-[#eef6dc]`, text `#405115` |

### Styling Rules

- **Border radius:** The scale is 8 / 12 / 16px and nothing else — `rounded-lg` for inputs and
  buttons, `rounded-xl` for cards, `rounded-2xl` for panels. `rounded-full` is reserved for badges,
  status chips, nav pills and square icon buttons of 32–40px. No `rounded-3xl` and no arbitrary
  values (`rounded-[1.75rem]` and friends). Currently zero out-of-scale radii in `frontend/src`.
- **Shadows:** Ceiling is 32px blur and 0.16 opacity, always tinted `rgba(30,43,34,…)` — never grey
  or black, which show up dirty against the green paper. `0_8px_24px_rgba(30,43,34,0.06)` for
  panels, `0_4px_16px_rgba(30,43,34,0.04)` for small cards, `0_10px_28px_rgba(30,43,34,0.16)` for
  the primary button. No `0_22px_55px`, `0_20px_80px` or `0_26px_80px`.
- **Typography:** Reserve `font-semibold` for H1/H2/H3, card titles, CTAs and key figures. Use
  `font-normal` for body text and descriptions.
- **Tracking:** `-0.02em` on headings (floor `-0.04em`), max `0.12em` on uppercase labels. Anything
  from `0.15em` up reads as texture, not words.
- **No eyebrows.** Do not put an uppercase label above a heading ("Cómo te ayuda", "Precios",
  "Sin letra pequeña"). The heading carries its own weight. A badge is fine when it adds
  information the heading doesn't — "Google Calendar" names the integration — but not when it just
  announces the section.
- **Gradients:** Use the body gradient (`radial-gradient` with `#b8d96e` and `#1e2b22` tints) for
  all pages, including auth, registration and legal. Do not use flat backgrounds like `#f7f8f4`.
- **Icons:** Lucide React icons in a 40px `rounded-xl` tile with `bg-[#eef6dc]` and
  `text-[#2c7334]`. Icons never sit loose on the paper.
- **Dark surfaces are rationed.** The landing carries one dark block in the body (the calculator
  result panel) plus the closing band and footer, which read as a single dark foot. Adding a
  fourth dark block breaks the one-accent rule.

### Component-Specific Notes

- **Dashboard "Estado general" card:** Uses light background (`bg-[#f7f9f3]`) with green accents, NOT a dark box.
- **HeroConversation widget:** Uses green palette (`#2c7334`, `#b8d96e`, `#eef6dc`) to match the site. Never use purple/orange.
- **Checkout:** Container has `min-h-[480px]` and `rounded-2xl` to prevent empty-state collapse.
- **Auth pages:** Use `.panel` class and body gradient. No flat backgrounds.
- **`MobileNav`:** Closes on Escape and on outside pointerdown, restores focus to the toggle, and
  locks body scroll while open.
- **Skip link:** `SiteLanding`'s "Saltar al contenido" targets `#contenido` (the wrapper around
  `LandingHero`), not `#main-content` — the `<main>` contains the link, so it skipped nothing.

## Content & Evidence Rules

BotBook is **pre-launch: there are no paying customers.** `PRODUCT.md` holds the full record. For
any user-facing copy:

- Never fabricate testimonials, customer logos, "X negocios confían" counts, own product metrics,
  awards or press mentions about BotBook. None exist.
- Every published figure needs an external, verifiable source rendered on screen, the way
  `SectorDataSection` does. The stats in `niche-landings.ts` and `generalSectorData` follow this.
- The quotes in `niche-landings.ts` are business owners interviewed in the press **about the
  problem**, not BotBook customers. Do not present them as testimonials.
- Do not promise capabilities that do not ship. Voice selection has no frontend UI; "elegir entre
  voces" was removed for that reason. Onboarding is self-service, so copy must not promise a human
  configuring things with the customer.
- No AI jargon in the UI: "recepcionista virtual", "agente de voz". Never "LLM", "prompt",
  "orquestador", "webhook", "API", "leads" or "archivo de contexto".
- Error copy is Spanish, actionable and never blames the user. Backend 5xx are generic on purpose;
  the UI must translate them into something human.
- A structured-data claim is a public claim. The "Soporte para Kit Digital" JSON-LD node was
  removed: it asserted help obtaining public subsidies, pointed at an anchor that did not exist,
  and had nothing behind it.

## Code Style Guidelines

- **Language:** Spanish for all user-facing strings, comments, and business-domain names. English is acceptable for technical terms (`routes.ts`, `service.ts`, `prisma`, `fastify`, etc.).
- **Formatter:** Prettier — `semi: true`, `trailingComma: "es5"`, `singleQuote: false`, `printWidth: 80`, `tabWidth: 2`.
- **Linter:** ESLint (backend: `@typescript-eslint/recommended`; frontend: `next/core-web-vitals`).
- **Imports:** Use `.js` extensions in TypeScript import paths (required for ESM). Example: `import { prisma } from "../../lib/prisma.js";`.
- **Path aliases:** Backend uses `"@/*"` → `"./*"` (relative to `src/`). Frontend uses `"@/*"` → `"./src/*"`.
- **Types:** Prefer explicit types on Fastify route generics (`Body`, `Params`, `Querystring`). Use `z.infer<typeof Schema>` for request shapes.
- **Null handling:** Prefer `??` for defaults. Be defensive with external API responses.
- **Logging:** Use `fastify.log` inside routes, `console.log`/`console.error` in startup code and workers. Prefix logs with the module name in brackets, e.g. `[Agent]`, `[Calendar]`, `[Job]`.

## Testing

The project uses **Vitest** for backend testing.

- **Config:** `vitest.config.ts` — Node environment, includes `tests/**/*.{test,spec}.ts`, setup file `tests/setup.ts` (loads `.env.test`).
- **Coverage:** V8 provider, reports text/html/lcov. Excludes `node_modules/`, `dist/`, `frontend/`, `tests/`.
- **Mocking:** `tests/helpers/prismaMock.ts` provides a `createPrismaMock()` factory. MSW is available for HTTP mocking. `@testcontainers/postgresql` for integration tests.

### Test Files

| File | Coverage |
|------|----------|
| `tests/adapters/vapi/webhookHandlers.test.ts` | Function call handlers, end-of-call report, status update |
| `tests/adapters/retell/webhookHandlers.test.ts` | `call_started`, `call_ended`, `call_analyzed` handlers |
| `tests/adapters/retell/RetellAdapter.test.ts` | Create/update/delete agents and LLMs, phone numbers, health check |
| `tests/lib/availability.test.ts` | Availability logic (hours, professionals, capacity, overlaps, busy professional detection) |
| `tests/lib/businessSchedule.test.ts` | Schedule schema validation, checkBusinessHours |
| `tests/lib/businessType.test.ts` | Business type detection from Google Places `types`, normalization |
| `tests/modules/auth/routes.test.ts` | Login, register, register-first-user, Google OAuth URL |
| `tests/modules/billing/service.test.ts` | Stripe event handling, billing summary, checkout session, reconciliation |
| `tests/modules/phone/service.test.ts` | Phone provisioning idempotency, partial failure handling, status retrieval |
| `tests/modules/calendar/service.test.ts` | Google/Outlook Calendar booking, upcoming events, sync tools to agents, invalid_grant detection |
| `tests/adapters/twilio/TwilioAdapter.test.ts` | Search, purchase, release, fetch Twilio numbers |
| `tests/plugins/auth.test.ts` | Auth plugin (valid token, missing header, invalid token) |

### E2E Scripts

- `scripts/e2e_book_appointment_after_fix.cjs` / `.js` — End-to-end test for `book_appointment` webhook handler. Tests 3 scenarios: success, invalid_grant (disconnects calendar), disconnected calendar.

## Security Checklist

- **JWT_SECRET** is mandatory — the server refuses to start without it.
- CORS is restricted to the exact `FRONTEND_URL` origin.
- Rate limiting is active globally (100 req/min) and raised for Vapi and Retell webhooks (300 req/min). Places endpoints use 10/min.
- Vapi webhook signatures are verified with HMAC-SHA256 timing-safe comparison.
- Retell webhook signatures are verified via `retellAdapter.validateWebhookSignature` using the Retell API key. This also applies to the Retell custom tool endpoints (`/webhooks/retell/tools/:retellAgentId/:toolName`).
- Stripe webhook signatures are verified in the route handler before calling `handleStripeEvent` (route uses `rawBody: true`).
- Raw body parsing is enabled only on the Vapi and Retell webhook routes to avoid memory overhead on regular routes.
- Business-scoped queries must always filter by `request.user.businessId`. Do not accept a `businessId` from the body for reads/writes.
- File uploads are limited to 10 MB via `@fastify/multipart`.
- Never commit `.env` — it is listed in `.gitignore`.

### Implementation Notes

- **`DELETE /recordings/:id`** deletes the object from R2/S3 using `deleteStorageObject` before removing the Prisma row. Failures in R2 are logged but do not block the DB deletion.
- **`PATCH /business/me`** rebuilds the managed agent prompt and synchronizes all agents to Vapi or Retell in parallel via `Promise.all` to avoid request timeouts.
- **Onboarding flow:** `src/modules/onboarding/routes.ts` exposes `GET /business/me/onboarding`, `POST /business/me/onboarding/dismiss` and `POST /business/me/onboarding/complete`. The `/ajustes` page consumes these endpoints to show/persist the setup guide state. Step completion is computed live from business data; only `dismissedAt`/`completedAt` are persisted.

## Common Tasks

### Add a new backend route module

1. Create `src/modules/<domain>/routes.ts` exporting an `async function <domain>Routes(fastify: FastifyInstance)`.
2. Import and register it in `src/server.ts` with an optional prefix.
3. Use `zod` for validation and `prisma` for DB access.
4. If the route requires authentication, add `onRequest: fastify.authenticate` or `preValidation: [fastify.authenticate]` to the route options.
5. Always filter business-scoped queries by `request.user.businessId`.

### Add a new Prisma model

1. Edit `prisma/schema.prisma`.
2. Run `npm run prisma:migrate` to create a migration.
3. Run `npm run prisma:generate` to update the TypeScript client.
4. Use the new model in your module.

### Add a new environment variable

1. Add it to `.env.example` with a placeholder value and a comment.
2. Add it to `docker-compose.yml` in both `backend` and `backend-dev` services so it is forwarded into containers.
3. Read it via `process.env.VAR_NAME` in code. Do not provide real defaults for secrets.

### Run Prisma Studio

```bash
npx prisma studio
# or inside Docker
# port 5555 is mapped in docker-compose.yml
```

### Add a new frontend page

1. Create `frontend/src/app/<ruta>/page.tsx`.
2. Use `useBusiness()` for auth state; redirect to `/login` if `!hasToken`.
3. Use TanStack Query hooks for data fetching.
4. Add API wrappers to `frontend/src/lib/api.ts` if needed.
5. Add domain types to `frontend/src/lib/types.ts` if needed.

### Add a new landing page niche

1. Add niche content to `frontend/src/lib/niche-landings.ts`.
2. Create `frontend/src/app/<niche>/page.tsx` importing `SiteLanding` with the niche content.
3. Add route to `frontend/src/app/sitemap.ts`.
4. Add redirect in `frontend/next.config.mjs` if needed.

## Deployment Notes

- The `Dockerfile` has 5 stages: `base`, `deps`, `builder`, `runtime`, `development`.
- Production image runs `node dist/server.js` (compiled output).
- Development image runs `npx tsx watch src/server.ts` over a volume-mounted source tree.
- The `docker-compose.yml` uses profiles: `--profile dev` for local development with ngrok, `--profile prod` for production-like runtime.
- For Vapi/Retell webhooks to reach a local backend, use the `dev` profile which includes an ngrok container. The backend auto-detects the ngrok URL on startup (`fetchAndSetNgrokUrl`) and uses it as the webhook server URL for both orchestrators.
- Health check endpoint at `GET /health` probes Postgres, Redis, Vapi and (when `RETELL_API_KEY` is set) Retell. Returns `200` if all healthy, `503` if degraded.

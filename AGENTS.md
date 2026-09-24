# Alhabla — AI Coding Agent Reference

## Project Overview

Alhabla is a multi-tenant SaaS platform that provides AI-powered voice receptionists for small businesses in Spain (hair salons, barbershops, physiotherapy clinics, beauty centers, etc.). Each business gets one or more voice agents built on top of the Retell.ai voice-AI platform, used for its RGPD compliance. The agents handle incoming phone calls, answer questions, check business hours, check availability, and book appointments directly into the business's Google, Outlook or Apple/iCloud (CalDAV) calendar.

The codebase is fully in Spanish — UI copy, comments, variable names, and business logic are written in Spanish. Keep everything in Spanish when modifying code or adding user-facing text.

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Backend runtime** | Node.js 20, TypeScript 5.9, ESM (`"type": "module"`) |
| **HTTP framework** | Fastify 5 |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS v3 |
| **Database** | PostgreSQL 15 + Prisma ORM |
| **Cache** | Redis 7 |
| **Background jobs** | Cloud Tasks / Cloud Scheduler (HTTP callbacks to `alhabla-api`, no BullMQ) |
| **Voice AI** | Retell.ai |
| **Object storage** | Cloudflare R2 (S3-compatible) |
| **Telephony** | Telnyx (phone number purchase for Spain) |
| **Billing** | Stripe (Checkout Sessions, Customer Portal, webhooks) |
| **Calendar** | Google Calendar API, Microsoft Graph (Outlook), CalDAV vía `tsdav` + `ical.js` (Apple/iCloud) |
| **Auth** | JWT (custom) + Google OAuth 2.0 |
| **Containerization** | Docker + Docker Compose |
| **Testing** | Vitest (backend), MSW (mocking), @testcontainers/postgresql |

## Monorepo Layout

```
/
├── backend/                 # Backend source (ESM TypeScript)
│   ├── src/
│   │   ├── server.ts           # Fastify entry point
│   │   ├── plugins/            # Fastify plugins (auth, CORS, rate-limit, multipart)
│   │   ├── modules/            # Domain route modules (one folder per domain)
│   │   ├── adapters/           # External API adapters (Retell, Telnyx)
│   │   ├── lib/                # Shared utilities (Prisma, Redis, Stripe, Cloud Tasks, storage)
│   │   ├── jobs/                # Background job logic, no framework (dispatched via Cloud Tasks)
│   │   └── config/              # Static configuration constants
│   ├── prisma/              # Prisma schema + migrations
│   ├── dist/                # Compiled backend output (tsc)
│   ├── scripts/             # One-off scripts (e.g. E2E tests)
│   ├── tests/                # Vitest test suite
│   └── Dockerfile            # Multi-stage build
├── frontend/               # Next.js 14 application
│   ├── src/app/            # App Router pages
│   ├── src/components/     # React components
│   ├── src/lib/            # API client, types, helpers, SEO, ROI
│   └── src/hooks/          # Custom React hooks
└── docker-compose.yml      # Postgres + Redis + backend + cloudflared (dev profile)
```

### Backend Module Organization (`backend/src/modules/`)

Each module is a folder containing a `routes.ts` file (and optionally `service.ts`, `schemas.ts`). Routes are registered in `backend/src/server.ts` with a prefix when needed.

| Module | Prefix | Auth | Purpose |
|--------|--------|------|---------|
| `auth` | `/auth` | Mixed | JWT login, Google OAuth callback, registration, authenticated account summary/password change/deletion. Since 2026-09-24 the JWT carries `tv` (`User.tokenVersion`) and `plugins/auth.ts` checks it against the DB (30 s in-process cache), so changing or resetting the password invalidates every token issued before it instead of letting it live out its 7 days — that check fails **closed**. `/register` applies the same password policy as changing and resetting it (8+, a letter and a digit — before, a one-character password got in) and hashes with bcrypt cost 12, not 10. All of `/auth/*` also sits behind an in-memory backstop limiter (`lib/limitadorEnMemoria.ts`, 40/min per IP): the global limiter is Redis-backed with `skipOnError: true`, and failing open there means unthrottled credential stuffing. |
| `businesses` | *(none)* | Yes | Business CRUD, `me` endpoints, agent prompt rebuild on update, and the dashboard reads: `GET /business/me/stats` (all-time totals plus a rolling 7-day `week` window with the previous 7 days for comparison and an estimated revenue in cents), `GET /business/me/agenda?days&limit` (upcoming `Booking` rows with client phone, professional and resolved service names) and `GET /business/me/pending-bookings` (unresolved `pending_booking` leads — appointments the caller asked for that never reached the calendar) |
| `agents` | *(none)* | Yes | Agent CRUD, sync to Retell assistants |
| `calls` | *(none)* | Yes | Call logs, transcripts, outcomes (paginated) |
| `recordings` | *(none)* | Yes | Recording metadata, review notes |
| `calendar` | `/calendar` | Yes* | Google/Outlook OAuth, Apple/CalDAV sign-in with credentials, list events, book appointments. **CalDAV is user-supplied URL territory**: since 2026-09-24 every request the adapter makes goes through `fetchSoloPublico` (`lib/destinoPublico.ts`) — https only, DNS resolved and rejected if any address is private/loopback/link-local/CGNAT, redirects followed by hand so a 302 cannot bounce into the VPC, and `calendarId` on `POST /calendar/select` must be one of the discovered calendars. This is not theoretical: `alhabla-api` runs with a VPC connector (`private-ranges-only` egress), so private ranges really are reachable from the container. |
| `bookings` | `/booking-settings` | Yes | CRUD de servicios y profesionales, asignaciones y capacidad de reserva; las retiradas son lógicas |
| `billing` | `/billing` | Yes* | Stripe checkout, portal, subscription summary, webhooks |
| `phone` | `/phone` | Yes | Telnyx phone number status, manual provisioning retry |
| `places` | *(none)* | Yes | Google Places autocomplete & details |
| `onboarding` | *(none)* | Yes | Onboarding state: progress, dismiss, complete, confirm call forwarding |
| `demo` | `/demo` | No | Public landing voice demo, **on Telnyx since 2026-09-22** (Retell ran out of credit and the demo 502'd in production). `POST /demo/web-call` accepts `{ niche?, placeId? }` and returns `{ assistantId, niche, maxDurationSeconds }`: the browser then places an unauthenticated WebRTC call to that assistant (`anonymous_login`), so no token or credential ever reaches the bundle. With a `placeId` the backend re-reads the Google Places card and the **detected** niche wins over the landing's — searching your barbershop from the main landing gets you the barbershop demo. Each niche points at an **isolated** demo assistant (`TELNYX_DEMO_<NICHO>_ASSISTANT_ID`), falling back to the generic one. Since 2026-09-24 those are clones of the demo accounts' assistants (`scripts/crearAssistantsDemoAislados.ts`) with **no tools at all** and their own `time_limit_secs` in Telnyx: `anonymous_login` means the assistant id necessarily reaches the browser, so anyone can dial it directly, bypassing this route's rate limit and the browser's cap — pointing that at the real accounts' assistants let an abuser write real bookings into their agendas. The demo accounts' own assistants now have `supports_unauthenticated_web_calls: false`. The route still reasserts that flag once per assistant per process, but only after checking the name starts with `alhabla-demo-`, so a misconfigured env var can never open a real business's assistant. `resolveDemoMaxDurationSeconds()` validates `TELNYX_DEMO_MAX_DURATION_SECONDS` (finite and positive, or 60s) — it is a browser-side cap, Telnyx keeps the account's own `time_limit_secs` |

\* Except OAuth callbacks (`/calendar/auth/*/callback`) and Stripe webhook (`/billing/webhook`).

### Key Libraries (`backend/src/lib/`)

- `prisma.ts` — Prisma Client singleton with `globalThis` hot-reload guard.
- `redis.ts` — IORedis connection (caching, OAuth state, rate limiting).
- `cloudTasks.ts` — Cloud Tasks job dispatch (`enqueueRecordingJob`, `enqueueRetryBookingJob`, `enqueueEmailJob`); inline synchronous fallback outside production. See Background Jobs below.
- `storage.ts` — R2/S3 client for file uploads (recordings).
- `stripe.ts` — Stripe SDK client singleton.
- `telnyx.ts` — Telnyx SDK singleton (single Bearer API key). Active provider for phone number provisioning.
- `microsoftGraph.ts` — Microsoft Graph OAuth + Calendar API helpers.
- `agentBootstrap.ts` — Default agent config, Retell payload builder, safe assistant naming.
- `businessSchedule.ts` — Business hours validation logic with Zod schemas.
- `availability.ts` — Booking availability check (professionals, capacity, overlapping bookings). Returns available professionals with IDs for explicit selection.
- `logUtils.ts` — Shared logging helpers (`errorMessage`, `callLabel`).
- `managedAgentPrompt.ts` — Dynamic system prompt builder from business settings (tone, goal, style, escalation).
- `serverUrl.ts` — `getPublicWebhookBaseUrl()`: the public base URL used to register webhooks, always straight from `BASE_URL`.

### Configuration (`backend/src/config/`)

- `voiceAgent.ts` — Generic voice/LLM/STT catalog constants: voice providers (8), LLM providers (4) + models, STT providers (7) + models.

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
| `/recuperar-contrasena`, `/restablecer-contrasena?token=` | Password recovery — request the emailed link, then set a new password (signs the user in on success) |
| `/auth/google/callback` | Google OAuth session consumption |
| `/barberia`, `/peluqueria`, `/fisioterapia`, `/centro-de-estetica`, `/salon-de-unas` | Niche SEO landings |
| `/planes` | Pricing page with ROI-aware headline |
| `/checkout?plan=` | Stripe Embedded Checkout |
| `/checkout/resultado` | Post-checkout reconciliation polling |
| `/agente` | Full agent setup (schedule, services, professionals, calendar, knowledge and behavior) |
| `/ajustes` | Account settings (identity, business contact data, password, session and account deletion) |
| `/ajustes/facturacion` | Billing summary & Stripe Customer Portal |
| `/settings` | Calendar OAuth callback handler (Google/Outlook; Apple/CalDAV has no callback — it is a credentials form in `/agente`) |
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
- **Auth token** stored in `localStorage` as `alhabla_token` (legacy keys `token`, `jwt` also checked).
- **Pending plan** stored in `localStorage` as `alhabla_pending_plan` for post-registration checkout flow.
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
- `DemoVoiceCall` — Real voice demo over **Telnyx WebRTC** (`@telnyx/webrtc`, loaded with a dynamic
  `import()` so it stays out of the landing bundle) with live transcription from the
  `telnyx.ai.conversation` events. The browser asks the backend which assistant to call via
  `createDemoWebCall()` (`web/src/lib/api.ts`, `POST /demo/web-call`, public, 10 req/min, 15s client
  timeout) and then connects with `anonymous_login` — no SIP credential or token in the bundle. The
  landing sends its niche slug (`peluqueria`, `barberia`, …) and, if the visitor picked their
  business in Google Places, its `placeId`; the niche detected from the card wins. The visitor talks
  to the platform's demo account for that niche (a real business with its own schedule, services and
  test agenda), never to a mock of their own business — so there is no personalisation of names and
  no business data is retained (the retention consent checkbox went away with it). It is a real dialog: `role="dialog"`, `aria-modal`, focus trap
  on Tab, body scroll lock. All failures go through `describeDemoError`, which maps config/
  permission/network causes to Spanish copy. **Never surface `error.message` from the SDK or an
  env-var name to the user.**
  **Always call the backend through the shared `api` client (`@/lib/api`), never a raw
  `fetch("/api/backend/...")`.** The component used to call `fetch("/api/backend/demo/web-call")`
  directly — that literal path only resolves via the `next.config.mjs` rewrite, which is hardcoded
  to `http://localhost:3000/:path*` and only works in local dev. In production (Vercel) that
  rewrite tries to hit `localhost` from the edge and fails outright
  (`DNS_HOSTNAME_RESOLVED_PRIVATE`), so the public demo was silently broken on `alhabla.ai` while
  working fine locally. Fixed 2026-09-04 by routing through `createDemoWebCall()`, which uses the
  `api` axios instance (`baseURL: NEXT_PUBLIC_API_BASE_URL`) like every other endpoint wrapper in
  `api.ts` — same root-cause shape as the earlier `/auth/register` production bug, different
  component. If a future component needs to call the backend directly, add a wrapper to `api.ts`
  instead of a raw `fetch`/hardcoded path.
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
  in `backend/src/modules/billing/service.ts`, which is what Stripe actually applies. Never hardcode a
  plan name in copy — derive it from `starterPlan.name` or the `plan` object.
- `niche-landings.ts` — 600+ lines of SEO copy, hero text, conversations, benefits, FAQ per niche,
  plus `generalSectorData` (the cross-niche proof block used by the generic landing).
- `roi-context.ts` — ROI calculation and plan value contrast.
- `seo.ts` — Site metadata, structured data (JSON-LD), absolute URL builder.
- `format.ts` — Currency, date, duration, call status labels.
- `billing-navigation.ts` — Pending plan helpers.
- `business-type.ts` — Business type labels, Places API keyword detection and per-niche onboarding texts (`BUSINESS_TYPE_ONBOARDING_TEXTS`).
- `service-templates.ts` — Per-niche service templates shown during registration (`/register/business/services`).

## Build & Run Commands

### Backend

```bash
cd backend

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
# Development (backend with tsx watch, cloudflared tunnel, postgres, redis)
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
| **Retell** | `RETELL_API_KEY`, `RETELL_BASE_URL` |
| **Demo (landing)** | `TELNYX_DEMO_ASSISTANT_ID` (genérico), `TELNYX_DEMO_<NICHO>_ASSISTANT_ID` (por nicho: `PELUQUERIA`, `CENTRO_ESTETICA`, `SALON_UNAS` —sin Ñ, Cloud Run solo admite `[A-Za-z0-9_]`—, `BARBERIA`, `FISIOTERAPIA`), `TELNYX_DEMO_MAX_DURATION_SECONDS` |
| **JWT** | `JWT_SECRET` — required; server exits if missing |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_INICIO`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **Google Calendar OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| **Outlook Calendar OAuth** | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` |
| **Google Login OAuth** | `GOOGLE_AUTH_CLIENT_ID`, `GOOGLE_AUTH_CLIENT_SECRET`, `GOOGLE_AUTH_REDIRECT_URI` |
| **Google Places** | `GOOGLE_PLACES_API_KEY` |
| **R2 / S3** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_REGION`, `R2_ENDPOINT` |
| **Telnyx** | `TELNYX_API_KEY`, `TELNYX_SIP_CONNECTION_ID`, `TELNYX_SPAIN_REQUIREMENT_GROUP_ID`, `PHONE_NUMBER_COUNTRY` |
| **Retell SIP trunk** | `RETELL_SIP_TERMINATION_URI`, `RETELL_SIP_TRUNK_AUTH_USERNAME`, `RETELL_SIP_TRUNK_AUTH_PASSWORD` (Telnyx SIP Connection used by `RetellAdapter.importPhoneNumber`) |
| **Server** | `APP_URL` (la app, app.alhabla.ai), `WEB_URL` (la web de marketing, alhabla.ai), `FRONTEND_URL` (respaldo de las dos), `EXTRA_ALLOWED_ORIGIN`, `PORT`, `NODE_ENV`, `LOG_LEVEL` — ver `lib/urls.ts` |
| **Calendario** | `CALENDAR_CREDENTIALS_KEY` (obligatoria; cifrado en reposo de `calendar_connections.credentials`) |

## Authentication & Authorization

The backend uses a custom JWT scheme:

1. On login / Google OAuth, the server issues a JWT signed with `JWT_SECRET` (7-day expiry).
2. The frontend stores the token in `localStorage` under key `alhabla_token` (legacy keys `token` and `jwt` are also checked).
3. The token is sent as `Authorization: Bearer <token>`.
4. The `authPlugin` (`backend/src/plugins/auth.ts`) decodes it with `jsonwebtoken` and decorates `request.user` with `{ id, businessId }`.
5. Routes that need auth use `onRequest: fastify.authenticate` or `preValidation: [fastify.authenticate]` in their route options.

All business-scoped data is filtered by `businessId` from the token. Never trust a `businessId` coming from the request body for read/write operations — always use `request.user.businessId`.

### Password Reset (Auth)

- `POST /auth/forgot-password` `{ email }` — always `200` with the same message whether or not the
  account exists (no user enumeration). When it does, a 32-byte token is generated, **only its
  SHA-256 hash** is stored in Redis (`auth:password-reset:<hash>` → `userId`, 1 h TTL) and the link
  `${APP_URL}/restablecer-contrasena?token=` is emailed through the `send-email` job from
  `support@`. Google-only accounts (no password) can use it too — receiving the mail proves
  ownership, same as setting a password from `/ajustes`. Rate limit: 5/min.
- `POST /auth/reset-password` `{ token, password }` — consumes the hash with `GETDEL` (single use),
  applies the same password rules as `/auth/change-password`, hashes with bcrypt(12), sends the
  "password changed" confirmation and returns a JWT so the frontend signs the user in directly.
  Invalid/expired token → `400` "El enlace no es válido o ha caducado. Pide uno nuevo.".
- Logic lives in `backend/src/modules/auth/passwordResetService.ts`; no Prisma model is involved.

### Google OAuth Flow (Auth)

- `GET /auth/google` generates an OAuth URL with `select_account` prompt and stores `state` in Redis (60s TTL).
- `GET /auth/google/callback` validates `state` against Redis, exchanges `code` for tokens, verifies ID token, creates/links user, stores JWT in a **HttpOnly session cookie**, and redirects to frontend.
- `POST /auth/google/session` reads the session cookie, retrieves JWT from Redis (atomic get+delete), clears the cookie, and returns the token to the frontend.

## Request Validation & Error Handling

- **Validation:** Use `zod` schemas for route bodies and params. Return `400` with `error.errors` on `ZodError`.
- **Global error handler** (`server.ts`): Normalizes all errors to `{ statusCode, error, message }`. Handles both `Error` instances and plain error objects (e.g. rate-limit errors from `@fastify/rate-limit`). Logs full error details with Pino. Returns generic "Internal server error" for 5xx to avoid leaking internals.
- **Rate limiting:** Default 100 req/min per IP, counter in Redis (global across Cloud Run instances since 2026-09-17). Retell webhook endpoints override to 300 req/min. Auth endpoints have stricter limits: 10/min (`/login`, `/register`) and 5/min (`/register-first-user`, `/pase/canjear`). **Pase de un solo uso** (PLAN-APP-DOMINIO.md § 3, fase 0, 2026-09-21): `POST /auth/register` devuelve además `pase` (64 hex, `auth:pase:<código>` en Redis, 60 s, best-effort) y `POST /auth/pase/canjear { pase }` lo cambia por el JWT una sola vez (`getdel`; 401 `PASE_INVALIDO` si no existe o ya se usó, 400 si el formato no es el esperado). Es el puente entre el registro en la web de marketing y la sesión en la app (`lib/urls.ts`, `modules/auth/pase.ts`). Places endpoints use 10/min. **`/internal/jobs/*` are exempt** (`config.rateLimit: false` on every route): Cloud Tasks/Scheduler call from a handful of Google IPs and are already OIDC-authenticated — with the limit made real, draining a queue produced 293 × 429 in three minutes, and a burst of weekly-summary emails would have exhausted Cloud Tasks retries on legitimate sends.

## Database (Prisma)

The schema lives in `backend/prisma/schema.prisma`. Key models:

- `Business` — tenant root; holds Stripe billing state, calendar tokens (encrypted), schedule JSON, agent settings, booking capacity, and optional booking restrictions `minAdvanceBookingMinutes` / `maxAppointmentDurationMinutes` (both nullable = no restriction; enforced in `check_business_hours` and `book_appointment`, see Agent Configuration).
- `User` — belongs to a Business; supports password (bcrypt) + Google OAuth login (`googleId`).
- `Agent` — voice agent config; `retellAgentId`/`retellLlmId` link to Retell, `telnyxAssistantId` to Telnyx. Includes voice/LLM/STT provider configs, integrations.
- `Call` — a phone call handled by Retell or Telnyx. Status enum: `INITIATED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `TIMED_OUT`. Outcome enum: `RESOLVED`, `FRUSTRATED`, `NO_ANSWER`, `ESCALATED`, `LEAD_CAPTURED` — set from Retell's `call_outcome` post_call_analysis_data field. Since 2026-09-11 the three remaining analysis fields are persisted too: `escalationReason` (enum `CallEscalationReason`), `toolFailureDetected` and `requestedService` (see Retell Configuration).
- `Booking` — outcome extracted from a call; stores `professionalId`, `serviceIds` (array — since 2026-09-05 a booking can cover several services, e.g. "corte y mechas") and `durationMinutes` to track who performs the appointment and how long it lasts. `professionalId`/`serviceIds` supplied by the LLM are verified to belong to the business before being trusted (`voiceTools/service.ts`) — they are not enforced at the DB/FK level.
- `Transcript` / `Recording` — call artifacts. Recording has `storageKey` and `storageUrl` for R2, `providerLegId` (Telnyx `call_leg_id`, to request a fresh download URL once the 10-minute webhook one expires) and `processingFailedAt`/`processingError` (declared unrecoverable; `retry-stuck-recordings` leaves it alone).
- `Lead` — structured lead data captured during a call. `type: "pending_booking"` rows are created by `voiceTools/service.ts` when `book_appointment` fails, holding the attempted booking payload so it's never lost; `resolvedAt` is set once `jobs/retryFailedBooking.ts` confirms the booking in the background (still `null` if retries are exhausted or the failure needs a manual calendar reconnect).
- `Service` / `Professional` / `ProfessionalService` — booking catalog (many-to-many between professionals and services). `Service.priceCents` is optional: a business may work without a published tariff, and the dashboard only estimates revenue for bookings whose services all have a price. `Service` and `Professional` use `deletedAt` plus `active: false` for logical deletion; their `ProfessionalService` rows are auxiliary and may be deleted physically when an assignment or resource is retired.
- `OnboardingState` — per-business onboarding state. Tracks `dismissedAt`, `completedAt`, `forwardingConfirmedAt` and optional step metadata. The actual step completion is computed live from `Business.schedule`, `Service`, `Professional`, calendar connection state and call history (see Onboarding Flow).
- `StripeWebhookEvent` — idempotency guard for Stripe webhooks.

#### WhatsApp (Telnyx como BSP de Meta)

Referencia de lo verificado contra la cuenta real el 2026-09-19 (fase 0 de
`PLAN-CANAL-DUENO.md`). El SDK es `telnyx@7.21`; donde el SDK falla o no tipa algo se indica
el `fetch` equivalente. **Nunca desde un route handler**: todo pasa por
`backend/src/adapters/whatsapp/WhatsAppAdapter.ts`.

**Código (fase 1, cimientos — PR de 2026-09-20).**
- `adapters/whatsapp/WhatsAppAdapter.ts`: solo API, sobre el SDK. `sendTemplate` (por
  `templateId`, con parámetros nombrados; nombre + idioma solo de respaldo), `sendText`,
  `sendInteractiveButtons` (1-3 botones; la cabecera lleva `type: "text"`, que el SDK no tipa
  y la API exige), `sendContacts` (vCard en formato Meta `name.formatted_name`; verificado
  entregado), `getConversationWindow`, `listWabaPhoneNumbers`, `listTemplates`.
- `modules/whatsapp/service.ts`: la política. `resolverRemitente(audience)` lee
  `WhatsappSender` (`client` → +34 930 454 394, `owner` → +34 930 453 218; caché 60 s; el de
  `owner` es el respaldo del de `client`, y `WHATSAPP_TELNYX_FROM_NUMBER` el de todo);
  `resolverPlantilla({ key } | { name, language })` devuelve la fila **aprobada** de
  `WhatsappTemplate` o null; `enviarPlantilla/enviarTexto/enviarBotones/enviarContacto`
  envían y registran el mensaje en `SentMessage` (`providerMessageId`, audiencia, negocio,
  tipo, estado) — es la fila con la que se correlacionan después los `statuses[]` y el
  `context.id` de un botón; `ventanaAbierta(audience, to)` pregunta a Telnyx;
  `actualizarEstadoEnvio` aplica entregas sin retroceder (un `delivered` tardío no pisa un
  `read`; `failed` siempre gana) y crea la fila `adhoc:<id>` si el envío no pasó por aquí.
- `modules/whatsapp/webhooks.ts`: `handleWhatsappMessages` (evento `whatsapp.messages`:
  guarda cada `messages[]` en `InboundMessage` — idempotente por `providerMessageId` — con
  audiencia por el `to`, rol por la BD (`Business.ownerWhatsappNumber` en el número de
  negocios; `Booking.clientPhone`/`Call.fromNumber` en el de clientes) y `kind`
  (`text | keyword | button | audio | media | other`), y aplica los `statuses[]`),
  `handleMessageStatusEvent` (`message.sent/finalized/read`, con `cost` y `errors`) y
  `handleTemplateStatusEvent` (`whatsapp.template.*`). Los tres cuelgan del `switch` de
  `/webhooks/telnyx` en `server.ts`, con la misma firma e idempotencia por id de evento que
  la voz.
- `modules/whatsapp/router.ts`: `enrutarEntrante` — todavía **no responde a nadie**; clasifica
  y deja `handler: pendiente:…` para que los siguientes PRs (alta/STOP, botones de avisos,
  chat Beta) rellenen cada rama.
- `jobs/sendWhatsapp.ts` pasa por el servicio: los envíos de voz (`confirmacion_cita`,
  `recordatorio_cita`, `hora_disponible`) salen por el número de **clientes** y por
  `template_id` en cuanto la tabla tiene la plantilla; si no, por nombre + `es` como antes.
  `SendWhatsappJob` lleva ahora `businessId` y `audience`. Las rutas internas de jobs
  declaran `idempotencyKey` en Zod: hasta este PR `z.object` la descartaba y `reclamarEnvio`
  no deduplicaba nada en producción (email, SMS y WhatsApp).
- `scripts/manual/sincronizarWhatsapp.mts --clientes +34… --negocios +34… --clave
  confirmacion_cita=<uuid>`: vuelca en la BD los números del WABA y las 18 plantillas con su
  estado; la `key` de cada plantilla es su nombre cuando es único y se fija con `--clave`
  cuando hay dos con el mismo nombre. Ejecutado en dev el 20-09; en producción, contra Cloud
  SQL por el proxy, tras el deploy. Requiere `WHATSAPP_WABA_ID`.
- Tablas nuevas: `WhatsappSender`, `WhatsappTemplate`, `InboundMessage`; `SentMessage`
  ampliada (entrega, coste, correlación); `Business.ownerWhatsappNumber`. Migración
  `20260919230000_whatsapp_cimientos`, solo aditiva.

**Código (fase 1, PR 2 — alta del dueño, 2026-09-20).**
- `modules/whatsapp/altaDueno.ts`: estado del dueño (`estadoWhatsappDelDueno`: `sin_numero |
  pendiente | activo | sin_whatsapp | baja`, pura; `puedeRecibirAvisos` para el PR 3), código
  de `ALTA <código>` (6 símbolos sin 0/O/1/I, `crypto.randomBytes`, `@unique` global, 7 días,
  se consume con CUALQUIER opt-in), `cambiarMovilDelDueno` (`updateMany` cuyo `where` también
  casa la columna a NULL; reinicia consentimiento/baja/131026/ventana/freno/código),
  `activarAvisosDelDueno` (código o botón; `ownerAltaCode` en el `where` ⇒ dos códigos
  concurrentes activan uno; con el botón el `where` lleva `ownerWhatsappNumber: from`, para
  que un PATCH concurrente que cambie el móvil no quede pisado), `reactivarDueno` (`ALTA` a secas: SOLO negocios con
  `ownerWhatsappOptInAt` y `ownerWhatsappOptOutAt` puestos — nunca es primer consentimiento),
  `darDeBajaDueno`, `marcarDuenoSinWhatsapp`/`limpiarDuenoSinWhatsapp(businessId, toNumber)`
  (131026; las dos exigen que el envío fuera al móvil ACTUAL: un `read` tardío de un envío al
  móvil antiguo no limpia la marca del nuevo),
  `iniciarActivacionDelDueno` (plantilla `bienvenida_negocio` solo con la fila `APPROVED` y
  `subscriptionStatus ∈ {ACTIVE, TRIALING}`; tope de 2 plantillas de activación por móvil
  destino/24 h entre todas las cuentas, contando solo filas que no estén `failed`/`suppressed`;
  freno de 5 min por negocio reclamado ANTES de enviar con `updateMany` condicional; si Telnyx
  falla se revierte el freno, la fila reclamada queda `failed`/`SEND_ERROR` y se devuelve
  `sent: "link"`), `resumenWhatsappDelDueno` (lo que devuelve el GET; refresca la plantilla por
  `listTemplates` si lleva >24 h sin sincronizar, con enfriamiento en memoria de 15 min tras un
  fallo del WABA para no amplificar contra la cuota de Telnyx), `nombreParaWhatsapp` (nunca
  sale el email: «tu negocio»; recorta a 60 caracteres — por eso `name` no lleva máximo en Zod).
  Ganchos solo-log: `avisarDuenoSinWhatsapp`, `avisarCambioDeMovil` (email en el PR 3).
- `modules/whatsapp/bajas.ts`: tabla `WhatsappOptOut` (una fila por número y audiencia; baja
  vigente ⇔ `revokedAt IS NULL`; nunca se borra). `bajaVigente`/`estaDadoDeBaja`,
  `registrarBaja` (upsert), `revocarBaja`, `WhatsappOptOutError` (`code: WHATSAPP_OPT_OUT`).
  **Guardia en el servicio**: `enviarPlantilla/enviarTexto/enviarBotones/enviarContacto`
  lanzan `WhatsappOptOutError` a un número con baja salvo `permitirBaja: true` (solo la
  confirmación del STOP); la fila reclamada queda `deliveryStatus: suppressed`,
  `errorCode: OPT_OUT`. `jobs/sendWhatsapp.ts` la captura y no reintenta.
- `modules/whatsapp/mensajes.ts`: todo el copy (funciones puras, los tests comparan contra ellas).
- `modules/whatsapp/routes.ts`: `GET /business/me/whatsapp` y `POST
  /business/me/whatsapp/activation` (registradas en `server.ts` tras `onboardingRoutes`). El
  móvil se cambia por `PATCH /business/me { ownerWhatsappNumber }` (E.164 o null; 400
  `OWNER_WHATSAPP_IS_ALHABLA` ANTES de cualquier escritura; `name` sin máximo: los nombres de
  Places pueden pasar de 80). `GET /business/me/onboarding` gana el paso `whatsapp` (antes de
  `forwarding`; `activo` o `baja` = resuelto) y el bloque `whatsapp: { status,
  ownerWhatsappNumber }`. `CONTAR_WHATSAPP_EN_PROGRESO` (onboarding/routes.ts) estuvo en
  `false` entre el deploy del backend y el del panel (para que la guía no reapareciera vacía);
  desde el PR del panel es `true` y el paso cuenta como los demás (seis pasos).
- `modules/whatsapp/router.ts` ya responde. Handlers: `stop:dueno | stop:desconocido |
  stop:cliente`, `alta:vinculado | alta:ya-activo | alta:ya-activo:codigo (código gastado o
  ajeno desde un móvil ya activo: responde «ya activo» pero CUENTA para el bloqueo de 5
  intentos/hora) | alta:codigo-invalido | alta:codigo-caducado | alta:bloqueado |
  alta:reactivado | alta:sin-codigo | alta:cliente-reactivado | alta:numero-equivocado`,
  `boton:activacion:{ok,por-envio,ya-activo,remitente-distinto,numero-antiguo}`,
  `pendiente:boton:{sin-contexto,sin-fila,ambiguo}` (botón «Activar avisos» con `context.id`
  sin fila, o sin `context.id` con activaciones de dos negocios al mismo móvil en 72 h: no se
  adivina), `ayuda:dueno | ayuda:sin-consentimiento (el móvil solo lo tecleó un negocio, quizá
  otro tenant: no se nombra) | ayuda:desconocido`, `texto:dueno | texto:desconocido |
  texto:dueno-en-clientes`, `bienvenida-chat:<audience>`, `ignorado:{sin-audiencia,reaction,
  system,unsupported,audio,media,other}`, y `pendiente:*` para lo de los PRs 3/4 y la fase 2.
  Sufijos: `:silenciado` (una vez al día por tipo, o techo de 20 respuestas por número y hora)
  y `:baja` (el número pidió STOP: no es error). Como mucho una respuesta por entrante, siempre
  texto desde el número al que escribió, reclamada con `reclamarEnvio`
  (`entrante:<InboundMessage.id>:<tipo>`, `callbackData: aviso:<tipo>`). Si el envío falla, la
  fila reclamada queda `failed`/`SEND_ERROR` y NO cuenta para «una vez al día» (el siguiente
  entrante lo reintenta); una `suppressed` sí cuenta. La ventana de 24 h
  (`ownerWindowOpenUntil`) solo avanza: el barrido de una fila vieja no la retrocede. Los
  contadores leen columnas que se escriben tras el envío: aproximados bajo concurrencia
  (asumido). `interpretarComando` (`webhooks.ts`): quita puntuación inicial (`¡¿"'(*`) y de
  cierre antes de partir; `STOP`/`AYUDA` por primera palabra («¡STOP!», «Ayuda, por favor»);
  `BAJA` solo sola («¡Baja!» sí, «Baja el precio» no); `ALTA` sola o `ALTA <código>`
  (`/^ALTA[\s:-]*([A-Z0-9]{6})?$/`); «Alta demanda hoy» es texto libre.
- Convenciones de `SentMessage`: `callbackData = alta:<businessId>` en la plantilla de
  activación (correlación del botón por `context.id → providerMessageId`, atribución del 131026
  y tope por destino), `aviso:<tipo>` en cada respuesta; `idempotencyKey = alta:<businessId>:
  <epoch ms>` / `entrante:<id>:<tipo>`. `reclamarEnvio(channel, key, extra?)` acepta un tercer
  argumento para que la fila nazca con `businessId/audience/toNumber/callbackData/kind`; si el
  `statuses[]` se adelanta al registro, la fila `adhoc:<id>` se **fusiona** con esos datos.
- 131026 (el destinatario no tiene WhatsApp) llega ASÍNCRONO como fallo de entrega
  (`statuses[].failed` con `errors[].code` o `message.finalized` `delivery_failed`), nunca en
  la respuesta del envío: `actualizarEstadoEnvio` marca `ownerWhatsappUnreachableAt` solo si el
  `toNumber` sigue siendo el `ownerWhatsappNumber`; un `delivered/read` al móvil actual o
  cualquier entrante real del dueño la limpia.
- **Barrido de filas sin enrutar**: el reintento de Telnyx llega con el mismo `data.id` y
  `server.ts` lo descarta como duplicado sin reprocesar nada, así que una fila guardada y no
  enrutada (proceso muerto) la recoge `handleWhatsappMessages` al inicio de cualquier evento
  posterior (`handledAt null`, >2 min y <7 d, reclamo atómico con `handler:
  "reintento:en-curso"`, 20 por pasada). Si el volumen crece se mueve a Cloud Scheduler.
- El nombre real del evento `whatsapp.template.*` no está verificado (fase 0): el `default:`
  del switch de `/webhooks/telnyx` avisa con `warn` de cualquier `whatsapp.*`/`message.*` sin
  handler, y el GET refresca la plantilla cada 24 h por `listTemplates`.
- Panel (PR 2b): `frontend/src/components/whatsapp-dueno.tsx` (Ajustes › Teléfono › Tu móvil,
  antes «Ajustes › WhatsApp»: estado,
  móvil, «Guardar y activar», «Reenviar activación», «Quitar el móvil», enlace `wa.me` con
  `ALTA <código>`, copiar y QR con `qrcode.react`; se refresca cada 10 s mientras esté
  pendiente), campo opcional «Tu móvil con WhatsApp» en `/register/business` (guarda en el
  mismo PATCH y pide la activación en silencio; tolera un backend que ignore el campo), paso
  «Activa los avisos por WhatsApp» en `onboarding-checklist.tsx` (la barra y el «n de 6» salen
  del mismo recuento del frontend, no de `progress`), `lib/phone.ts` (`normalizarMovil`:
  `600 123 456` → `+34600123456`, `esFijoEspanol`, `formatearMovil`), `lib/api-errors.ts`
  (`describeApiError`, `apiErrorCode`), `getOwnerWhatsapp`/`sendOwnerWhatsappActivation` en
  `lib/api.ts`.
**Código (fase 1, PR 3 — avisos al negocio, 2026-09-20).**
- `modules/whatsapp/avisosNegocio.ts`: `enviarAvisoAlNegocio` decide la vía en este orden —
  móvil `activo` y sin baja global (si no, respaldo por email cuando el aviso lo trae) →
  ventana de 24 h abierta (Telnyx) ⇒ interactivo con botones (0,004 $) → plantilla del aviso
  si está `APPROVED` (0,024 $) → sin ventana ni plantilla ⇒ email o nada, fila `skipped`
  (`SIN_VENTANA_NI_PLANTILLA`). Idempotente por recurso (`aviso:<tipo>:<recursoId>`), nunca
  lanza. Avisos: `avisarNuevaReserva` (#1, botones «Vale» · «Ver agenda de hoy»; respeta
  `Business.notificationPrefs.avisoPorReserva`), `avisarCitaPendiente` (#3, «La apunté yo» ·
  «Reintentar» · «Reconectar»; tope de 5 por negocio y hora en Redis; anota
  `Lead.notifiedAt/notifiedVia`; el email `pendingBookingAlertEmail` queda como respaldo),
  `avisarCancelacion` (#4, «Vale»; `Booking.cancelledAt/cancelledBy`), `avisarCitaRecuperada`
  (cuando el reintento en segundo plano mete la cita; solo dentro de la ventana).
  `textoAgendaDelDia` (citas de hoy/mañana en la zona del negocio). Mientras las plantillas
  sigan `PENDING`, fuera de la ventana los avisos #1 y #4 no salen y el #3 va por email.
- Botones de los avisos en `router.ts`: por id `aviso:<tipo>:<recurso>:<accion>` (interactivo)
  o por título + `context.id` → `SentMessage.callbackData` (botón de plantilla). El envío
  original tiene que existir y haber ido a ese móvil; el negocio del aviso tiene que seguir
  teniendo ese móvil; el lead tiene que ser de ese negocio. Handlers `aviso:<tipo>:<accion>`
  (`vale` no responde; `agenda_hoy`; `apuntada` resuelve el lead con `resolvedBy:
  owner_whatsapp`; `reintentar` encola `retry-failed-booking`; `reconectar` manda al panel;
  `avisar_espera` avisa de que la lista de espera es del PR 4) y palabras clave AGENDA / HOY /
  MAÑANA (`agenda:hoy|manana`, solo negocios con consentimiento).
- Ganchos: `voiceTools/service.ts` (tras el upsert de la reserva, al crear el lead
  `pending_booking` y en `cancel_appointment`) y `jobs/retryFailedBooking.ts` (cita
  recuperada). Los avisos se esperan (`await`) por la misma razón que el SMS: Cloud Run
  congela el proceso al responder. Migración `20260920030000_whatsapp_avisos_negocio` (solo
  aditiva): `Business.notificationPrefs`, `Lead.notifiedAt/notifiedVia`,
  `Booking.cancelledAt/cancelledBy`.
- Migración `20260920010000_whatsapp_alta_dueno` (solo aditiva): columnas `ownerWhatsapp*`,
  `ownerWindowOpenUntil`, `ownerAltaCode(@unique)`/`ownerAltaCodeExpiresAt` en `businesses`;
  índice `[handledAt, receivedAt]` en `inbound_messages`; tabla `whatsapp_opt_outs`.
  Checklist de deploy: `whatsapp_senders` con `owner +34930453218` y `client +34930454394`
  (sin ellas, todo lo que llegue al número de clientes acaba en `ignorado:sin-audiencia`) y
  `whatsapp_templates` con `key = 'bienvenida_negocio'` (sin ella el estado nunca cambia).

**Código (fase 1, PR 6 — alertas operativas, 2026-09-20).**
- `modules/whatsapp/alertas.ts`: las cinco alertas del plan (§ 4 fila 5): `alertarCalendarioDesconectado`
  (desde `calendar/conexion.ts` › `marcarCalendarioDesconectado`, solo si no lo pidió el dueño
  desde el panel; una por proveedor y día), `alertarNumeroNoActivo` (`phone/service.ts` al
  marcar `phoneNumberStatus: failed`; una al día), `alertarPruebaTermina` (evento de Stripe
  `customer.subscription.trial_will_end`, nuevo en `billing/service.ts`), `alertarMinutos`
  (`jobs/processUsageReport.ts`, junto al email del 80 %) y `alertarPagoFallido`
  (`invoice.payment_failed`, junto al email). Nunca lanzan. Las dos de facturación no llevan
  email de respaldo (ya sale el suyo); las otras tres sí (`operationalAlertEmail`).
- `avisarAlerta` (avisosNegocio.ts, tipo `alerta`): dentro de la ventana es un interactivo
  **`cta_url`** con el botón «Ir a Ajustes» (`WhatsAppAdapter.sendInteractiveCtaUrl`,
  verificado entregado el 20-09; los botones de respuesta rápida no pueden llevar enlace);
  fuera, la plantilla `alerta_operativa_negocio` (`negocio_nombre`, `texto`) con el sufijo del
  botón URL `https://alhabla.ai/ajustes/{{1}}` = `facturacion | calendario | telefono`. El
  frontend (`next.config.mjs`) redirige `/ajustes/calendario` a `/agente` (donde vive el
  calendario) y `/ajustes/telefono` a `/ajustes#telefono` (Ajustes › Teléfono, desde la fase 2
  del plan de telefonía). Idempotente por recurso (`pago:<invoiceId>`,
  `minutos:<periodId>`, `prueba:<subscriptionId>`, `calendario:<biz>:<proveedor>:<día>`,
  `telefono:<biz>:<día>`, `desvio:<biz>:<intento>` / `desvio-ok:<biz>:<intento>` para el
  mensaje del día 1 sobre el desvío — con el instante del intento, para que el job pueda
  reintentar si no salió por ninguna vía).

**Código (fase 1, PR 5 — recado por post-conversación, 2026-09-20).**
- Tool `informar_al_negocio` (`buildInformarAlNegocioTool` en `lib/telnyxAssistantPayload.ts`,
  inline como las demás — la migración a *shared tools* es #102) y
  `post_conversation_settings.enabled: true` en el payload del assistant (adaptador: create y
  update). Prompt (`lib/managedAgentPrompt.ts`): bloque «## Recados» (preguntar antes de usar el
  número del que llama — hallazgo de la fase 0.5) y «## Al terminar la llamada» (llamar UNA vez
  a la tool, nunca durante la conversación). Se propaga a los assistants por el reconciliador
  (el deploy lo fuerza al tocar esos ficheros).
- `modules/whatsapp/recados.ts` › `procesarInformeFinal` (case `informar_al_negocio` de
  `executeVoiceTool`, siempre 200): reclamo atómico del PRIMER informe en `Call.postCallReport`
  (`updateMany` con `postCallReport: { equals: DbNull }` — Telnyx lo manda dos veces); si el
  segundo trae recado y el primero no, se añade y se avisa; **doble escritura** con los
  insights: `outcome/escalationReason/toolFailureDetected/requestedService` solo si están a
  null, y `warn` «discrepancia insights/informe» cuando difieren (esa es la medida para retirar
  los insights); recado ⇒ `Lead` tipo `message` (`isLead: true`, data `clientName/clientPhone
  (E.164 o null)/motivo/quiereQueLeLlamen/callControlId`) ⇒ aviso #2 `avisarRecado`
  (botones «Atendido» · «Recuérdamelo mañana»; plantilla `recado_negocio` con
  `negocio_nombre/cliente_nombre/cliente_telefono/motivo`; respaldo `messageLeadEmail` al
  primer usuario del negocio, clave `recado-<leadId>`).
- Botones (`router.ts` › `botonDeRecado`): «Atendido» ⇒ `resolvedAt`; «Recuérdamelo mañana» ⇒
  `Lead.snoozedUntil` = 09:00 del día siguiente en la zona del negocio y job
  `recordar-recado` (`jobs/recordarRecado.ts`, ruta `/internal/jobs/recordar-recado`, cola
  `send-whatsapp`, taskId `recado-<leadId>-<yyyymmdd>-<n>`, máximo 3 recordatorios) que vuelve a
  avisar si sigue sin atender (recurso `<leadId>:r<n>`). Migración
  `20260920070000_whatsapp_recado` (aditiva): `Call.postCallReport/postCallReportAt`,
  `Lead.snoozedUntil`.

**Código (fase 1, PR 4 — lado cliente, 2026-09-20).**
- `modules/whatsapp/mensajesCliente.ts`: todo lo que sale al CLIENTE por plantilla. Parámetros
  POR PLANTILLA con el conjunto exacto de claves (Meta rechaza en diferido cualquier clave de
  más o de menos, sin reintento posible): `confirmacion_cita_v2` (4: negocio_nombre, servicio,
  cita, negocio_telefono + botón URL «Cómo llegar» con el `placeId`, índice derivado de
  `WhatsappTemplate.components`, respaldo 1), `confirmacion_cita` es_ES (5, SIN profesional),
  `recordatorio_cita_v2` (3), `recordatorio_cita`/env (6), `hueco_libre` (2),
  `hora_disponible`/env (4). Cascada `elegirPlantillaCliente` en el momento del envío: v2
  aprobada (la confirmación solo con `Business.placeId`) → aprobada actual → variable
  `WHATSAPP_TEMPLATE_*_NAME` → `SIN_PLANTILLA`; antes de cada clave `refrescarPlantilla` (≤ 1
  llamada al WABA/día/clave), así una v2 aprobada entra sola en ≤ 24 h sin deploy.
  `programarMensajesAlCliente({ bookingId })` encola la confirmación
  (`booking-<id>-confirmacion-<epochSeg>`) y, con plan Pro/Scale y > 24 h, el recordatorio
  (`booking-<id>-recordatorio-<epochSeg>`; a más de 29 d se programa a 29 d y el job se reencola
  con taskId `-s<n>`, máximo 12 saltos, conservando esa clave en el payload: `enqueueWhatsappJob`
  solo pone `idempotencyKey = taskId` cuando el payload no trae una, así la fila final de
  `sent_messages` lleva la clave documentada); devuelve si la confirmación quedó programada (sin
  consentimiento, sin número, sin `telnyxPhoneNumber`, cancelada, negocio inactivo o STOP ⇒ no;
  ALREADY_EXISTS de Cloud Tasks = «ya programado»). `enviarMensajeAlCliente` (cuerpo del job
  `send-whatsapp` para la forma por propósito, `lib/jobTypes.ts › SendWhatsappJobPorProposito`)
  relee la reserva o el lead y descarta con fila `skipped` (`RESERVA_CANCELADA`, `HORA_CAMBIADA`,
  `DESTINO_CAMBIADO` — el `toNumber` de la tarea ya no es el titular `clientPhone ??
  call.fromNumber` de la reserva, o el `clientPhone` del lead: un número corregido en la misma
  llamada no recibe la cita de otro —, `SIN_CONSENTIMIENTO`, `RECORDATORIO_TARDIO` — también si
  `now` ya es el día civil de la cita —, `AVISO_CERRADO`, `HORA_PASADA`); solo `enviarPlantilla`
  va en el try/catch que marca `failed`
  (`where providerMessageId: null`) y relanza; después escribe `Booking.clientNotifiedAt` o
  `Lead.notifiedAt/notifiedVia` sin relanzar. `nombreParaCliente` (respaldo «el negocio», nunca
  «tu negocio»), `telefonoDeContacto` (Telnyx formateado `+34 930 454 394` → `phone` E.164 →
  null), `sanearNombre` (80 caracteres, una línea), vCard `TARJETA_ALHABLA_RESERVAS`.
- `modules/whatsapp/botonesCliente.ts` (`router.ts › enrutarEnClientes` delega todo `button`):
  `resolverBotonDeCliente` exige `context.id` → fila `SentMessage` con `audience client`,
  `toNumber === from` y `callbackData cliente:<tipo>:<recurso>` (`confirmacion | recordatorio |
  hueco | cambio | cancelacion`); la acción sale del id `cliente:<tipo>:<recurso>:<accion>` (debe
  casar con el callback) o del título (lista cerrada, sin acentos ni puntuación) y se valida
  contra el tipo. Rechazos ⇒ `cliente:boton:<motivo>` (`sin-contexto`, `sin-fila`,
  `remitente-distinto`, `sin-callback`, `recurso-distinto`, `titulo-desconocido`,
  `accion-no-permitida`, `negocio-inactivo`, `recurso-ajeno`, `no-titular`); solo `sin-contexto`
  y `titulo-desconocido` responden (`botonSinContexto`, una vez al día). El negocio sale de la
  fila del envío, nunca del payload; la reserva/lead se busca con `call: { businessId }` y la
  titularidad es `(clientPhone ?? call.fromNumber) === from` / `data.clientPhone === from`.
  Handlers `cliente:<accion>[:sufijo]`: `guardar_contacto` (vCard reclamada por
  `contacto-<bookingId>`, `:repetido` sin respuesta, `:baja`, `:fallido` ⇒ `contactoComoTexto`),
  `confirmo` (`updateMany` con `confirmedByClientAt: null`; `:repetido`, `:cancelada`, `:pasada`),
  `cancelar` (`cancelarReserva` con `client_button`; `:ya-cancelada`, `:pasada`), `cambiar` (solo
  da el teléfono), `reservar` (`reservarDesdeListaDeEspera`; la respuesta `huecoReservado` ES la
  confirmación, salta el techo y escribe `clientNotifiedAt` si sale; si Telnyx falla se encola
  la plantilla de confirmación como respaldo; `:ya-reservada`, `:ocupado`, `:fuera-de-plazo`,
  `:pasada`, `:cerrado`, `:sin_calendario | :calendario_caido | :lock | :error` ⇒
  `noPudeReservarAhora`), `ya_no` (`cerrarAviso` y `avisarAQuienEsperaba(origen renuncia)`;
  sobre un lead `reservado` cuya reserva ya se canceló, `:reserva-cancelada` + `huecoRechazado`,
  nunca «esa hora ya está reservada a tu nombre»),
  `vale` (sin respuesta), `no_me_va_bien` (Lead `client_change_rejected`, aviso al dueño en fase
  2). Sobre una cita cancelada/pasada, «Confirmo/Cancelar/Cambiar» nombran la otra cita activa
  del mismo teléfono en ese negocio (`otraCitaActiva`). Las acciones de BD se ejecutan aunque la
  respuesta se silencie (techo 20/h) o se suprima (STOP). Respuestas en `respuestas.ts`
  (`responder`/`resultado`/`normalizarTitulo`, movidos tal cual de `router.ts`).
- `modules/whatsapp/listaDeEspera.ts` (sustituye a `notifyPendingAvailabilityWatchers` de
  voiceTools): `avisarAQuienEsperaba({ businessId, hueco, origen })` ofrece la plaza AL PRIMERO
  y para. Carga 50 leads `availability_watch` del negocio por antigüedad; ANTES del filtro de
  solapamiento cierra los pasados (`resolvedBy pasado`) y las ofertas caducadas (`notifiedVia
  plantilla:*` y ≥ 10 min ⇒ `sin_respuesta`, reabrible por un «Sí» tardío). La limpieza
  garantiza PROGRESO ENTRE DISPAROS, no dentro del mismo: si la página de 50 son todo zombis, ese
  disparo los cierra y devuelve `nadie`, y el 51.º recibe la plaza en el siguiente («Ya no», otra
  cancelación o el botón del dueño); los `encolado` muertos no se cierran, solo vuelven a ser
  candidatos; una oferta vigente
  (< 10 min) devuelve `en_oferta` y retiene la plaza; un `encolado` con ≥ 10 min vuelve a ser
  candidato; STOP ⇒ `baja`; `checkBusinessHours`/`checkBookingRestrictions` y disponibilidad real
  (calendario + `checkAvailability`) antes de ofrecer; reclamo atómico (`updateMany` sobre
  `notifiedAt null | encolado caducado` ⇒ `notifiedVia encolado`) y job `hueco_libre` con clave
  `espera-<leadId>-<epochSeg>` (una por OFERTA). Resultados: `avisado | en_oferta | nadie |
  sin_plantilla | error`. `reservarDesdeListaDeEspera` («Sí, resérvala») calca
  `retryFailedBooking`: lock por negocio, relectura del lead dentro del lock, `fuera_de_plazo` ≠
  `ocupado`, no reserva a ciegas (`calendario_caido`), evento con `buildCalendarIdempotencyKey`
  (`lib/calendarIdempotency.ts`, compartido con voz y el job) con `distintivo =
  inboundMessageId` (una clave por TOQUE: tras un `error` con el evento deshecho, la misma clave
  haría que Google devolviera el evento CANCELADO como éxito ante el 409 — reserva invisible y
  doble reserva; la idempotencia entre toques la dan el lock, la relectura y la Call sintética)
  y en UNA transacción la Call sintética (`callId = whatsapp:espera:<leadId>`, `voiceProvider
  whatsapp`, `providerCallId = leadId`, `RESOLVED`, 0 s), el Booking colgado de `llamada.id` (FK
  a `calls.id`, NUNCA la cadena) con `createdVia whatsapp_lista_espera` y `smsConsent true`, y el
  cierre CONDICIONAL del lead (`updateMany` sobre `resolvedAt null | sin_respuesta`; count 0 = un
  «Ya no» concurrente lo cerró ⇒ se deshace todo, evento incluido, y responde `cerrado`); después
  #1 al dueño y solo el recordatorio. Un «Sí» que no acaba en reserva no deja ninguna Call. Un
  lead `reservado` cuya reserva ya está cancelada (`reservaDelLeadCancelada`, solo reservas de
  ese negocio) responde `cerrado`, no `ya_reservada`. `cerrarAviso` («Ya no»).
  Botón del dueño «Avisar lista espera» (#4; la plantilla `cancelacion_negocio` dice «Avisar a
  quien esperaba» y se resuelve por título) en `router.ts › botonDeListaDeEspera`: reserva de
  ESE negocio, `:no-cancelada`, `:pasada`, `:reserva-ajena`, y las respuestas `listaDeEspera*`
  (nombre o «la primera persona que esperaba», nunca el teléfono).
- `modules/bookings/cancelacion.ts › cancelarReserva` (voz y botón): `updateMany` sobre
  `isCancelled: false` (idempotente: `ya_cancelada` sin segundo #4 ni segunda oferta), evento
  externo con la conexión con la que se creó, #4 y lista de espera, todo best-effort con log
  `[Booking]`. `cancel_appointment` conserva la titularidad por `fromNumber` y delega.
- Efectos de entrega (`service.ts › aplicarEfectosDeEntrega`, callback `cliente:*`): Meta
  rechaza EN DIFERIDO por `statuses[].failed` (132xxx parámetros/plantilla, 131049 marketing,
  130429/131048 tier, 40008, 131026); siempre `console.error` con plantilla, negocio, destino y
  código; `cliente:confirmacion` ⇒ `clientNotifiedAt: null` y, si era la v2 y el código es
  132000/132001/132012/132015/132016, encola UNA vez el respaldo con `sinV2: true` (sale
  `confirmacion_cita`), con taskId `booking-<id>-confirmacion-<epochSeg>-respaldo` derivado de la
  RESERVA (si el `statuses[]` se adelantó al registro la fila es `adhoc:<wamid>` y Cloud Tasks
  rechazaría los `:`); `cliente:hueco` ⇒ reabre el lead (`notifiedAt null`, `notifiedVia
  ninguna:meta:<código>`, `resolvedAt null`) salvo 131026 (`sin_whatsapp`) o si ya respondió;
  `recordatorio`/`contacto` solo log. `SentMessage.templateName/templateLanguage` se escriben
  también al enviar por `{ id }` (campos opcionales nuevos de `EnvioPlantilla`).
- Prompt (`lib/managedAgentPrompt.ts`): la recepcionista solo anuncia «un WhatsApp de Alhabla»
  si `book_appointment` devuelve `mensajeCliente: "whatsapp"` (la tool lo calcula por
  `programarMensajesAlCliente`; un STOP previo NO se revoca por consentimiento de voz, solo con
  ALTA en el chat); la frase «te aviso por WhatsApp si se libera esa hora» entra solo con
  `listaDeEspera: true` = `listaDeEsperaDisponible()` (`service.ts`: `hueco_libre` APPROVED,
  caché 60 s, ante BD caída el último valor conocido sin cachear), propagado desde
  `telnyxAgentSync`, `agentBootstrap` y `PATCH /business/me`; con `false` instruye a no usar
  `notify_when_available` (la tool sigue registrada; gana `clientName` opcional). El cambio de
  estado de `hueco_libre` (webhook o `refrescarPlantilla`) invalida la caché y lo deja en el log;
  el assistant se reescribe en el `telnyxReconciler` diario, que ahora empieza por
  `refrescarPlantillasConClave()`.
- `lib/messageIdempotency.ts › reclamarEnvio(..., { reintentarFallidos: true })`: re-reclama
  una fila `failed` SIN `providerMessageId` (Telnyx nunca la aceptó); opt-in solo en los envíos al
  cliente, la vCard y la forma legada del job; `enviarAvisoAlNegocio` y `responder` no cambian.
  Los upserts de reserva (voz, `retryFailedBooking`, lista de espera) escriben `createdVia` en
  `create` y resetean `isCancelled/cancelledAt/cancelledBy` en `update` (cancelar y volver a
  reservar en la misma llamada reactiva la fila; el atajo idempotente de `executeBookAppointment`
  exige además `!isCancelled`, y la clave del calendario lleva `distintivo
  reactivada:<cancelledAt>` para no recibir el evento ya borrado; el evento previo no se vuelve a
  borrar). `PATCH /business/me` acepta `placeId`
  (`[A-Za-z0-9_-]{1,512}`) y `address` (≤ 500), sin resincronizar el prompt. Migración
  `20260920050000_whatsapp_lado_cliente` (solo aditiva): `businesses.placeId/address`,
  `bookings.confirmedByClientAt/createdVia/clientNotifiedAt`. Sin variables de entorno nuevas
  (`WHATSAPP_TEMPLATE_*_NAME` son el último respaldo). Límites conocidos: A→B→A dentro de la
  misma llamada (la tercera confirmación tiene el nombre de tarea de la primera: ALREADY_EXISTS,
  «ya programado»); las Call `voiceProvider: "whatsapp"` aparecen en el listado y en las
  estadísticas (filtrarlas es seguimiento); sin retro-relleno de `placeId` en negocios ya dados de
  alta (reciben `confirmacion_cita` hasta tenerlo). Antes de fusionar: leer `components` de
  `confirmacion_cita_v2` en producción y confirmar la posición del botón URL, y probar la URL
  de «Cómo llegar» con un `placeId` real (`query=place_id:` no es la forma documentada por Google).

**Código (fase 1, PR 7 — toggle «aviso por reserva», 2026-09-20).**
- `modules/whatsapp/preferencias.ts` › `preferenciasDeAvisos(raw)` lee `Business.notificationPrefs`
  (JSON) sin fiarse de su forma: solo booleanos, `null`/array/basura ⇒ `{}`. Vive en su propio
  fichero para que `altaDueno.ts` no importe `avisosNegocio.ts` (ciclo); `avisosNegocio.ts` lo
  reexporta por compatibilidad. `avisarNuevaReserva` (#1) no sale si `avisoPorReserva === false`;
  #2-#5 y las alertas no dependen de la preferencia.
- `PATCH /business/me` acepta `notificationPrefs: { avisoPorReserva?: boolean }` (`.strict()`:
  cualquier otra clave ⇒ 400) y lo **fusiona** con el JSON guardado (nunca lo sustituye), para
  que las preferencias que vengan después (`cierreDelDia`, `chatBeta`) no se pisen entre sí.
  Sin resincronizar el prompt.
- `GET /business/me/whatsapp` devuelve `avisoPorReserva: boolean` (ausente ⇒ `true`).
- Panel (`components/whatsapp-dueno.tsx`): casilla «Avisarme por WhatsApp de cada reserva nueva»
  bajo el bloque ALTA, solo cuando hay móvil guardado (`status !== "sin_numero"`); guarda al
  cambiar, actualiza `["my-business"]` y `["owner-whatsapp"]` con la respuesta del PATCH (que
  devuelve el negocio entero) y, si la respuesta no trae el valor pedido (backend anterior), lo
  dice en vez de darlo por guardado — mismo patrón que el móvil.

**Código (fase 2, PR 1 — cimientos de conversaciones + la recepcionista por chat, 2026-09-20).**
- Decisiones del usuario (20-09): la fase 2 va «cliente primero» (este PR) → Gestor en tres
  PRs (base y agenda de lectura → catálogo y onboarding → citas, ausencias y bloqueos) → panel y
  tests de integración; los interruptores globales quedan **apagados en producción** hasta que
  el usuario lo pruebe (`TELNYX_CLIENT_CHAT_ENABLED` / `TELNYX_OWNER_CHAT_ENABLED`, ausentes =
  `false`; con `false` el texto libre recibe la respuesta fija de siempre).
- **Cómo funcionan las tools en chat (verificado en dev, 2026-09-20):** la conversación de
  Telnyx se crea con `metadata.call_control_id = "whatsapp:chat:<uuid>"` y Telnyx lo templa en
  la cabecera `X-Alhabla-Call-Control-Id: {{call_control_id}}` de las tools inline de la
  recepcionista, igual que en una llamada (las claves de los metadata resuelven como variables
  dinámicas; hallazgo de la fase 0.4). El backend resuelve esa **Call sintética**
  (`voiceProvider: "whatsapp"`, `providerCallId = callId`, `providerConversationId` = id de la
  conversación, `fromNumber` = móvil del cliente, `status: COMPLETED` para que ni el barrido de
  zombis ni el panel la vean en curso) y todas las tools de voz funcionan sin tocar ningún
  assistant: probado de extremo a extremo contra la recepcionista de dev de Peluquería
  Alhambra — `get_catalog` → `check_availability` (con especialidad) → `book_appointment`
  (evento real en Google Calendar) → `find_my_appointment` → `cancel_appointment`, turnos de
  3,7-5,7 s. En chat `{{telnyx_end_user_target}}` no resuelve y **`{{telnyx_current_time}}`
  resuelve en UTC** (la recepcionista dijo «14:51 hora de Madrid» a las 16:51): por eso el
  backend antepone a cada mensaje el marcador `[WhatsApp · <móvil> · <fecha y hora en la zona
  del negocio> (<zona>)]` y el prompt tiene el bloque «## Chat por WhatsApp»
  (`managedAgentPrompt.ts`: el marcador es la única fuente fiable del número y del momento;
  sin `end_call` ni referencias a voz; `smsConsent: true` sin preguntar; el cliente que «ha
  pulsado Cambiar» se atiende con find_my_appointment → nueva hora → cancelar + reservar). El
  cambio de prompt resincroniza todos los assistants por el reconciliador (hash de configuración).
- `modules/whatsapp/chatCliente.ts` › `conversarConRecepcionista({ message, businessId, texto,
  etiqueta? })`: nunca lanza; devuelve `{ atendido: false, motivo }` (`apagado`,
  `apagado_negocio` = `Business.clientChatEnabled` false, `negocio_inactivo` = inactivo o
  suscripción en `ESTADOS_DE_SUSCRIPCION_BLOQUEADOS`, `sin_recepcionista` = sin
  `Agent.telnyxAssistantId`, `sin_texto`) y el enrutador responde lo de siempre, o
  `{ atendido: true, resultado }` con handler `chat:cliente` (`:limite` 21.º turno del día por
  cliente y negocio en Redis, `whatsapp:chat:cliente:<biz>:<from>:<yyyy-mm-dd>` en la zona del
  negocio; `:ocupado` si el lock del hilo `lock:whatsapp:chat:<biz>:<from>` no se consigue en
  25 s — dos mensajes seguidos se atienden en orden; `:error` si Telnyx falla, no responde en
  30 s o devuelve vacío). `conversacionVigente` reutiliza la conversación guardada (< 30 días) o
  crea otra (rotación) y su Call sintética en una transacción; un 404 de Telnyx en el turno
  rota y repite una sola vez. Respuesta por `responder(message, "chat", …)` (reclamo
  `entrante:<id>:chat`, techo 20/h) **tal cual la devuelve la recepcionista: sin etiqueta
  «Beta» ni coletilla** (decisión del usuario del 20-09 al ver los mensajes: «Beta» solo en el
  panel; vale también para el Gestor); `limiteDiarioDelChat` y `chatNoDisponible` una vez al
  día. Tabla
  `client_conversations` (`ClientConversation`: `@@unique([businessId, clientPhone])`,
  `conversationId` y `callId` únicos, `startedAt` para la rotación, `turns`).
- Enganches: `router.ts › textoEnClientes` (texto o palabra clave de un cliente conocido con
  `businessId` → chat; si no atiende, `clienteConocido`) y `botonesCliente.ts › cambiar`
  («Cambiar» del recordatorio abre el chat con «He pulsado Cambiar en el recordatorio de mi
  cita del <cita> con <profesional>…», etiqueta `cliente:cambiar:chat`; sin chat,
  `comoCambiarCita`). Las reservas hechas por chat llevan `createdVia: "client_chat"` y las
  cancelaciones `cancelledBy: "client_chat"` (`canalDeLaTool` en voiceTools/service.ts por el
  prefijo del callId; `cancelarReserva` lo acepta).
- Adaptador (`TelnyxAiAdapter`): `createConversation` (desenvuelve `data`), `updateConversation`
  (`metadata`, `system_prompt` aunque el SDK no lo tipe), `addConversationMessage`,
  `chatWithAssistant` (`ai.assistants.chat` → `content`). Migración
  `20260920100000_whatsapp_conversaciones` (solo aditiva): `businesses.clientChatEnabled /
  ownerChatEnabled` (default true) / `ownerConversationId / ownerConversationCreatedAt` (para el
  Gestor) y la tabla `client_conversations`. Variables nuevas en `.env.example` y
  `docker-compose.yml`. Queda para PRs siguientes: la lista para elegir negocio cuando el
  cliente tiene citas en varios (hoy va al de la reserva más reciente), el panel («Tu chat con la
  recepcionista», toggle «chat Beta» en Ajustes) y los tests de integración. El UTC de
  `{{telnyx_current_time}}` afectaba también a las llamadas de voz desde el primer día de Telnyx
  (issue #122): resuelto el 20-09 traduciendo el patrón de Retell a la variante con zona
  `{{telnyx_current_time_<zona IANA>}}` (`adaptManagedPromptForTelnyx`), verificado por chat en
  dev («cinco y treinta y seis de la tarde» a las 17:36 de Madrid).

**A qué negocio le escribe un cliente (auditoría del 24-09).** El número «Alhabla Reservas» es
UNO para toda la plataforma, así que el mismo móvil puede tener citas en dos negocios. Antes se
cogía la reserva más reciente de ese teléfono, sin filtrar por negocio, y el texto libre podía
acabar en la recepcionista del negocio equivocado (los botones nunca: validan `context.id`
contra `SentMessage`). `modules/whatsapp/tenantDelCliente.ts` resuelve por orden: el mensaje al
que responde → lo que el cliente eligió cuando se le preguntó (Redis, 6 h) → la conversación en
curso (`InboundMessage` de las últimas 6 h) → sus reservas, solo si todas son del mismo negocio.
Si siguen quedando varios, **no se adivina**: el enrutador pregunta con botones
(`cliente:negocio:<id>`) y valida la respuesta contra los negocios en los que ESE móvil tiene
reservas, nunca contra el id que llega en el payload. Con más de tres negocios no caben botones
y se pide el nombre. Ojo: esto es solo el lado cliente; un **dueño** con varios negocios sigue
hablando por el que elige `identificarRemitente`.

**Código (fase 2, PR 2 — el Gestor base, 2026-09-20).**
- **Un assistant de Telnyx para toda la plataforma**, `alhabla-gestor` (§ 8), detrás del número
  de negocios; su id va en `TELNYX_GESTOR_ASSISTANT_ID` (uno por entorno; dev:
  `assistant-776758e8-…`, creado el 20-09 y apuntando a `dev-api.alhabla.ai`; producción:
  `assistant-302a2a23-e77c-43ec-8fc7-db094ea0c5c3`, creado el 21-09 apuntando a
  `api.alhabla.ai`, con `TELNYX_OWNER_CHAT_ENABLED=true` en Cloud Run desde la revisión
  `alhabla-api-00160`; `TELNYX_CLIENT_CHAT_ENABLED` sigue apagado). Se crea con
  `scripts/manual/sincronizarGestor.mts --crear` y lo mantiene al día el reconciliador diario
  (`lib/gestorSync.ts › sincronizarGestor`: compara instrucciones, modelo y la firma de las
  tools — nombre, url, cabeceras, descripción, parámetros — y no el JSON entero, que trae
  valores por defecto de Telnyx); el deploy fuerza el reconciliador cuando cambian
  `gestorPayload.ts` o `gestorSync.ts`. Modelo `openai/gpt-5.6-luna` (el mismo que las
  recepcionistas); **sin `fallback_config`**: el `zai-org/GLM-5.3-Flash` del plan no está
  disponible para assistants (10027).
- **El negocio es dato, no prompt** (`lib/gestorPayload.ts`): prompt único y estable; la
  conversación de Telnyx la crea Alhabla con `metadata { business_id, role: "owner", channel,
  owner_phone }` y `system_prompt` con nombre, sector y zona; Telnyx templa los metadata en las
  cabeceras de las tools inline `X-Alhabla-Business: {{business_id}}` y `X-Alhabla-Role:
  {{role}}` (verificado en vivo el 20-09 con un túnel a un backend de la rama). Tools inline y
  no *shared tools* por `tool_ids` (con un único assistant no aportan nada y una shared tool
  usada por un assistant borrado no se puede eliminar). Ruta
  `POST /webhooks/telnyx/gestor/:toolName` (server.ts): misma firma Ed25519 que las tools de
  voz; `modules/gestor/tools.ts › handleGestorToolInvocation` exige la cabecera del negocio
  (400 si falta o llega el placeholder sin resolver) y `role === "owner"` (403). Tools:
  `contexto_negocio` (negocio, sector, zona, teléfonos, plan, servicios con precio en euros,
  profesionales, horario, calendario operativo, `faltaPorConfigurar`, citas pendientes y
  recados con sus ids), `listar_agenda({ dia: hoy|manana|AAAA-MM-DD })`, `resumen_llamadas({
  dias 1-31 })` (excluye las Call `whatsapp`, resultados traducidos) y `proponer_accion`.
- **Regla de oro (`modules/gestor/acciones.ts`)**: el LLM nunca ejecuta. `proponer_accion`
  valida tipo y parámetros (Zod `.strict()` por tipo), comprueba que el recurso sea del negocio
  y guarda una `OwnerPendingAction` (24 h; tabla propia y no `Lead pending_owner_action` como
  decía el plan, porque un Lead exige Call y sale en los listados). El turno en curso vive en
  Redis (`gestor:turno:<biz>` = entrante + conversación, TTL 180 s) para que la tool sepa a qué
  responde; la tool deja `gestor:propuesta:<biz>` = id y `chatDueno.ts` manda la respuesta del
  LLM como interactivo con «Confirmar» · «Cancelar» (`accion:<id>:confirmar|cancelar`,
  `responder()` acepta `botones`). El botón (`router.ts › botonDeAccion`) exige que la propuesta
  sea de un negocio cuyo móvil dado de alta es el que pulsa, reclama atómicamente
  (`confirmedAt/rejectedAt` null en el where: dos toques no ejecutan dos veces), ejecuta por el
  registro `ACCIONES_DEL_GESTOR`, guarda el resultado y **lo anota en la conversación de Telnyx
  como mensaje `system`** para que el siguiente turno del Gestor lo sepa. Única acción de este
  PR: `resolver_pendiente` (cierra un lead `pending_booking` con `resolvedBy: owner_chat`, como
  «La apunté yo»). Probado en vivo en dev: agenda → citas pendientes → «la de Elena ya la apunté
  yo» → interactivo con botones → Confirmar → lead resuelto → segundo toque «ya decidida».
- `modules/whatsapp/chatDueno.ts › conversarConGestor`: interruptor global
  `TELNYX_OWNER_CHAT_ENABLED` (ausente = apagado, decisión del usuario) y por negocio
  (`ownerChatEnabled`), `TELNYX_GESTOR_ASSISTANT_ID` obligatorio, negocio activo y sin
  suscripción bloqueada, **solo el móvil dado de alta y `activo()`** (STOP o sin consentir ⇒
  respuesta fija), 60 turnos por negocio y día (Redis, zona del negocio), lock por hilo,
  conversación en `Business.ownerConversationId` (rota a los 30 días por
  `ownerConversationCreatedAt`, se cierra con STOP/BAJA y se reabre sola si Telnyx devuelve
  404), marcador `[WhatsApp · <fecha y hora local>]` delante de cada mensaje, timeout 30 s, sin
  etiqueta «Beta»; `limiteDiarioDelGestor` y `gestorNoDisponible` una vez al día. Enganches en
  `router.ts`: texto del dueño → Gestor (si no atiende, `todaviaNoChateo`), `MAL` →
  `OwnerChatFeedback` con la última pareja pregunta/respuesta leída de Telnyx (sin el
  marcador), `AYUDA` cuenta que se puede preguntar solo con el Gestor encendido. Un dueño con
  varios negocios habla por el que `identificarRemitente` elige (el más reciente): la elección
  por chat queda para más adelante.
- Migración `20260920120000_whatsapp_gestor` (solo aditiva): `owner_pending_actions` y
  `owner_chat_feedback`. Variables nuevas: `TELNYX_GESTOR_ASSISTANT_ID` (`.env.example`,
  `docker-compose.yml`). Queda para los PRs 3 y 4: catálogo y onboarding por chat, citas,
  ausencias y bloqueos (mismo registro de acciones), y la lista para elegir negocio.

**Código (fase 2, PR 3 — catálogo y onboarding por chat, 2026-09-20).**
- `modules/gestor/accionesCatalogo.ts`, ocho acciones más por el mismo registro
  (`ACCIONES_DEL_GESTOR` = `resolver_pendiente` + `ACCIONES_DE_CATALOGO`): `crear_servicios`
  (lote de hasta 20), `editar_servicio`, `retirar_servicio`, `crear_profesionales` (lote de
  hasta 10, con `especialidades`), `retirar_profesional`, `fijar_especialidad` (tres niveles;
  «normal» borra la fila), `fijar_horario` (la semana entera, claves en español sin tilde,
  hasta 3 tramos por día; conserva las excepciones) y `cerrar_dia` (excepción `closed` por
  fecha; exige horario semanal ya fijado — un negocio recién creado tiene `schedule: {}` y no
  se le inventa una semana; la fecha tiene que existir y no haber pasado en la zona del
  negocio; se deduplica por fecha). **Los lotes existen para que el onboarding sea una
  confirmación por paso** (una tabla de servicios ⇒ un botón). Servicios y profesionales se
  nombran por id o por nombre exacto sin mayúsculas ni acentos (`resolverPorIdONombre`; si el
  nombre es ambiguo, no resuelve). Precios en euros (`precioEuros`, `null` quita la tarifa) y
  conversión a céntimos al ejecutar: los parámetros guardados se re-parsean al confirmar, así
  que los esquemas no llevan `transform`. `comprobar` corre al proponer y `ejecutar` hasta 24 h
  después: `ejecutar` revalida duplicados por nombre y el límite de plan lo aplica el propio
  servicio (`PlanLimitError` ⇒ mensaje del plan). `parametros` inválidos devuelven el `path`
  de Zod («servicios.0.duracionMinutos: …») para que el LLM sepa qué corregir.
- Reutiliza los servicios del panel (`modules/bookings/service.ts`: `createService`,
  `updateService`, `deleteService`, `createProfessional`, `updateProfessional`,
  `deleteProfessional`) con la opción nueva `{ sync: false }` y sincroniza UNA vez por lote con
  `syncBookingConfiguration` (ahora exportada) envuelta en `sincronizarCatalogo`: **best-effort
  con log ruidoso**, porque `syncAgentToRetell` lanza si la publicación falla y el cambio ya está
  en la BD (el reconciliador repara el drift). El horario va por
  `modules/businesses/horario.ts › guardarHorarioDelNegocio` (update → caché de voz →
  Retell → Telnyx → tools de calendario, mismos pasos que `PATCH /business/me`; la parte de
  sincronización también best-effort). El PATCH del panel no se toca.
- `ResultadoDeEjecucion` gana `nota`: `mensaje` es lo que lee el dueño por WhatsApp y `nota`
  (con ids) lo que se anota como mensaje `system` en la conversación de Telnyx — así el
  siguiente turno del Gestor tiene los ids de lo recién creado sin volver a llamar a
  `contexto_negocio`.
- `contexto_negocio` devuelve además los niveles de cada profesional (`especialista`,
  `noSugerir` por nombre de servicio), `enlaces` (`panel`, `calendario` = `/agente`,
  `ajustes`) y el estado del calendario con matices (`conectado` · `sin conectar` · `a medias:
  falta elegir el calendario` · `caducado`). **El calendario no se puede conectar desde el
  chat**: el OAuth exige la cookie de estado del navegador (`GET /calendar/auth/google` la fija
  en la misma respuesta) y un enlace abierto desde el móvil sin sesión acaba en `/login` sin
  `next=`; el Gestor da el enlace al panel y punto. Un enlace de un solo uso queda para más
  adelante.
- Prompt (`lib/gestorPayload.ts`): bloque «## Poner en marcha la recepcionista» (si
  `faltaPorConfigurar` no está vacío, por pasos y en orden — servicios → equipo → horario →
  calendario —, un paso por mensaje, una propuesta por paso con todos los datos, completar la
  semana entera con domingo cerrado, HH:MM de 24 h), «una sola propuesta a la vez» y
  `ACCIONES_PROPONIBLES` (tipo + forma de los parámetros + cuándo), que alimenta la descripción
  de `proponer_accion` y se contrasta con el registro en un test. La bienvenida tras el alta
  (`bienvenidaTrasAlta`) ofrece «escríbeme "empezamos"» cuando el Gestor está encendido y falta
  horario, servicios o equipo (`chatDueno.ts › ofrecerPuestaEnMarcha`).
- Probado en vivo en dev (túnel a un backend de la rama, `Barbería Prueba Miguel` = el negocio
  de prueba vacío con el móvil del usuario): «empezamos» → servicios (3 en una propuesta) →
  equipo (Laura especialista en Color, por id de la nota) → horario L-V 09:30-20:00 y S
  09:30-14:00 → «¿qué me falta?» (calendario y número, con enlaces) → cerrar el 12-10 → subir
  el corte a 17 € → «Miguel no hace color» (`no_sugerir`); el límite del plan Inicio (3) rechazó
  «Pedro y Sofía» al proponer con el texto del plan. Turnos de 3,5-6 s; confirmar el horario
  8,5 s (dos orquestadores + tools).
- Revisión adversarial (workflow de 5 dimensiones × 3 verificadores, 20-09) y lo que cambió por
  ella: **tras un botón el Gestor recibe un turno de seguimiento** (`chatDueno.ts ›
  continuarTrasAccion`: sin él, el «Hecho» fijo dejaba el onboarding parado hasta que el dueño
  volvía a escribir; si contesta «Listo.» no se manda nada); al proponer, **las propuestas
  anteriores sin decidir se cierran como sustituidas** (un botón viejo no ejecuta una intención
  corregida); **lock por negocio al ejecutar** (`lock:gestor:accion:<biz>`: dos «Confirmar»
  paralelos sobre el mismo horario no se pisan); anotar el resultado tras ejecutar es
  best-effort (no convierte un «hecho» en «no he podido»); **los nombres se resuelven a ids al
  proponer** (`comprobar` devuelve `parametros` normalizados, que son los guardados) y un nombre
  repetido se declara ambiguo en vez de «no existe»; `editar_servicio` no deja renombrar a un
  nombre que ya existe; el botón exige además consentimiento vigente y `ownerChatEnabled`;
  tramos ordenados; `Id` admite 80 caracteres; los errores crudos (Prisma, red) no llegan al
  dueño; **Telnyx (primary) se sincroniza antes que Retell** en `syncBookingConfiguration` y
  `guardarHorarioDelNegocio` (Retell lanza y dejaba a Telnyx sin sincronizar); una respuesta
  con propuesta de más de 1000 caracteres va como texto + un interactivo aparte con el resumen
  (Meta limita el cuerpo a 1024); prompt: los parámetros inválidos los corrige el LLM sin
  decírselo al dueño, «empezamos» es la señal de arranque, el número y el calendario no son
  pasos, AYUDA cuenta que se puede pedir por chat. Límite conocido: un móvil dueño de dos
  negocios habla por el que `identificarRemitente` elige.

**Código (fase 2, PR 4 — citas, avisos al cliente, ausencias y bloqueos, 2026-09-20).**
- `modules/gestor/accionesAgenda.ts`, seis acciones más por el mismo registro
  (`ACCIONES_DE_AGENDA`): `añadir_cita` (alias `anadir_cita` por si el modelo pierde la eñe),
  `mover_cita`, `cancelar_cita`, `avisar_cliente`, `marcar_ausencia` y `bloquear_franja`;
  `cerrar_dia` (catálogo) gana `hastaFecha` (vacaciones, hasta 31 días seguidos, una
  excepción por fecha). Fechas y horas **en hora local del negocio** (`AAAA-MM-DDTHH:MM`,
  `instanteLocal` con doble pasada por el cambio de hora): el LLM no convierte zonas.
- **Citas**: `añadir_cita` resuelve servicios/profesional por id o nombre, suma la duración de
  los servicios si no se dice, y `comprobar` ya hace la comprobación real (`comprobarHueco`:
  horario, `checkBookingRestrictions`, calendario **operativo** — sin él no se apunta, como la
  voz —, ocupación externa y `checkAvailability`); si no hay hueco, el motivo lleva el
  `suggestedNextSlot` en palabras y el LLM lo ofrece. `ejecutar` es la receta de la lista de
  espera: lock de reserva, evento en el calendario con clave determinista por acción
  (`whatsapp:gestor:<accionId>` + `distintivo` = entrante del botón), transacción con la Call
  sintética (`voiceProvider: "whatsapp"`) y el `Booking` (`createdVia: "owner_chat"`,
  `smsConsent: false`), y deshacer el evento si la transacción falla. `mover_cita` comprueba
  con `excluir: { bookingId, externalEventId }` (nuevo en `checkAvailability`: la cita no se
  bloquea a sí misma ni por su propio evento), crea el evento nuevo → `updateMany` condicional
  (`isCancelled: false`) → borra el viejo (best-effort) → `programarMensajesAlCliente({
  confirmacion: false })` para el recordatorio de la hora nueva (el de la vieja se descarta
  solo por `HORA_CAMBIADA`); pone `confirmedByClientAt` a null. `cancelar_cita` usa
  `cancelarReserva` con `cancelledBy: "owner_chat"`, que **no manda el aviso #4 al propio
  dueño** y avisa a la lista de espera con origen `cancelacion_dueno`.
- **«¿Le mando la confirmación?» / «¿Le aviso?»**: `ResultadoDeEjecucion` gana `siguiente`
  (`{ tipo, parametros, resumen, pregunta, botones }`). Tras el «Hecho», el enrutador
  (`preguntarTrasAccion`) registra esa propuesta con `registrarPropuesta` (pasa por `comprobar`
  de `avisar_cliente`: móvil, número de Alhabla en el negocio, sin STOP, tipo coherente con el
  estado de la cita) y manda la pregunta como interactivo con los mismos ids
  `accion:<id>:confirmar|cancelar` y otros títulos («Sí, mándasela» · «No»; «Sí, avísale» ·
  «Le llamo yo»); si no se puede proponer, el turno de seguimiento del Gestor sigue como
  siempre. Un «No» a esa pregunta responde `avisoAlClienteDescartado` y no abre turno (no es
  una propuesta que rehacer). `avisar_cliente.ejecutar` marca `smsConsent: true` (el dueño
  responde del número y autoriza) y `clientPhone` si viene otro, y encola: `confirmacion` ⇒
  `programarMensajesAlCliente` (confirmación + recordatorio); `cambio` / `cancelacion` ⇒
  `programarAvisoAlCliente` (nueva: una tarea por petición, la cancelación solo sobre una
  reserva ya cancelada). Propósitos nuevos en `mensajesCliente.ts` y `jobTypes.ts`:
  `cambio` (plantilla `cambio_cita_cliente`, 4 parámetros con la hora nueva) y `cancelacion`
  (`cancelacion_cita_cliente`, 3), ambas sin v2 ni variable de entorno; el job admite la
  reserva cancelada para `cancelacion` (`RESERVA_ACTIVA` si no lo está) y anota
  `clientNotifiedAt`. Las dos plantillas siguen `PENDING` en Meta (#103): hasta que se aprueben
  el job las descarta con `SIN_PLANTILLA`. El botón «No me va bien» del cliente (fase 1) ya
  avisa al dueño por la vía del recado (`avisarRecado`, con el móvil del cliente y «quiere que
  le llamen»).
- **Ausencias**: tabla nueva `ProfessionalAbsence` (`professional_absences`: `businessId`,
  `professionalId`, `startsAt`/`endsAt` UTC, `reason`, `createdVia`; migración
  `20260921090000_ausencias_profesionales`, solo añade). `checkAvailability` las carga por
  negocio en la misma ventana que las reservas y las mete como ocupación con `ausencia: true`:
  **ocupan a su profesional, no restan plazas** (`maxConcurrentBookings` las salta) y no cuentan
  para la carga del día. `get_catalog` (voz y chat) dice cuándo no está cada uno («no está del
  5 al 7 de octubre», 60 días vista) y `listar_agenda` devuelve `ausencias` del día
  (recortadas: «todo el día»). `marcar_ausencia`: días enteros si no hay horas, hasta 62
  días, sin solapes con otra ausencia de la misma persona, y avisa de las citas ya reservadas
  en el tramo («no se mueven solas»; el prompt ofrece moverlas o cancelarlas una a una).
- **Bloqueos no son tabla**: `bloquear_franja` escribe una excepción del horario con horario
  especial (`restarTramo` quita `[desde, hasta)` de los tramos del día; si no queda nada,
  `closed`), lo que `checkBusinessHours`, `get_catalog`, el panel (`business-hours-editor`) y
  la sincronización de la recepcionista ya entienden; `ScheduleBlock` del plan queda
  descartado por redundante. Tope de 3 tramos abiertos por día (límite del esquema).
- Tool nueva `buscar_hueco` (`modules/gestor/buscarHueco.ts`): la misma disponibilidad que la
  recepcionista para «¿tiene hueco Laura el jueves a las 10?», con `huecoMasCercano.fechaHora`
  ya en formato local para pasarlo a `añadir_cita`. Prompt: bloque «## Agenda» (proponer
  `añadir_cita` directamente y ofrecer la alternativa que devuelva; localizar por
  `listar_agenda`; escribir el móvil del cliente en la propuesta de mover/cancelar; no
  preguntar «¿le aviso?» porque lo hace el sistema; ausencias vs. cierres).
- Probado en vivo en dev (túnel, negocio de prueba desechable creado por `/auth/register`):
  `buscar_hueco` («sí, Laura tiene libre mañana a las 17:00»), «Laura no viene el viernes» →
  ausencia (fila UTC correcta) → «¿tiene hueco Laura el viernes a las 10?» → «no, el más
  cercano es el sábado a las 09:30»; «este sábado cerramos por la tarde» → excepción
  09:30-14:00; cancelar dos citas sembradas → «Hecho» + pregunta con botones → «Le llamo yo»
  cierra sin turno; «Sí, avísale» sin número de Alhabla → «no he podido» (ahora se comprueba
  antes de preguntar); «vacaciones del 5 al 9 de octubre» → cinco excepciones; `listar_agenda`
  del viernes cuenta la ausencia. **`añadir_cita` y `mover_cita` no se pudieron probar en
  vivo**: la única conexión de Google en la BD de dev no descifra con la
  `CALENDAR_CREDENTIALS_KEY` de `.env` (la creó otro proceso con otra clave) y el OAuth no se
  puede hacer por script; el Gestor respondió correctamente «el calendario necesita volver a
  conectarse». Quedan cubiertos por tests unitarios (evento, transacción, deshacer, `excluir`).

**Código (fase 2, PR 5 — el Gestor en el panel y tests de integración, 2026-09-20).**
- `modules/gestor/panel.ts` + rutas en `modules/whatsapp/routes.ts`: `GET /business/me/gestor`
  (estado: `disponible` = interruptor global + assistant, `activoEnNegocio` =
  `ownerChatEnabled`, `whatsapp` = estado del móvil; historial de la conversación de Telnyx
  limpio —sin marcadores, sin turnos sintéticos «(El dueño ha pulsado…)» ni sus «Listo.», del
  más viejo al más nuevo, 60 como mucho— y la propuesta pendiente con sus títulos de botón),
  `POST /business/me/gestor/mensajes` (`{ texto }`, 30 por 10 min) y
  `POST /business/me/gestor/acciones/:accionId` (`{ decision }`). Mismo Gestor, **misma
  conversación de Telnyx** y mismo registro de propuestas que por WhatsApp: `chatDueno.ts ›
  turnoDelGestor` es la parte sin canal (contador diario, lock del hilo, conversación, marcador,
  `chatWithAssistant`, propuesta del turno) que ahora comparten `conversarConGestor` (WhatsApp)
  y el panel. El panel **no exige WhatsApp dado de alta** (el JWT ya dice quién es); la
  conversación se abre con `owner_phone: "panel"` si no hay móvil. `inboundMessageId` de las
  propuestas del panel es `panel:<uuid>`. `decidirEnElPanel` hace lo que `botonDeAccion` en el
  enrutador: `decidirPropuesta` → nota en la conversación («desde el panel») → pregunta
  `siguiente` registrada y devuelta con sus botones, o turno de seguimiento
  (`TEXTO_DE_SEGUIMIENTO`, compartido) cuya respuesta vuelve como `seguimiento` (null si
  «Listo.») y cuya propuesta, si la hay, también; «No» a la pregunta de avisar responde
  `avisoAlClienteDescartado` sin turno. Errores con `code` (`limite` 429, `ocupado` 409,
  `sin_respuesta` 502, resto 403; propuestas `no_encontrada` 404, caducada/decidida 409).
- `PATCH /business/me` acepta `ownerChatEnabled` y `clientChatEnabled` (booleanos).
- Panel: página `/gestor` («Tu Gestor», badge Beta, entrada «Gestor» bajo Recepcionista en la
  barra lateral y en «Más» en móvil: la barra inferior tiene cinco huecos justos) con
  `components/gestor-chat.tsx` (historial, burbujas, propuesta con sus dos botones, ejemplos
  para empezar, Enter envía, invalida `my-business`/`booking-settings`/`agenda` tras un botón);
  Ajustes › Teléfono › Tu móvil gana el bloque «Conversaciones · Beta» con los dos interruptores
  (guardado al instante por el PATCH; se enseñan aunque no haya móvil, porque el Gestor
  también va por el panel). «Beta» solo aquí, nunca en un mensaje de WhatsApp.
- Tests de integración de la fase 2 (`tests/integration/gestor/agenda.test.ts`, Postgres/Redis
  reales, calendario/WhatsApp/LLM sustituidos): `añadir_cita` (Call sintética + Booking en
  transacción, nombres resueltos a ids, segundo toque `ya_decidida`), `mover_cita` (evento nuevo,
  reserva actualizada, evento viejo borrado, **no se bloquea a sí misma** con capacidad 1),
  `cancelar_cita` como `owner_chat` sin aviso #4, `marcar_ausencia` que `checkAvailability`
  real respeta sin restar plazas, `bloquear_franja` que deja el día con horario especial, y el
  panel de punta a punta (turno con `proponer_accion` real vía `handleGestorToolInvocation` con
  el turno en Redis → propuesta devuelta → botón → ausencia guardada → nota en la
  conversación; negocio apagado; propuesta de otro negocio `no_encontrada`). `resetDb` limpia
  las tablas nuevas de la fase 2.
- Probado en vivo en dev con el frontend de la rama contra un backend de la rama y el túnel:
  «Laura no viene el viernes» → propuesta con botones en la página → Confirmar → «Hecho» →
  «¿tiene hueco Laura el viernes a las 10?» → «no; el más cercano es el lunes 28 a las 09:30»
  (sábado cerrado); el interruptor del Gestor en Ajustes apaga la página con enlace de vuelta.

**Cuenta.** Un solo WABA, «Alhabla»: id Telnyx `804230d2-c5e0-45dd-af65-95819468378a`, id Meta
`1628104425601770`, conectado por Embedded Signup el 13-09. `messaging_limit_tier: TIER_250`
(250 destinatarios únicos/24 h para **toda** la cartera), `business_verification_status:
pending_submission` (issue #103: hasta verificar la empresa el remitente se ve como número
pelado, el techo es 250 y el WABA admite **2 números**). `account_review_status: APPROVED`.
**Bug del SDK 7.21 en `client.whatsapp.*`**: el cliente normal tiene `baseURL`
`https://api.telnyx.com/v2` y esos recursos ya llevan `/v2/` en la ruta, así que toda llamada
(`businessAccounts.list`, `phoneNumbers.list`, `templates.list`, `retrieveConversationWindow`,
perfil…) va a `/v2/v2/whatsapp/…` y devuelve `404 10005`. Solución en
`lib/telnyx.ts`: `getTelnyxWhatsappClient()`, un segundo cliente con `baseURL:
"https://api.telnyx.com"` solo para `whatsapp.*` (el envío, `messages.whatsapp`, usa la ruta
correcta y va por el cliente normal). Con eso el SDK sirve para todo; `whatsappMessageTemplates
.retrieve` sigue dando 404 (ese endpoint no existe). El filtro de `templates.list` es `waba_id`
(el tipo del SDK dice `filter[waba_id]`, que devuelve cero).

**Números en el WABA — uno por audiencia** (decisión del 19-09 por la noche; son los dos que
admite el WABA hasta #103, y el `to` del mensaje entrante ya dice si escribe un dueño o un
cliente).

| Número | Estado en el WABA | Nombre visible | Uso |
|---|---|---|---|
| +34930453218 (`WHATSAPP_TELNYX_FROM_NUMBER`) | `CONNECTED`, calidad `GREEN`, nombre `PENDING_REVIEW` | «Alhabla» | **Negocios**: avisos al dueño, recados, Gestor. También respaldo |
| +34930454394 (id Telnyx `3052564312288658571`, `phone_number_id` Meta `1305416552659363`) | `CONNECTED` desde el 19-09 a las 23:14 (dado de alta desde el portal de Telnyx tras borrarlo del WABA, ver abajo); calidad `UNKNOWN` hasta que envíe volumen | «Alhabla Reservas» (perfil actualizado; el nombre del número aún figura «Alhabla» a la espera de la revisión de Meta) | **Clientes**: confirmación, recordatorio, chat con la recepcionista |

**Cómo se da de alta un número en el WABA (aprendido el 19-09).** Desde el **portal de Telnyx**
(*Messaging → WhatsApp → Add phone number*, Embedded Signup): en la ventana de Meta se pone el
número, el nombre visible y la verificación **por llamada** (los fijos no reciben SMS; el desvío
de voz la lleva al móvil del usuario), y Telnyx hace el registro en Cloud API → `CONNECTED`.
Lo que **no** funciona: (1) añadirlo y verificarlo en WhatsApp Manager de Meta deja el número
verificado en Meta pero sin registrar por Telnyx (`PENDING`, `platform_type: NOT_APPLICABLE`),
y Meta ya no emite otro código (`initializeVerification` → `10007 … Phone number already
verified`, `resendVerification` → `10015 Verification not initialized`); (2)
`initializeVerification` con un número que no está en el WABA → `404 10005 Phone number not
found`: **ese endpoint no añade números**, solo pide el código de uno ya presente. `DELETE
/v2/whatsapp/phone_numbers/{n}` sí lo quita del WABA (también en Meta). Plan B documentado:
añadirlo en WhatsApp Manager **sin** verificar allí y completar por API.

**Cinco números comprados el 2026-09-19** (locales de Barcelona con
`TELNYX_SPAIN_REQUIREMENT_GROUP_ID`, 1 $ + 1 $/mes, `active` en Telnyx; comprados **de uno en
uno** porque la cuenta recarga por goteo y un pedido de cinco a la vez —10 $— fue rechazado con
`20100 Insufficient Funds`). Se compraron como «uno por sector»; esa misma noche la decisión
pasó a «uno por audiencia»: el de `peluqueria` es ahora el de clientes y los otros cuatro
quedan **en reserva hasta #103** (tope de 2 números por WABA). Todos con `customer_reference alhabla-whatsapp-<sector>`, tags
`env-prod` + `whatsapp-sector` + `sector-<tipo>`, y **desvío de voz permanente**
(`PATCH /v2/phone_numbers/{id}/voice` → `call_forwarding { call_forwarding_enabled: true,
forwarding_type: "always", forwards_to: "+34692138456" }`) para que la llamada de verificación
de Meta (los números españoles no reciben SMS) suene en el móvil del usuario.

| Sector (`businessType`) | Número | Id en Telnyx |
|---|---|---|
| `peluqueria` | +34930454394 | `3052564312288658571` |
| `barberia` | +34930454372 | `3052564335894201490` |
| `salon-de-unas` | +34930454382 | `3052564355263497366` |
| `centro-de-estetica` | +34930454375 | `3052565552728900934` |
| `fisioterapia` | +34930454393 | `3052565576250557770` |

Verificación por API de un número **que ya está en el WABA**: `client.whatsapp.businessAccounts
.phoneNumbers.initializeVerification(wabaId, { phone_number, display_name, language: "es_ES",
verification_method: "voice" })` → `client.whatsapp.phoneNumbers.verify(number, { code })`
(y `resendVerification`); renombrar: `PATCH /v2/whatsapp/phone_numbers/{n}/profile` con
`display_name` (queda `display_name_status: PENDING_REVIEW`). Perfil por número: `client.whatsapp.phoneNumbers.profile.update(number,
{ about, description, email, website, category })` y `profile.photo.upload(number, { file })`.
Menú nativo por número (*ice breakers* ≤ 4 y comandos que WhatsApp muestra al escribir `/`):
`client.whatsapp.phoneNumbers.conversationalComponents.patchAll(number, { ice_breakers,
commands: [{ command, description }] })`. El número de plataforma ya tiene perfil («Gestionamos
tus reservas», `PROF_SERVICES`); los *ice breakers* y comandos se probaron y **se retiraron**
del número de producción hasta que exista el enrutador (un cliente real los vería sin que nadie
responda). El plan los reparte por audiencia (clientes en «Alhabla Reservas», dueño y comandos
en «Alhabla»).

**Envío.** `POST /v2/messages/whatsapp` — en el SDK es `client.messages.whatsapp(...)` (**no**
`sendWhatsapp`, digan lo que digan las skills). `messaging_profile_id` es **obligatorio**
(`TELNYX_MESSAGING_PROFILE_ID`; sin él, `40305 Invalid 'from' address`), porque el número español
no puede estar asignado a ningún perfil (`40323`, reconfirmado). **Plantillas: enviar siempre por `template_id`**, no por `name` + `language`: con
`language.code: "es_ES"` Meta devuelve `40008 Undeliverable` («recipient carrier did not accept»)
desde cualquier número aunque la plantilla esté `APPROVED`, y la misma plantilla por `template_id`
se entrega (verificado el 19-09 con `confirmacion_cita` `es_ES` `01a0a982-…`). Por nombre solo
funciona con `es` (lo que usa producción hoy vía `WHATSAPP_TEMPLATE_LANGUAGE=es`).
`whatsapp_message.type` ∈
`template | text | interactive | contacts | location | reaction | image | …`;
`biz_opaque_callback_data` vuelve en todos los estados. Texto, interactivos y `contacts` (vCard)
**solo dentro de la ventana de 24 h**; fuera, plantilla. La ventana se consulta a Telnyx:
`GET /v2/whatsapp/phone_numbers/{remitente}/conversation_window?destination_number=…` →
`window_active`, `window_expires_at`, `last_user_message_at` (un toque de botón la renueva).
Botones interactivos: `interactive.type: "button"` con hasta 3 `{ type: "reply", reply: { id,
title } }`; también `list` y `cta_url`. El SDK tipa los parámetros de plantilla como
posicionales y sin `payload` de `quick_reply`: para parámetros **nombrados** (los que usan
todas nuestras plantillas) el adaptador sigue con `fetch`.

**Costes reales en España** (MDR `GET /v2/messages`, campos `billing_type`, `rate`,
`carrier_fee`, `cost`, en USD; medidos el 19-09): plantilla de utilidad `whatsapp_utility` =
0,004 $ de Telnyx + 0,020 $ de tasa de Meta = **0,024 $**; mensaje libre dentro de la ventana
`whatsapp_service` = **0,004 $** (sin tasa de Meta). Los mensajes del usuario no se cobran. Una
reserva (confirmación al cliente + aviso al negocio) ≈ 0,05 $; mantener la ventana abierta con
botones sale seis veces más barato que reabrirla con plantilla.

**Plantillas** (`GET/POST /v2/whatsapp/message_templates`; `client.whatsapp.templates
.list/create` con el cliente de `getTelnyxWhatsappClient()`). Todas de categoría `UTILITY`, idioma
`es`, `parameter_format: "NAMED"` con `example.body_text_named_params` (la API lo acepta aunque
el SDK no lo tipe). Reglas de Meta que rechazan la creación: **el cuerpo no puede empezar ni
terminar con una variable** (`2388299`) y **hay un tope de variables por cantidad de texto**
(`2388293`). Estado el 19-09: `confirmacion_cita` (dos, `es_ES` y `es`), `recordatorio_cita` y
`hora_disponible` (esta última **MARKETING**, sirve de lista de espera provisional) aprobadas;
las doce del plan (`bienvenida_negocio`, `nueva_reserva_negocio`, `recado_negocio`,
`cita_pendiente_negocio`, `cancelacion_negocio`, `alerta_operativa_negocio`, `cierre_del_dia`,
`confirmacion_cita_v2`, `recordatorio_cita_v2`, `cambio_cita_cliente`,
`cancelacion_cita_cliente`, `hueco_libre`) en `PENDING`; textos definitivos en la tabla de
plantillas de `PLAN-CANAL-DUENO.md`. Los cambios de estado llegan por webhook
(`whatsapp.template.*`) si el WABA está suscrito (abajo).

**Webhooks entrantes (la parte que nadie documenta bien).** Los mensajes entrantes de WhatsApp
**no** van por perfil de mensajería: los entrega el **webhook del WABA**, configurado con
`PATCH /v2/whatsapp/business_accounts/{id}/settings` → `webhook_url`, `webhook_enabled` y
`webhook_events` con los **nombres de campo de webhook de Meta** (la API acepta cualquier
cadena sin validar): hoy `messages`, `message_template_status_update`,
`template_category_update`, `phone_number_quality_update`, `phone_number_name_update`,
`account_update`, `account_review_update`, apuntando a `https://api.alhabla.ai/webhooks/telnyx`.
**Sin `messages` en la lista, los entrantes se pierden en silencio** (ni MDR ni webhook) aunque
Meta los cuente. El evento es **`whatsapp.messages`** (no `message.received`), firmado con la
misma Ed25519 que los de voz, y `/webhooks/telnyx` hoy lo acepta y lo descarta como "no
procesable" (200). Payload en formato Meta:

- `payload.contacts[]`: `profile.name`, `wa_id`. `payload.metadata`: `display_phone_number` (el
  número de sector que recibe, sin `+`), `phone_number_id`.
- `payload.messages[]`: `id` (UUID de Telnyx), `foreign_id` (`wamid…`), `from` (E.164),
  `from_user_id`, `timestamp` (epoch en segundos), `type` y su objeto: `text.body`;
  `interactive` con `interactive.type: "button_reply"`, `button_reply.{id,title}` **y
  `context.id` = el id del mensaje saliente al que responde** (el mismo que devolvió el envío:
  correlación directa con `SentMessage`); `audio` con `audio.url` en almacenamiento de Telnyx
  **`us-central-1`**, `mime_type`, `voice: true` (residencia UE: #13-16).
- `payload.statuses[]` (mismo evento, sin `messages`): `id` = nuestro id de mensaje, `status`
  `sent | delivered | read`, `biz_opaque_callback_data`.

Por el webhook **por mensaje** (`webhook_url` en el envío) o el del **perfil de mensajería**
(`TELNYX_MESSAGING_PROFILE_ID`, hoy a producción) llegan además los clásicos `message.sent` →
`message.finalized` (`to[0].status: delivered`) → **`message.read`**, con el `body` del mensaje
ecoado y `messaging_profile_id`. `cost.amount` venía `null` en las pruebas.

**AI Assistants por chat y post-conversación (verificado 2026-09-19, fase 0.4-0.6).**
`POST /v2/ai/assistants/{id}/chat` (`client.ai.assistants.chat`, Beta) ejecuta las *shared
tools* del assistant (`tool_ids`) firmando con la Ed25519 de siempre; 1,6-3,7 s por turno con
`gpt-5.6-luna`. La conversación la crea Alhabla (`POST /v2/ai/conversations` con `metadata`;
la respuesta viene envuelta en `data`) y **sus claves de `metadata` resuelven como variables
dinámicas en las cabeceras de las tools** (`{{business_id}}`), mientras que
`{{conversation_id}}`, `{{telnyx_end_user_target}}` y `{{telnyx_current_time}}` llegan
literales; `telnyx_conversation_channel` es `web_chat`. Contexto por conversación:
`PUT /v2/ai/conversations/{id}` con `system_prompt`, o `POST …/message` con `role: "system"`.
`post_conversation_settings.enabled` + un bloque "Al terminar la llamada" en las
instrucciones dispara la tool **~1 s después de colgar, pero dos veces por llamada y a veces
con contenido distinto**: idempotencia obligatoria. `dynamic_variables_webhook_url` recibe
`assistant.initialization` con `telnyx_conversation_id`, `call_control_id`, `from`/`to`,
`telnyx_end_user_target`, canal; devolviendo `memory.conversation_query` acotada a
`assistant_id` y al número, la siguiente llamada recuerda la anterior (verificado). Los
assistants se borran en *soft delete*; una *shared tool* usada por uno borrado no se puede
eliminar (`10015`).

**Otros datos útiles.** Los MDR (`GET /v2/detail_records?filter[record_type]=messaging`) solo
registran salientes (hay entregas reales de WhatsApp al móvil del usuario desde el 15-09); los
entrantes no aparecen ahí. Precio de modelos y catálogo: `GET /v2/ai/models` (ver plan). Desde
el Mac del usuario no se llega por HTTP a los hosts de `alhabla.ai` proxied por Cloudflare
(`dev-api.alhabla.ai`, `alhabla.ai`), aunque desde internet responden: probar con
`web_fetch`/otro equipo, no con `curl` local.

## Stripe Billing Fields on `Business`

```
stripeCustomerId (unique)
stripeSubscriptionId (unique)
stripePriceId
subscriptionStatus (enum SubscriptionStatus)
subscriptionCurrentPeriodStart / End
subscriptionTrialEnd
subscriptionCancelAtPeriodEnd (boolean)
```

### Phone Number Fields on `Business`

`phoneNumberStatus` is the number's lifecycle-status field
(`"pending" | "purchased" | "active" | "failed"`).

```
phoneNumberStatus (default "pending")

# Telnyx — active provider
telnyxNumberOrderId (unique)   # persisted as soon as the order is placed,
                                # since Telnyx orders are async; lets a retry
                                # resume the same order instead of buying twice
telnyxPhoneNumber (unique)
telnyxPhoneNumberId (unique)
telnyxPhoneNumberPurchasedAt

# Retell (either provider)
retellPhoneNumberId (unique)   # persisted since 2026-09-06 on import:
                                # phone_number_id when the SDK returns it,
                                # falling back to the phone number itself
                                # (phone/service.ts); also served in the phone
                                # status response. retellPhoneNumber is canonical
retellPhoneNumber (unique)
```

### `CalendarConnection` (desde 2026-09-18) y campos de calendario en `Business`

```
CalendarConnection  (@@map "calendar_connections", @@unique [businessId, provider])
  businessId, provider ("google" | "outlook" | "caldav"; String, no enum)
  calendarId      String?   // null = aún no elegido (Outlook y CalDAV tras el alta); Google usa
                            //   "primary"; en CalDAV es la URL absoluta del calendario
  credentials     Json?     // misma forma que CalendarCredentials ({ provider, refreshToken } en
                            //   OAuth; { provider, serverUrl, username, appPassword } en CalDAV);
                            //   null = revocadas
  connected       Boolean   @default(false)
  disconnectedAt  DateTime?
  lastError       String?
  accountEmail    String?   // Outlook (cuenta de Graph) y CalDAV (el Apple ID)
```

Una fila por negocio y proveedor; **`Business.calendarProvider` es el único campo de calendario
que queda en `Business`** (puntero al proveedor activo). Todo pasa por `modules/calendar/conexion.ts`.

**Credenciales cifradas en reposo (desde 2026-09-18):** `credentials` es siempre un sobre AES-256-GCM
(`{ v: 1, alg, iv, tag, data }`, `lib/cifradoDeCredenciales.ts`) con la clave `CALENDAR_CREDENTIALS_KEY`
(32 bytes en base64; Secret Manager en producción, `.env` en dev). Solo `conexion.ts` cifra/descifra. Sin
clave **el servidor no arranca** (`server.ts`): Cloud Run deja la revisión anterior sirviendo, que es mejor
que fallar en cada llamada de voz. Un sobre que no descifra (otra clave, fila manipulada) cuenta como "sin
credenciales" → RECONNECT + `console.error`. Transitoriamente se aceptan filas en claro con un `console.warn`;
`scripts/cifrarCredencialesCalendario.ts` (idempotente, `--dry-run`) las recifra tras el despliegue. Como
no se puede buscar por valor de token, `persistirCredencialesRotadas` exige `businessId` (los wrappers
`@deprecated` sin él avisan y no persisten). **Si se pierde la clave, todos los negocios tienen que
reconectar su calendario.**

**El contrato con el frontend no cambió:** `GET/PATCH /business/me`, `POST /calendar/select` y
`POST /calendar/auth/microsoft/connect` siguen devolviendo `googleCalendarId`, `googleCalendarConnected`,
`googleCalendarDisconnectedAt`, `googleCalendarLastError`, sus equivalentes `outlook*` y `outlookUserEmail`
— pero ahora los **calcula `serializarBusiness()`** desde las filas (`camposDeCalendarioParaElPanel`),
que además quita `calendarConnections` (lleva las credenciales). Es la única manera correcta de devolver
un `Business` al cliente; las rutas cargan las filas con `INCLUDE_CONEXIONES`. Fijado en
`tests/modules/businesses/me.test.ts`.

Historial (expand/contract, porque `cloudbuild.yaml` migra antes del cambio de tráfico y la revisión
anterior sigue sirviendo unos minutos contra el schema nuevo): PR #77 creó la tabla con backfill y
escribía las columnas antiguas en espejo; PR #78 retiró el espejo y las columnas del schema Prisma
(el cliente ya no las selecciona) sin borrarlas de la BD; y, una vez desplegado ese código, la migración
`20260918100000_drop_legacy_calendar_columns` las borró. Receta reutilizable para cualquier columna que
haya que quitar: (1) dejar de leerla/escribirla y sacarla del schema, desplegar; (2) `DROP COLUMN` en
el PR siguiente.

### Orchestrator Field on `Business`

```
orchestrator (String, default "retell")
```

Determines the voice-AI provider for the business — `"retell"` or `"telnyx"`. `detectVoiceOrchestrator()` (`backend/src/lib/voiceOrchestrator.ts`) still returns `"retell"` for every registration, **but that is no longer the value the business ends up with**: since 2026-09-13, when `VOICE_TELNYX_ROLLOUT` is on (anything but `off`; dev runs `all`), `createBusinessAgent` auto-promotes the business to `"telnyx"` as soon as its Telnyx assistant really exists (`agentBootstrap.ts`, "Auto-promoción a Telnyx-primary"). The manual cutover script (`scripts/cutoverToTelnyx.ts`, PLAN-TELNYX-ORQUESTADOR.md) is only for businesses created before that. **In practice every business in dev and in production is `telnyx`-primary**, so a change that only reaches Retell reaches nothing that answers a real call. The value is stored in `Business.orchestrator`.

### Business Type Field on `Business`

```
businessType (String, default "other")
```

Stores the business niche selected during registration. Used to label agents and to drive per-niche agent templates in `agentBootstrap.ts`.

Run migrations in dev with `npm run prisma:migrate`. In production, generate the client before starting (`prisma generate`).

**Migrando contra el contenedor `alhabla_backend_dev` (no interactivo):** `prisma migrate dev`
falla ahí con "non-interactive environment not supported". Usa en su lugar
`docker exec alhabla_backend_dev npx prisma migrate dev --name <nombre> --create-only`
(genera el SQL sin aplicarlo ni pedir confirmación) seguido de
`docker exec alhabla_backend_dev npx prisma migrate deploy`. Tras aplicar la
migración, **reinicia el contenedor** (`docker restart alhabla_backend_dev`):
el proceso `tsx watch` lleva en memoria el `@prisma/client` que se cargó al
arrancar, y `prisma generate` solo reescribe los archivos en disco — sin
reiniciar el proceso, las queries siguen viendo el schema viejo (columnas
nuevas ausentes, 500s en rutas que las usan) aunque la migración ya esté
aplicada en la base de datos. Esto es un artefacto exclusivo de tener un
proceso Node de larga duración en dev (`docker-compose.yml` lo arranca con
`sh -c "npx prisma generate && npm run dev"`, una sola vez); **no ocurre en
producción** — cada deploy construye una imagen nueva (`prisma generate` en
el build, ver Dockerfile stage `builder`) y `cloudbuild.yaml` aplica
`prisma migrate deploy` contra Cloud SQL *antes* de que `gcloud run deploy`
publique esa imagen, así que el proceso que sirve tráfico siempre arranca ya
con el cliente y el esquema en el mismo commit — nunca hay un proceso vivo
con un cliente desactualizado que sobreviva a una migración. **Matiz:** lo
contrario sí ocurre — entre `migrate deploy` y el cambio de tráfico (minutos
de build), la revisión *anterior* sirve contra el schema *nuevo*. Las
migraciones aditivas no le afectan; **borrar o renombrar una columna que esa
revisión todavía lee da 500 durante esa ventana**. Por eso los cambios
destructivos van en dos PR (expand/contract), como `CalendarConnection`.

## Background Jobs (Cloud Tasks)

Migrated 2026-09-03 from BullMQ (Redis-backed workers, needed an always-on
`alhabla-worker` Cloud Run service to avoid CPU throttling starving the
workers) to **Cloud Tasks**: each job is dispatched as an HTTP POST to
`POST /internal/jobs/<name>` on `alhabla-api` itself, so Cloud Run only
allocates CPU while that request is being processed — no separate always-on
service needed. Zombie call cleanup (previously a BullMQ repeatable job)
is now a **Cloud Scheduler** job hitting the same kind of endpoint every
15 minutes.

- **Enqueueing** (`backend/src/lib/cloudTasks.ts`): `enqueueRecordingJob`,
  `enqueueRetryBookingJob`, `enqueueEmailJob`. In production
  (`NODE_ENV=production`) these create a real Cloud Tasks task via
  `@google-cloud/tasks`, targeting `INTERNAL_JOBS_BASE_URL` with an OIDC
  token for `CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`. **Outside production
  (dev/local/tests) the job runs inline, synchronously, in the same
  process that enqueued it** — there is no real queue in dev, since that
  would require live GCP credentials and a stable public URL for Cloud
  Tasks to push to. Tests mock `lib/cloudTasks.js` directly so this inline
  fallback never actually runs during `vitest`.
- **Receiving** (`backend/src/modules/internal/routes.ts`, prefix
  `/internal`): `POST /internal/jobs/process-recording`,
  `/retry-failed-booking`, `/send-email`, `/send-sms`, `/send-whatsapp`,
  `/cleanup-zombie-calls`, `/retry-stuck-recordings`, `/purge-old-recordings`,
  `/send-weekly-summaries`, `/report-usage`, `/retry-usage-reports`,
  `/attach-usage-prices`, `/suspend-overdue-calls`, `/telnyx-health-check`,
  `/telnyx-reconciler`, `/recordar-desvio-sin-comprobar`. Gated by
  `fastify.verifyCloudTasks` (`backend/src/plugins/internalAuth.ts`), which
  verifies the request carries a Google-signed OIDC token issued to
  `CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT` with the right audience — anyone
  else gets 401/403. A non-2xx response makes Cloud Tasks/Scheduler retry
  per that queue/job's own retry config.
- **Job logic** lives in plain async functions with no framework coupling —
  `jobs/processRecording.ts` (`processRecordingJob`), `jobs/retryFailedBooking.ts`
  (`processRetryFailedBookingJob`), `jobs/sendEmail.ts` (`processSendEmailJob`),
  `jobs/sendSms.ts` (`processSendSmsJob`), `jobs/cleanupZombieCalls.ts`
  (`cleanupZombieCallsJob`) — called directly both by the `/internal/jobs/*`
  route handlers and by the dev inline fallback in `cloudTasks.ts`.

1. **`process-recording`**
   - Downloads the call recording from Retell or Telnyx and uploads it to R2.
   - Updates `Recording` with `storageKey` and `storageUrl`.
   - Cloud Tasks queue `process-recording`: 5 attempts, exponential backoff 1s base.
   - **Expired URLs (2026-09-17):** Telnyx's `recording_urls` are S3 presigned links
     valid for **10 minutes**. If the first attempt misses that window, a plain retry
     against the stored URL can only get `403`. On a 4xx download (400/403/404/410)
     the job now asks Telnyx for a fresh URL via
     `telnyxAiAdapter.listRecordingsByCallLegId(Recording.providerLegId)` and
     downloads again; rows from before this change have no `providerLegId`, so it is
     recovered from the S3 path (`…/<call_leg_id>-<n>.wav`) and persisted. If there is
     nothing to ask (Retell call, no leg, Telnyx no longer has it) the row is marked
     `processingFailedAt`/`processingError` and the job throws `PermanentJobError`
     (route answers 200, task leaves the queue). 5xx/network errors still propagate so
     Cloud Tasks retries. Background: ~50 simulation-battery recordings from 14–16 Sep
     looped every 15 min for two days (~8,000 failing requests/day) before this.
   - `filter[call_control_id]` on `GET /v2/recordings` is documented by the SDK but
     **ignored by the API** (returns an empty list — verified against the live account
     2026-09-17). Only `call_leg_id`/`call_session_id` filters work; the adapter no
     longer exposes a by-call-control-id lookup.

2. **`retry-failed-booking`**
   - Retries a `book_appointment` that failed during a live call for a probably-transient reason (`BOOK_APPOINTMENT_FAILED`, `CALENDAR_TIMEOUT`, `CALENDAR_RATE_LIMITED`, or an unclassified error) — enqueued by `capturePendingBookingLead`/`enqueueRetryFailedBooking` in `voiceTools/service.ts`. Not enqueued for `*_RECONNECT_REQUIRED` failures, since retrying doesn't help until the business reconnects the calendar manually.
   - Loads the pending booking from the `Lead` row (`type: "pending_booking"`) by `leadId`, re-fetches the business's calendar tokens fresh (never trusts stale tokens from the original failed attempt), calls `calendarService.bookAppointment()` again, and on success creates the `Booking` row and sets `Lead.resolvedAt`.
   - Cloud Tasks queue `retry-failed-booking`: 4 attempts, exponential backoff 30s base (the caller already hung up — there's no live request waiting, so a few minutes of backoff is fine).
   - No customer-facing notification exists yet when a retry succeeds in the background — it only becomes visible via the dashboard.

3. **`send-email`** (`backend/src/lib/zohoMail.ts`, `backend/src/lib/emailTemplates.ts`)
   - Sends the welcome email (`checkout.session.completed`, from `welcome@alhabla.ai`) and the payment-failed email (`invoice.payment_failed`, from `support@alhabla.ai`) — see `billing/service.ts`. Both are Zoho Mail aliases of one authenticated account; sending goes through Zoho Mail's REST API (OAuth 2.0, refresh token) rather than SMTP.
   - Cloud Tasks queue `send-email`: 4 attempts, exponential backoff 5s base.

4. **`send-sms`** (`backend/src/adapters/telnyx/TelnyxAdapter.ts` — `sendSms`)
   - Notifies the business owner by SMS (`business.phone`) right after a successful `book_appointment`, using the business's own Telnyx voice number (`business.telnyxPhoneNumber`) as the sender — enqueued from `voiceTools/service.ts`, never blocks or fails the booking itself (wrapped in try/catch). Skipped entirely if the business has no Telnyx number yet.
   - Cloud Tasks queue `send-sms`: 4 attempts, exponential backoff 5s base (same as `send-email`).
   - **Known blocker, root cause confirmed (2026-09-12): Spanish geographic long-codes are structurally not messaging-capable, and never will be.** Telnyx returns `40323 "Messaging activation failed"` when assigning any Spanish long-code number (voice or newly purchased) to a Messaging Profile — confirmed via API, the Telnyx dashboard, Telnyx's own error documentation ("not all phone numbers are messaging-capable... you will receive a 40323 error"), and independent research (Kimi, 2026-09-12): Telnyx's country coverage for SMS-capable markets never lists Spain for geographic numbers, this matches every other provider (e.g. Twilio's equivalent `21614`), and Spanish anti-fraud regulation (Orden TDF/149/2025 art. 7.1) additionally blocks any SMS entering via international interconnection with a Spanish numeric sender — so even a hypothetically-activated number would have its messages intercepted. This is not fixable by escalating to support or waiting; stop trying to activate messaging on `business.telnyxPhoneNumber`.
   - Spanish mobile numbers (6xx/7xx) are not an alternative either: Telnyx has no self-service Spanish mobile inventory at all (`GET /available_phone_numbers`, `phone_number_type=mobile`, `country_code=ES` → `10015 "No coverage found"`), independent of the fact that no Requirement Group is required for that combination.
   - **The only supported path is the Alphanumeric Sender ID ("ALHABLA", issue #21).** It's the standard A2P channel for Spain (every major CPaaS — Twilio, Vonage, Sinch, Infobip — pushes the same pattern) and doesn't need any number's messaging activated (`resolveSmsFromAddress()` in `voiceTools/service.ts` already prefers it over `business.telnyxPhoneNumber` once `TELNYX_SMS_SENDER_ID` is set). The Messaging Profile (`Alhabla — Avisos SMS a propietarios`, id in `TELNYX_MESSAGING_PROFILE_ID`) is already configured for this: `whitelisted_destinations: ["ES"]`, `smart_encoding: true`, `webhook_url` pointing at `/webhooks/telnyx` for delivery receipts (arrive as `message.*` events, currently unhandled — logged and ignored, no delivery tracking built yet). Sending with an alphanumeric sender ID requires `messaging_profile_id` on the API call (the SDK enforces this) — wired via `resolveSmsMessagingProfileId()`, only resolves a value when `TELNYX_SMS_SENDER_ID` is set.
   - **Regulatory deadline, separate from Telnyx's own approval:** since 2026-09-15 (CNMC Circular 1/2026, developing Orden TDF/149/2025), every alphanumeric sender must be registered in the CNMC's Alias Registry or operators block it outright. Circular 3/2026 (2026-09-08) transitionally pre-registers aliases *requested* before 2026-09-14 15:00 — confirm with Telnyx (`alpha_sender_id@telnyx.com`) that the "ALHABLA" request was actually filed with the CNMC (not just queued internally at Telnyx) before that cutoff.
   - Client-facing SMS texts (`buildClientConfirmationSmsText`/`buildClientReminderSmsText`) include "para cambiarla o cancelarla, llama al `business.telnyxPhoneNumber`" — the alias is one-way (can't receive replies), so this reuses the existing caller-ID-based `find_my_appointment`/`cancel_appointment` voice tools as the client's management channel instead of building a separate web page.
   - `Business.phone` (the SMS destination) is set to a placeholder (`TEMP-...`) at registration; `PATCH /business/me` accepts `phone` and the owner can set a real number from `/ajustes`.

5. **Zombie call cleanup** (`backend/src/jobs/cleanupZombieCalls.ts`)
   - Cloud Scheduler job `cleanup-zombie-calls`, every 15 minutes, 3 retry attempts.
   - Threshold: **20 minutes** (lowered from 60 on 2026-09-17). The agent hangs
     up on its own at 10 minutes (`maxCallDurationMs`), so anything still
     `IN_PROGRESS` past 20 is a zombie. With the old threshold a dead call
     could stay "in progress" for up to 75 minutes and
     `resolveCallForBusiness`'s fallback heuristic could pick it as "the
     current call" and overwrite another client's booking.
   - The `updateMany` repeats the `status`/`updatedAt` predicate: between the
     find and the write, `call_ended` may have completed the call legitimately.
   - Marks stale `IN_PROGRESS` calls as `TIMED_OUT`.

6. **Stuck recording retry** (`backend/src/jobs/retryStuckRecordings.ts`)
   - `Recording` rows are created (with `externalUrl`, `storageKey: null`) in the same
     transaction that saves the call in `handleCallEnded` — before `enqueueRecordingJob`
     is even called. If that enqueue fails (Cloud Tasks down, IAM misconfigured, etc.),
     the row already exists as a durable marker: this job finds `Recording` rows with
     `storageKey: null` older than 15 minutes and re-enqueues `process-recording` for
     each. Without it, a failed enqueue was permanent — the recording stayed only in
     Retell, subject to its own `dataStorageRetentionDays` window, with nothing to
     recover it.
   - **Cloud Scheduler job `retry-stuck-recordings`** — provisioned in
     `europe-west1` on 2026-09-10, runs every 15 minutes with the same OIDC
     authentication and retry policy as `cleanup-zombie-calls`.
   - Skips rows with `processingFailedAt` set (already declared unrecoverable by
     `process-recording`), and before scanning marks as unrecoverable any un-copied
     recording older than `RECORDING_RETENTION_DAYS` (30): neither Retell nor Telnyx
     keeps the audio beyond that, so re-enqueueing it only produced 403s forever.

7. **Recording purge** (`backend/src/jobs/purgeOldRecordings.ts`) — added 2026-09-17
   - `POST /internal/jobs/purge-old-recordings`. **Needs a Cloud Scheduler job
     to be created** (same OIDC config as `cleanup-zombie-calls`); daily is
     enough:
     ```bash
     gcloud scheduler jobs create http purge-old-recordings \
       --location=europe-west1 --schedule="30 4 * * *" --time-zone="Europe/Madrid" \
       --uri="$INTERNAL_JOBS_BASE_URL/internal/jobs/purge-old-recordings" \
       --http-method=POST --oidc-service-account-email="$CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT" \
       --oidc-token-audience="$INTERNAL_JOBS_BASE_URL"
     ```
   - Deletes the audio from R2 and clears `storageKey`/`storageUrl`/`externalUrl`
     once it is older than `RECORDING_RETENTION_DAYS` (default 30, matching what
     we ask Retell and Telnyx to keep), or 7 days after the panel soft-deleted
     it. The `Recording` row survives so the call history still makes sense.
   - Before this, `DELETE /recordings/:id` only set `deletedAt`: the audio and
     the transcript stayed forever and a GDPR erasure request could not be
     honoured.

8. **Mensaje del día 1 sobre el desvío** («tu desvío está comprobado» o
   «aún no has comprobado el desvío»;
   `backend/src/jobs/recordarDesvioSinComprobar.ts`) — added 2026-09-22,
   PLAN-TELEFONIA-UX.md § 5, fase 5.
   - `POST /internal/jobs/recordar-desvio-sin-comprobar`, pensado para
     ejecutarse **cada hora**. **Needs a Cloud Scheduler job to be created**
     (same OIDC config as `cleanup-zombie-calls`):
     ```bash
     gcloud scheduler jobs create http recordar-desvio-sin-comprobar \
       --location=europe-west1 --schedule="15 * * * *" --time-zone="Europe/Madrid" \
       --uri="$INTERNAL_JOBS_BASE_URL/internal/jobs/recordar-desvio-sin-comprobar" \
       --http-method=POST --oidc-service-account-email="$CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT" \
       --oidc-token-audience="$INTERNAL_JOBS_BASE_URL" --max-retry-attempts=3
     ```
   - Barre los negocios activos con número de Alhabla activo cuyo
     `telnyxPhoneNumberPurchasedAt` cae entre **24 y 48 h** atrás, con
     `customerLineType` distinto de `"alhabla"` (o null) y
     `forwardingReminderSentAt` a null, **y que cumplen lo mismo que
     «Comprobar desvío»** (el recordatorio promete «te llamamos»):
     `voiceRoutingTarget = "telnyx"`, `phone` sin el `TEMP-` del registro y
     fijo/móvil español (`esLineaDeClientesEspanola`, comprobado en el bucle).
     Si `phone === telnyxPhoneNumber` (caso E sin la columna puesta) o la
     línea no es española se salta **sin marcar**.
   - Dos variantes, según `OnboardingState.forwardingCheckedAt`:
     - puesto → **«tu desvío está comprobado»** (`alertarDesvioComprobado`,
       recursoId `desvio-ok:<businessId>:<intento>`, texto en
       `mensajes.alertaDesvioComprobado`, email `forwardingCheckedEmail`
       «Todo listo», no el de alerta);
     - a null y **ninguna llamada real** (`calls` sin ninguna fila con
       `voiceProvider != "whatsapp"`; las Call sintéticas del chat no pasan
       por el desvío) → **«aún no has comprobado el desvío»**
       (`alertarDesvioSinComprobar`, recursoId `desvio:<businessId>:<intento>`,
       texto en `mensajes.alertaDesvioSinComprobar`, email
       `operationalAlertEmail`);
     - a null pero con llamadas reales → nada.
     Las dos salen por la cascada habitual del canal del dueño (interactivo
     con botón «Ir a Ajustes» → plantilla `alerta_operativa_negocio` →
     email). El enlace es `/ajustes/telefono`, que `frontend/next.config.mjs`
     redirige a `/ajustes#telefono` (Ajustes › Teléfono).
   - Idempotente: reclama `Business.forwardingReminderSentAt` con un
     `updateMany` condicional **antes** de avisar (Cloud Scheduler entrega al
     menos una vez); si el aviso no sale por ninguna vía (`via: "ninguna"`)
     retira la marca con un `console.error` para reintentar en la siguiente
     pasada mientras dure la ventana. El `<intento>` del recursoId es el
     `ahora` de la pasada: con un recursoId fijo la fila de `sent_messages`
     que crea `reclamarEnvio` haría que todo reintento devolviese «ya
     enviado» y el mensaje no saldría nunca.

**Messaging idempotency (2026-09-17):** Cloud Tasks delivers **at least once**,
so `send-email`, `send-sms` and `send-whatsapp` claim the send in
`sent_messages` (unique `(channel, idempotencyKey)`) before calling the
provider. The key is the task id, injected into the payload by the `enqueue*`
helpers — pass a `taskId` whenever a duplicate would be visible to a customer.
Tasks are created with `dispatchDeadline` 180s (the default 600s let a slow
task be retried while the first was still running).

**WhatsApp plan (2026-09-19, v3):** `PLAN-CANAL-DUENO.md` designs everything
Alhabla says over WhatsApp, to clients and to owners, from **one platform
contact** («Alhabla · Gestionamos tus reservas»): confirmation + owner
notification after every booked call, reminders with buttons (client can
cancel by button, changes by phone), recados via post-conversation processing,
pending bookings, cancellations, alerts, and two **Beta** conversations
(client: read-only; owner: consult/add/move/cancel with a confirmation
button). No second number, no WhatsApp number per business, no WhatsApp
calling, no push, **no outbound calls** (user decisions). Inbound `message.*`
events on `/webhooks/telnyx` are still ignored until phase 1 of that plan.
`PLAN-WHATSAPP-LLAMADAS.md` is kept as reference only (discarded).

**WhatsApp:** everything about the WABA, numbers, templates, inbound webhooks and
API quirks lives in § *WhatsApp (Telnyx como BSP de Meta)* under Voice Orchestrators.

**Permanent vs transient failures:** job handlers throw `PermanentJobError`
(`backend/src/lib/jobErrors.ts`) for things retrying cannot fix (invalid
recipient, 4xx from the provider). `internal/routes.ts` answers `200
{skipped}` for those instead of 500, so the task leaves the queue.

Call outcome classification is **not** a background job — Retell classifies each call natively via `post_call_analysis_data` (see Retell Configuration), no separate LLM call from this backend.

## Voice Orchestrators (Retell & Telnyx)

The backend supports two voice-AI orchestrators. `Business.orchestrator` decides which is primary for a given business (`retell` or `telnyx`). **Telnyx is the primary for every business today** — with `VOICE_TELNYX_ROLLOUT` on, a new business is auto-promoted at agent creation (see "Orchestrator Field on `Business`"); the cutover script only covers older ones. Retell always stays wired as the hot fallback regardless of which is primary, which is why `syncCalendarToolsToAgents` syncs both. When verifying anything about tools by hand, **check the Telnyx assistant, not just the Retell LLM**.

### Retell (`backend/src/adapters/retell/RetellAdapter.ts`)

- Single source of truth for all Retell API calls.
- **Endpoints used:** `POST /create-retell-llm`, `POST /create-agent`, `PATCH /update-agent/{id}`, `GET /get-agent/{id}`, `DELETE /delete-agent/{id}`, `GET /list-phone-numbers`, `POST /import-phone-number`, `DELETE /delete-phone-number/{id}`, `GET /get-call/{id}`, `POST /v2/create-web-call` (public landing demo). `RetellAdapter.createPhoneNumber` (`POST /create-phone-number`) also exists but is unused dead code today — it makes Retell buy a NEW number from its own Twilio/Telnyx inventory (US/CA only), not link a number you already own. `RetellAdapter.importPhoneNumber` (`POST /import-phone-number`) is the one `phone/service.ts` actually calls, since we always own the number ourselves (bought via Telnyx) — it requires a SIP trunk `termination_uri` (see Phone provisioning below).
- Webhooks from Retell hit `POST /webhooks/retell`. The endpoint verifies the `x-retell-signature` using `retellAdapter.validateWebhookSignature` (timing-safe comparison with the Retell API key).
- Supported Retell webhook events: `call_started`, `call_ended`, `call_analyzed`. Other events are acknowledged (`200`) but ignored.
- Retell custom tools are exposed under `POST /webhooks/retell/tools/:retellAgentId/:toolName`. The `retellAgentId` path segment is required because Retell never includes an agent identifier in the tool-call body, so it's embedded in the URL itself (done in `buildRetellCalendarTools`, `backend/src/modules/calendar/service.ts`). Our tools are registered with `args_at_root: false` (see `RetellAdapter.createLlm`/`updateLlm`), so Retell sends `{name, call, args}` — `call.call_id` is threaded through as `callId` to `executeVoiceTool` so `book_appointment` can link the booking to the exact call instead of guessing "the most recent call for this business". The route still tolerates a flat args-only body (no `call_id`) for businesses not yet resynced with this config. The endpoint validates the `x-retell-signature` before executing any tool. Execution is delegated to `executeVoiceTool` in `backend/src/modules/voiceTools/service.ts`, which implements `check_business_hours`, `check_availability` and `book_appointment` (Google, Outlook and Apple/CalDAV supported). `check_availability` also accepts an optional `professionalId` (copied from `get_catalog`; the prompt only sends it when the caller named someone) to check that specific professional instead of "anyone free".
- **Professional levels in the tool contract (2026-09-17).** `check_availability` translates the ranking into things the agent may say, never the internal tiers: without `professionalId` the success result carries `assignedProfessional: { id, name, isSpecialist }` (= `availableProfessionals[0]`); when the named professional is marked "no sugerir" for the requested services and someone better is free at that time, the result (success or `ALL_PROFESSIONALS_BUSY`) carries `recommendation: { professional, isSpecialist, availabilityToken, instructions }` — its own token so "vale, con Laura" books without another round-trip — and the draft of the *requested* person is flagged `recommendationOffered`. Both tools accept `professionalConfirmed: boolean`: `check_availability` with it skips the recommendation; `book_appointment` **without it on a flagged draft returns `PROFESSIONAL_CONFIRMATION_REQUIRED`** (with the recommendation) instead of booking — the safety net for manually-edited prompts, which receive new tools but not the new prompt text. Booking results now include `professionalName`. Internal fields (`specialistIds`, `recommendedProfessional`) never reach the LLM.
- **Tool errors never return HTTP 500 to Retell.** All three tools always resolve to `{success: true, result: {success: false, code, message}}` on failure — a Spanish, LLM-speakable message the agent can relay, never a raw exception. `book_appointment`'s calendar-related failures are classified into `*_RECONNECT_REQUIRED` (Google/Outlook/CalDAV credentials revoked — needs manual reconnect), `CALENDAR_TIMEOUT` / `CALENDAR_RATE_LIMITED` (the provider request took over `CALENDAR_REQUEST_TIMEOUT_MS`/`GRAPH_REQUEST_TIMEOUT_MS`, both 8s — a margin under Retell's own 20s tool timeout so the backend cuts the request itself instead of leaving it dangling) or `BOOK_APPOINTMENT_FAILED`/`BOOK_APPOINTMENT_UNEXPECTED_ERROR` (anything else). Every failure except `*_RECONNECT_REQUIRED` also enqueues `retry-failed-booking` (see Background Jobs) after saving a `Lead` with the attempted booking.
- **`serviceIds`/`professionalId` supplied by the LLM to `book_appointment` are verified against `businessId` before use** (`prisma.service.findFirst`/`prisma.professional.findFirst` scoped by `businessId`). An ID that doesn't belong to the business is treated as if it had never been given (falls back to auto-resolution) rather than failing the booking or silently trusting a cross-tenant ID.
- When an agent is created or updated for a Retell business, `agentBootstrap.ts` creates/updates the LLM and agent in Retell and stores `retellAgentId`/`retellLlmId` in the `Agent` row.
- Retell agents use the name built by `buildAgentDisplayName(businessName, businessType)` so they are easy to identify in the Retell dashboard.

### Retell Configuration

- Retell agent defaults live in `backend/src/lib/agentBootstrap.ts` (`DEFAULT_RETELL_AGENT_CONFIG`).
- Default LLM: `gpt-5.6-luna` (the `"gpt-4.1"` fallback inside `RetellAdapter.createLlm()` is dead
  code in practice — `buildRetellLlmPayload()` always passes a model explicitly).
- Default voice: a cloned/purchased voice (`voiceId: "custom_voice_4d8c043e79b567a286898349d2"`),
  not a named preset.
- Default language: `es-ES`, timezone: `Europe/Madrid`.
- Payload builders: `buildRetellAgentPayload` and `buildRetellLlmPayload`.
- **`post_call_analysis_data`** (Retell's own post-call classification LLM, no extra API call from this backend) is built by `buildPostCallAnalysisData(serviceNames)` in `agentBootstrap.ts` and always includes:
  - `call_outcome` (enum, unchanged) — written to `Call.outcome`.
  - `escalation_reason` (enum: `CLIENTE_LO_PIDIO` / `FALLO_TECNICO` / `FUERA_DE_HORARIO` / `CONSULTA_COMPLEJA` / `NO_APLICA`) — gated with Retell's `conditional_prompt` so it's only evaluated when `call_outcome` is `ESCALATED` or a booking failed. Persisted to `Call.escalationReason` (Prisma enum `CallEscalationReason`, same values); an unrecognised value is dropped rather than stored.
  - `tool_failure_detected` (boolean) — persisted to `Call.toolFailureDetected`.
  - `requested_service_type` (enum) — **only added when the business has active services**; its `choices` are generated from `Service.name` at sync time (capped at 40), not a hardcoded taxonomy, so it adapts automatically to any vertical. Persisted to `Call.requestedService` (free-form string, since the choices are per-business); `NO_APLICA` is stored as `null`.
  - All four are parsed in `RetellCallAnalysisSchema` (`adapters/retell/webhookHandlers.ts`) and written in `handleCallAnalyzed`. Until 2026-09-11 only `call_outcome` was parsed and the other three were silently discarded, so calls analysed before that date have them empty. The frontend surfaces them as the "why didn't this become a booking" line in `CallDetailModal` and as a chip in `RecentCalls`, only for calls without a booking.
  - The adapter type is `RetellAnalysisField = RetellEnumAnalysisField | RetellBooleanAnalysisField` (`RetellAdapter.ts`), matching Retell SDK's `EnumAnalysisData`/`BooleanAnalysisData` shapes. Retell's SDK also supports `string`/`number`/`call-preset` analysis types, unused here.
- **`syncAgentToRetell(businessId)`** (`agentBootstrap.ts`) is the single point that rebuilds the managed prompt (see Agent Configuration) and `post_call_analysis_data` from the business's current settings/services/professionals and pushes both to every Retell-backed `Agent` row. Called from `PATCH /business/me` (tone/goal/schedule/businessDetails/businessType/restrictions changes) and from `bookings/routes.ts` (service/professional CRUD). **Not** called from `PATCH /agents/:id`, which lets a business owner override the prompt with free text — that route instead calls `buildPostCallAnalysisDataForBusiness(businessId)` directly so post-call-analysis fields still stay current without touching the manually-edited prompt.

### Telnyx: qué es de desarrollo y qué de producción

Dev y producción **comparten la cuenta y la API key de Telnyx**, y **Telnyx no ofrece ninguna
forma autoservicio de separarlas** (comprobado el 2026-09-19 con los skills oficiales y contra la
API real):

- **Managed Accounts** —subcuenta con su propia API key, sus números y facturación agregada al
  padre— exige que Telnyx te apruebe explícitamente como cuenta gestora. La documentación lo dice
  literalmente: *«Users need to be explicitly approved by Telnyx in order to become manager
  accounts»*. Sin esa aprobación, `/v2/managed_accounts` responde `10006 Not authorized`.
- **Usuarios de organización con grupos** (`/v2/organizations/users`) responde `10005`: tampoco
  está habilitado en esta cuenta.
- **No existen API keys con permisos por recurso.** Las claves de Telnyx son de cuenta entera.

Lo único disponible hoy sin pedir nada, además de los dos Call Control Apps y los tags: **billing
groups** (`/v2/billing_groups`, y cada número admite `billing_group_id`). No aíslan nada, pero
permitirían ver el gasto de desarrollo separado del de producción. Hay ya un grupo
`alhabla-platform` creado y ningún número asignado.

La separación se apoya por tanto en tres cosas:

1. **Dos Call Control Apps**, cada uno con su `webhook_event_url`; `TELNYX_CALL_CONTROL_APP_ID`
   elige el del entorno. Un número llega a uno u otro backend por su `connection_id`.

   | App | id | webhook |
   |---|---|---|
   | `alhabla-platform-production` | `3048374727065208187` | `https://api.alhabla.ai/webhooks/telnyx` |
   | `alhabla-platform` (desarrollo) | `3046870077287696179` | `https://dev-api.alhabla.ai/webhooks/telnyx` |

2. **Tags `env-dev` / `env-prod` en cada número** (desde 2026-09-19). `GET /v2/phone_numbers`
   acepta `filter[tag]`, así que un script puede preguntar por los suyos en vez de mirar la
   cuenta entera. Es la alternativa barata a Managed Accounts, y hay que **ponerla a mano al
   comprar un número**: `provisionPhoneNumber` todavía no etiqueta.

   | Número | Tag | Uso |
   |---|---|---|
   | +34930453219 / 236 / 237 / 238 / 289 | `env-dev` | Las 5 cuentas de prueba `test-*@alhabla.local` |
   | +34930453216 | `env-prod` | Negocio real «Peluqueria Vide» |
   | +34930453218 | `env-prod` | Emisor de WhatsApp gestionado por Telnyx — **no borrar**, no pertenece a ningún negocio de la BD |
   | +34930454394 / 372 / 382 / 375 / 393 | `env-prod`, `whatsapp-sector`, `sector-<tipo>` | Números de WhatsApp de Alhabla (ver § WhatsApp): el …394 es el de clientes «Alhabla Reservas», los otros cuatro en reserva — **no borrar**, no pertenecen a ningún negocio; desvío de voz permanente a +34 692 138 456 |

3. **Los scripts miran contra qué base de datos cruzan** (`describirEntorno()`), porque el daño
   real no viene de compartir cuenta sino de apuntar a la BD equivocada.

**Lo que dev y producción siguen compartiendo** (auditado el 2026-09-19 comparando por hash cada
secreto de Secret Manager con el `.env` local, sin imprimir valores): las cuentas de **Telnyx** y
**Retell** (`RETELL_API_KEY`, `RETELL_SIP_TRUNK_AUTH_PASSWORD`, `TELNYX_API_KEY`), las apps OAuth
de **Google** y **Microsoft** (`GOOGLE_AUTH_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`,
`MICROSOFT_CLIENT_SECRET`) y **Zoho** (`ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`).
`TELNYX_SPAIN_REQUIREMENT_GROUP_ID` también, pero es un identificador regulatorio y compartirlo
es lo correcto. **Zoho era el que menos se esperaba:** `lib/zohoMail.ts` no miraba `NODE_ENV`, así que desde
desarrollo se mandaba correo real desde el buzón de producción — solo se salvaba porque los
negocios de dev usan `@alhabla.local` y rebotan. Desde el 2026-09-19 hay guardarraíl: fuera de
producción solo escribe a las direcciones de `ZOHO_DEV_ALLOWED_RECIPIENTS` (lista por comas;
vacía = no manda nada, `*` = a cualquiera), y lo que no manda lo deja en un `console.warn` con
destinatario y asunto. La comprobación va **antes** de pedir el token y **no lanza**: para el job
es un envío resuelto y reintentarlo no cambiaría nada.
Separados sí están: base de datos, backend, URL pública, Call Control Apps, números, R2, Stripe,
`JWT_SECRET`, Places y `CALENDAR_CREDENTIALS_KEY`.

**Las cuentas de prueba viven en desarrollo (revertido el 2026-09-19).** El 14-09
`scripts/replicateTestAccountsToProd.ts` las **copió** a producción —dev nunca las perdió— y
movió sus 5 números al Call Control App de producción "de forma permanente", porque entonces el
túnel de dev era ngrok y cambiaba de hostname cada dos por tres. Con `dev-api.alhabla.ai` fijo
eso dejó de hacer falta: los 5 números volvieron al app de dev y las 5 copias se borraron de la
Cloud SQL de producción (`DELETE FROM businesses`, cascada; 55 llamadas y 17 citas de prueba con
ellas), junto con sus 5 agentes de Retell, sus 5 LLM y sus 5 assistants de Telnyx. Producción
queda con tres negocios reales. **Si se vuelve a ejecutar ese script, hay que revertir lo mismo
otra vez**; lo que no hay que hacer es dejar las copias vivas apropiándose de los números.

### Phone provisioning

`provisionPhoneNumber` (`backend/src/modules/phone/service.ts`) buys a Telnyx number and imports it into Retell via SIP trunk, linking it to the business's active agent. Failures in Telnyx/Retell do not fail the Stripe webhook response.

Only Spain (`PHONE_NUMBER_COUNTRY=ES`) is supported today — searches only `local`-type numbers and requires `TELNYX_SPAIN_REQUIREMENT_GROUP_ID`, a single platform-level regulatory Requirement Group reused across every business. Telnyx doesn't expose a per-number address-requirement flag in search results — regulatory requirements are resolved entirely by the Requirement Group at order time, so there's no address-based filtering step.

**Telnyx number orders are asynchronous** (`status: "pending" | "success" | "failure"`). `provisionPhoneNumber` persists `telnyxNumberOrderId` as soon as the order is created, then polls `getNumberOrder` for a bounded window (5 attempts, 2s apart). If still `"pending"` after that, it returns `status: "pending"` rather than an error — a retry (via the frontend's "Reintentar asignación de número" button, or the `checkout-session/:id/reconcile` fallback) resumes the same order (`telnyxAdapter.getNumberOrder(business.telnyxNumberOrderId)`) instead of placing a duplicate purchase.

Once the order succeeds, the number is imported into Retell via `retellAdapter.importPhoneNumber`, which requires a **SIP trunk** — a Telnyx SIP Connection created once (manually, in the Telnyx portal) pointing inbound traffic at Retell (`sip:sip.retellai.com`), with credential-based auth since Retell has no static IP. Its termination URI and SIP credentials are platform-level config (`RETELL_SIP_TERMINATION_URI`, `RETELL_SIP_TRUNK_AUTH_USERNAME`, `RETELL_SIP_TRUNK_AUTH_PASSWORD`), reused for every business, same as the Requirement Group. `TELNYX_SIP_CONNECTION_ID` is passed at order time so the purchased number is assigned to that connection automatically.

## Telefonía

Plan completo en `PLAN-TELEFONIA-UX.md` (fases 0-3 y 5 en main desde 2026-09-22; la
fase 4, «Alhabla como número principal» con transferencia al dueño, en código desde el
2026-09-22 y **pendiente de la prueba real** de la transferencia con un negocio de
producción). Nace de la prueba real de producción (#130): el dueño no sabía qué número era
cuál.

### Los tres papeles del número

| Campo | Papel | Quién lo ve |
|---|---|---|
| `Business.phone` | **Línea de clientes**: a la que llaman, la que se desvía y la que la recepcionista dice en voz alta y pone en SMS/WhatsApp («para cambiarla, llama al…»). Viene de Google Places; placeholder `TEMP-…` hasta que el dueño la guarda. | Clientes |
| `Business.telnyxPhoneNumber` | **Número de Alhabla**: destino del desvío. El dueño lo marca una vez dentro del código y no se lo da a nadie (salvo en el caso E, donde lo publica como principal). | Solo el dueño |
| `Business.ownerWhatsappNumber` | **Móvil del dueño**: avisos, recados y el Gestor por WhatsApp. | Solo Alhabla |

Columnas de la fase 0 (`migrations/20260921180000_telefonia_fase0`), todas aditivas y
aceptadas por `PATCH /business/me` (`modules/businesses/routes.ts`):

- `Business.customerLineType`: `"fijo" | "movil_trabajo" | "movil_personal" | "alhabla"`
  o **null** (negocio anterior al plan: el panel infiere fijo/móvil con
  `esFijoEspanol`/`inferirTipoDeLinea` de `frontend/src/lib/phone.ts` hasta que el dueño lo
  confirma; `CallForwardingCard` y Ajustes › Teléfono se lo preguntan una vez).
- `Business.ownerPhoneIsCustomerLine` (caso C: la línea de clientes es el mismo móvil que
  recibe los avisos; evita preguntar dos veces por el número).
- `Business.hideOwnerNumberFromClients` (**privacidad del número**, caso C): la recepcionista
  no dice `phone` ni lo escribe en SMS/WhatsApp; ofrece «dejo recado y te llaman». Lo aplican
  `telefonoParaClientes()` en `voiceTools/service.ts`, `lib/managedAgentPrompt.ts` (regla en el
  prompt), `lib/telnyxAgentSync.ts` y `whatsapp/mensajesCliente.ts`. El número de Alhabla se
  sigue dando siempre: es el de la propia recepcionista.
- `OnboardingState.forwardingCheckedAt`: el desvío se **comprobó de verdad** (ver abajo).
  Distinto de `forwardingConfirmedAt` («el usuario dice que sí») y de la primera llamada.
- `Business.forwardingReminderSentAt` (fase 5): marca del mensaje único del día 1 (en
  cualquiera de sus dos variantes), § Background Jobs 8.

Tipos de línea y códigos: **los MMI son los mismos en todos los operadores españoles**
(`*21*`, `*61*`, `*62*`, `*67*` + número + `#`; con `**` en móviles; se quitan con `#21#`,
`##21#`…), así que no se pregunta el operador. Solo cambia la explicación por tipo:
fijo → `*61*`/`*21*` sin `**`, marcados desde el propio aparato tras el tono, con la nota del
contestador («si tu fijo tiene contestador, desactívalo o se quedará él las llamadas», en
Movistar `#10#`); móvil → los cuatro códigos con `**61*` recomendado y la nota «este desvío
sustituye al buzón de voz»; `alhabla` → no hay tarjeta de desvío. Las listas viven en
`CODIGOS_FIJO`/`CODIGOS_MOVIL` de `frontend/src/components/call-forwarding-card.tsx`.

Pantallas: el alta pregunta «¿A qué número te llaman tus clientes?» con cuatro tarjetas
(`frontend/src/components/tarjetas-de-linea.tsx`, usadas en `app/bienvenida/page.tsx`) y
Ajustes tiene una sola sección «Teléfono» (`components/ajustes-telefono.tsx`, `id="telefono"`)
con tres bloques: línea de clientes (número + tipo + «Comprobar desvío» + códigos), tu
recepcionista (número de Alhabla) y tu móvil (`WhatsappDueno` + privacidad). El teléfono ya
no se edita en «Datos del negocio».

### «Comprobar desvío» (`backend/src/modules/onboarding/comprobacionDesvio.ts`)

El único mecanismo nuevo de backend del plan: el número de Alhabla llama a la línea de
clientes y, si el desvío está bien, esa llamada vuelve a entrar por el propio número de
Alhabla. Todo el estado vive en Redis; en Postgres solo queda `forwardingCheckedAt`.

1. `POST /business/me/onboarding/forwarding/check` (`onboarding/routes.ts`) →
   `iniciarComprobacionDeDesvio(businessId)`. Requisitos, con su código de error
   (`CODIGOS_DE_ERROR_DE_COMPROBACION`): número de Alhabla `active` (`sin_numero`, 402);
   `phone` E.164 distinto del número de Alhabla y `customerLineType != "alhabla"`
   (`linea_de_clientes_invalida`, 409); fijo o móvil **español** según
   `esLineaDeClientesEspanola` de `lib/phone.ts` — la llamada la paga Alhabla
   (`linea_no_admitida`, 409); `voiceRoutingTarget === "telnyx"` y
   `TELNYX_CALL_CONTROL_APP_ID` (`telefonia_no_configurada`, 503); una sola en curso por
   negocio (`comprobacion_en_curso`, 409); **3 por hora** (`limite_alcanzado`, 429); fallo
   al originar (`no_se_pudo_llamar`, 502).
2. Claves de Redis (TTL `COMPROBACION_TTL_SEGUNDOS` = 120 s):
   - `desvio:check:<id>` — hash de la comprobación (`id`, `businessId`, `linea`,
     `startedAt`, `callControlId`, `contestada`, `resolucion` = JSON `{resultado, resueltaAt}`).
     Cada webhook escribe **solo su campo**: el fallo del colgado con `HSETNX`, el `ok` de la
     entrada con `HSET` (pisa un fallo previo). Los dos webhooks llegan con segundos de
     diferencia, en cualquier orden y quizá en instancias distintas de Cloud Run.
   - `desvio:check:negocio:<businessId>` — turno (`SET NX`); se libera al resolverse.
   - `desvio:check:ultima:<businessId>` — puntero a la última comprobación, resuelta o no; es
     lo único que enlaza la entrante (sin `client_state`) con su comprobación y no se borra
     al fallar.
   - `desvio:check:limite:<businessId>` — contador por hora; solo cuentan las llamadas que
     de verdad salieron.
   La comprobación se guarda **antes** de marcar: con desvío «todas» la entrante puede
   llegar antes de que `dialCall` devuelva.
3. La saliente sale por `telnyxAiAdapter.dialCall` (`adapters/telnyx/TelnyxAiAdapter.ts`)
   con `from` = número de Alhabla, `to` = línea, `timeout_secs` 35, `time_limit_secs` 60 y
   `client_state` = base64 de `{ tipo: "comprobacion_desvio", businessId, checkId }`
   (`codificarClientState`/`leerClientStateDeComprobacion`).
4. Reconocimiento en `adapters/telnyx/webhookHandlers.ts`:
   - `call.initiated` con nuestro `client_state` o `direction: "outgoing"` → pata propia,
     se ignora (sin esto se colgaría como «negocio desconocido»).
   - `call.initiated` entrante al número de Alhabla con `from` = **el propio número de
     Alhabla** (ningún cliente llama desde ahí), o `from` = la línea de clientes si hay una
     comprobación de hace menos de `VENTANA_DE_ATRIBUCION_SEGUNDOS` (45 s;
     `comprobacionDeDesvioReciente`) → `esLlamadaDeComprobacionDeDesvio` →
     `recibirLlamadaDeComprobacion`: `registrarLlamadaDeComprobacionRecibida` pone
     `forwardingCheckedAt` (y `forwardingConfirmedAt` si estaba a null), marca `ok` y
     **cuelga sin arrancar la recepcionista**: ninguna `Call`, transcripción ni coste. Si no
     hay comprobación viva se anota igualmente con un `console.warn`.
   - `call.answered` con nuestro `client_state` → `registrarSalienteContestada` (alguien la
     cogió: el dueño por reflejo o un contestador) y se cuelga.
   - `call.hangup` con nuestro `client_state` → `registrarSalienteColgada`: si no hay
     resultado, `fallo` con motivo (`motivoDeFalloPorColgado`): `contestada` →
     `la_has_cogido`; `user_busy`/`call_rejected` → `comunicando`; `timeout`/`no_answer` →
     `sin_desvio`; otro → `desconocido`.
   - `call.cost` con nuestro `client_state` → solo log; no hay `Call` a la que cargarlo.
5. El panel hace polling a `GET /business/me/onboarding/forwarding/check/:id` cada 2 s hasta
   50 s (`ComprobarDesvio` en `call-forwarding-card.tsx`, reutilizado por
   `ajustes-telefono.tsx` con `contexto="ajustes"`) y pinta «Desvío funcionando» o el motivo
   con qué hacer (`TEXTO_POR_MOTIVO`). «Ya lo he activado» sigue existiendo como respaldo
   solo en la tarjeta del panel de inicio.

Mensaje del día 1: a las 24 h de comprar el número, el job `recordar-desvio-sin-comprobar`
(§ Background Jobs 8) escribe una sola vez al dueño: «tu desvío está comprobado» si lo
comprobó, o «aún no has comprobado el desvío» si no hay comprobación ni llamada real; en
ambos casos con enlace a Ajustes › Teléfono, y solo a negocios a los que «Comprobar desvío»
les funcionaría.

### Alhabla como número principal y transferencia al dueño (fase 4)

El caso E del plan: el negocio publica el número de Alhabla como su teléfono
(`customerLineType = "alhabla"` y `phone` = `telnyxPhoneNumber`), no hay desvío y la
recepcionista **pasa la llamada al móvil del dueño** cuando toca. Sin tabla ni columna
nuevas: el ajuste vive en `Business.agentSettings.pasarLlamadas`.

- **Ajuste «Cuándo pasarme llamadas»** (`AgentSettings.pasarLlamadas`, opcional):
  `"nunca" | "si_lo_pide" | "siempre"`. Sin valor, el modo efectivo lo da
  `modoDeTransferenciaPorDefecto` (`lib/transferenciaAlDueno.ts`): «si el cliente lo pide»
  cuando el número de Alhabla es el principal y hay a quién pasar la llamada, «nunca» en el
  resto. Se deja opcional a propósito: pasar a «Alhabla como principal» activa la
  transferencia sin reescribir el ajuste. Se guarda como cualquier otro campo de
  `agentSettings` (`PATCH /business/me` con el objeto entero; el panel manda
  `{ ...DEFAULT_AGENT_SETTINGS, ...business.agentSettings, pasarLlamadas }`).
- **Destino** (`destinoDeTransferencia`): `ownerWhatsappNumber` o, si
  `ownerPhoneIsCustomerLine`, la línea de clientes. Debe ser un número español
  (`esLineaDeClientesEspanola`: la pata la paga Alhabla), distinto del número de Alhabla y
  **distinto de la línea de clientes desviada**: con un desvío «si no contesta», transferir
  al móvil desviado volvería a entrar por el número de Alhabla como una segunda llamada y,
  al llegar desde el propio número de Alhabla, «Comprobar desvío» la tomaría por una
  comprobación. Con Alhabla como principal `phone` ya es el de Alhabla y la regla no estorba.
- **Una sola resolución** (`resolverTransferenciaAlDueno` → `{ modo, destino, origen,
  activa }`) decide a la vez la tool y el prompt: `loadManagedAssistantConfig`
  (`lib/telnyxAgentSync.ts`) la pasa a `buildManagedAgentPrompt` (bloque «## Pasar la
  llamada», solo con `activa`) y a `buildTelnyxAssistantPayload` (`transferenciaAlDueno:
  { from, to }`, aparte de `tools` para que también entre cuando `calendar/service.ts`
  pasa sus tools de webhook). Retell no la recibe: no tiene la tool.
- **Tool nativa `transfer`** (`buildTelnyxTransferTool` en `lib/telnyxAssistantPayload.ts`,
  formato de `AssistantTool.Transfer` del SDK telnyx 7.21): `from` = número de Alhabla,
  `targets: [{ name: "Responsable del negocio", to: <móvil> }]`,
  `warm_transfer_instructions` (el assistant compone un mensaje que el dueño oye antes de
  unir las llamadas: «soy la recepcionista de X, te paso a un cliente que…») y
  `voicemail_detection: { detection_mode: "premium", on_voicemail_detected: { action:
  "stop_transfer" } }` (si salta el buzón del móvil, Telnyx cancela la pata y devuelve la
  llamada a la recepcionista; sin esto el cliente acabaría en el contestador del dueño).
  Sin `timeout_secs` (la tool nativa no lo tiene), sin `description` (la genera Telnyx) y
  sin `warm_transfer_acceptance` (la documentación lo limita a llamadas arrancadas con
  `ai_assistant_start`; las nuestras se contestan con `answer` + `assistant`).
- **Reglas del prompt** (`buildTransferInstruction`, `lib/managedAgentPrompt.ts`):
  `si_lo_pide` → solo si el cliente pide hablar con una persona; quejas/urgencias/pagos →
  recado primero, transferencia si insiste. `siempre` → también quejas, urgencias, pagos y
  lo que no sea reservar/consultar, **solo en horario de apertura**; fuera, recado. En
  ambos: avisar al cliente antes, pasarla una sola vez, y si falla o no contestan «ahora no
  puede atenderle, ¿prefiere que le llamen o dejar recado?» (recado = `informar_al_negocio`
  de siempre). Que la llamada siga con la recepcionista tras un fallo lo dice la
  documentación de Telnyx (transfer de Call Control y «Voicemail Detection on Transfer»);
  **queda por confirmar en vivo** (§ 6 del plan: probar con INFINITY antes de exponerlo).
- **Resincronización**: además de `agentSettings`, `PATCH /business/me` resincroniza prompt
  y assistant cuando cambian `customerLineType`, `phone`, `ownerWhatsappNumber` u
  `ownerPhoneIsCustomerLine` (`cambiaLaTransferencia`), porque los cuatro deciden si la
  tool existe y hacia dónde. También `provisionPhoneNumber` (`modules/phone/service.ts`)
  llama a `syncAgentToTelnyx` en cuanto guarda `telnyxPhoneNumber`: el origen de la
  transferencia es ese número y, sin esto, un negocio que eligió «Alhabla como principal»
  en el alta se quedaba sin la tool hasta el reconciliador de las 04:00.
- **Copia del prompt en `Agent.systemPrompt`** (lo que enseña `/agente`): es el prompt del
  primary, Telnyx, **con** el bloque cuando la tool está registrada. La escriben
  `PATCH /business/me`, `syncAgentToTelnyx` (agentes gestionados) y `syncAgentToRetell`
  (`promptDelPanel`, calculado aparte del `generalPrompt` que va a Retell, que no lleva el
  bloque porque Retell no tiene la tool). Un prompt **editado a mano**
  (`promptManuallyEdited`) viaja a Telnyx tal cual, pero si la tool se registra y el texto
  no contiene «## Pasar la llamada», `promptManualConSuRegla` le añade el bloque al final:
  nunca la tool sin su regla.
- **Patas sin `Call`** (`adapters/telnyx/patasSinCall.ts`): la saliente que abre la tool
  `transfer` nace en el mismo Call Control App con `direction: outgoing` y sin
  `client_state`, y sus `call.hangup`/`call.cost` llegan como los de cualquier llamada.
  `handleCallInitiated` la apunta en Redis (`telnyx:pata_sin_call:<call_control_id>`,
  motivo `transferencia`; la entrante de «Comprobar desvío» se apunta como
  `comprobacion`), y `handleCallHangup`/`handleCallCost` devuelven `success: true` sin
  buscar `Call` cuando la marca existe. Sin esto cada transferencia correcta acababa en
  404 y un `voice_webhook_events` en `error`. `call.cost` no trae `from`/`to`: no hay
  forma sin estado de reconocerlo.
- **El móvil del dueño no puede estar desviado a Alhabla** (caso C, o B con avisos al
  mismo móvil): la pata de la transferencia entraría de vuelta por el número de Alhabla
  con `from` = número de Alhabla, `esLlamadaDeComprobacionDeDesvio` la colgaría y el móvil
  no sonaría nunca. Una vez `customerLineType = "alhabla"` no queda rastro de que esa
  línea estuvo desviada, así que la protección es de copy: la pantalla de número principal
  detecta que la línea antigua es el móvil del dueño (`lineaAntiguaEsElMovilDelDueno`,
  `lib/pasar-llamadas.ts`) y en vez de proponer el desvío «todas» pide anular los desvíos
  (`##002#`, `CODIGO_ANULAR_DESVIOS_MOVIL`); Ajustes › Teléfono lo recuerda bajo «Cuándo
  pasarme llamadas» siempre que el modo no sea «nunca».
- **Móvil fuera de España**: `motivoSinMovilParaPasarLlamadas` (frontend) exige lo mismo
  que `destinoDeTransferencia` (`esLineaDeClientesEspanola`, copiada en
  `frontend/src/lib/phone.ts`): con un `+44…` la pantalla y Ajustes dicen que no puede
  pasar llamadas y no enseñan los modos, en vez de prometer una tool que el backend no
  registra.
- **Pantallas**: `app/ajustes/numero-principal/page.tsx` («Usar Alhabla como número
  principal»: qué cambia, dónde publicarlo —Google Business Profile, web, redes, WhatsApp
  Business como «otro teléfono»—, qué hacer con el número antiguo —desvío «todas» durante la
  transición o baja, con el código `*21*`/`**21*` según el tipo, salvo que la línea antigua
  sea el móvil del dueño: entonces «no lo desvíes» y `##002#`— y el ajuste; sin móvil del
  dueño (o con uno fuera de España) lo dice, enlaza a Ajustes › Teléfono › Tu móvil y no
  deja confirmar; al confirmar hace el PATCH y vuelve a `/ajustes#telefono`). El botón «Usar como número principal» de
  Ajustes › Teléfono es ahora un enlace a esa pantalla, y el bloque «Tu recepcionista»
  enseña «Cuándo pasarme llamadas» (`components/pasar-llamadas.tsx`, helpers en
  `lib/pasar-llamadas.ts`) cuando `customerLineType` es `alhabla`.

## Stripe Billing

- Uses **Stripe Checkout Sessions** (embedded UI mode) for subscription sign-ups.
- Plans are defined in `backend/src/modules/billing/catalog.ts`:
  - `inicio` — 100 min included, 0.60€/min extra.
  - `pro` — 400 min included, 0.45€/min extra (featured).
  - `scale` — 1000 min included, 0.35€/min extra.
- Each plan maps to a `STRIPE_PRICE_*` environment variable.
- New subscriptions get a 7-day trial (`CHECKOUT_TRIAL_DAYS = 7`).
- `createCheckoutSession` rejects if the business already has an active subscription or trial.
- Stripe webhooks are processed in `billing/service.ts` (`handleStripeEvent`). Events are deduplicated via `StripeWebhookEvent` table.
- After a successful checkout, the frontend calls `POST /billing/checkout-session/:sessionId/reconcile` to sync the subscription state to the `Business` record.
- `getBillingSummary` calculates consumed minutes in the current period via `call.aggregate({ _sum: { durationSecs } })` on non-`IN_PROGRESS` calls.
- **Automatic phone provisioning:** On Stripe webhook `checkout.session.completed`, the backend persists the Stripe IDs and triggers `provisionPhoneNumber(businessId)` asynchronously. This purchases a Telnyx number and imports it into Retell via SIP trunk (see Phone provisioning above). Failures do not fail the Stripe webhook response. (That webhook does not run the full subscription reconcile — the complete state sync happens via `POST /billing/checkout-session/:sessionId/reconcile` or the `customer.subscription.created` webhook.)

## Calendar Integration

- **Three providers:** Google Calendar, Outlook Calendar and Apple/iCloud (any CalDAV server). **Credentials are never stored on `Business`**: since PR #79 (2026-09-18) the `google*`/`outlook*` columns are dropped and every credential lives encrypted in `calendar_connections.credentials` (one row per business and provider). `Business.calendarProvider` is just a pointer to the active provider. See "Arquitectura por adaptadores" below.
- **Google Calendar:** OAuth 2.0 offline access (`prompt: consent`, `access_type: offline`). Minimum scopes: `calendar.events` + `calendar.calendarlist.readonly` (never the full `calendar` scope — PR #73). Supports the `primary` calendar or a specific calendar id.
- **Outlook Calendar:** Microsoft Graph OAuth. After OAuth, the user selects a calendar from a list; then `connectMicrosoftCalendar` saves the choice. Graph rotates the refresh token on every refresh, so the adapter reports it back through `alRotarCredenciales` and `conexion.ts` persists it.
- **Apple / iCloud (CalDAV):** no OAuth. `POST /calendar/auth/caldav/connect` takes `{ username, appPassword, serverUrl? }` (Apple ID + app-specific password from appleid.apple.com; the server defaults to `SERVIDOR_CALDAV_ICLOUD`) and returns the same `{ calendars, email }` contract as the Microsoft callback. Only reachable from `/agente` — the onboarding step `/register/business/calendar` still offers Google and Outlook only.
- **Calendar selection:** Google callback redirects directly to frontend. Microsoft callback returns a JSON payload with calendar list; frontend shows selector and calls `POST /calendar/auth/microsoft/connect`. CalDAV returns its calendar list straight from the connect call and finishes with `POST /calendar/select`.
- **Switching calendars:** `GET /calendar/calendars` lists the calendars of the connected account (Google `calendarList`, Microsoft Graph or a CalDAV `PROPFIND`) with `{ provider, selectedCalendarId, calendars: [{ id, name, primary }] }`; `POST /calendar/select` with `{ calendarId }` switches the active calendar for any of the three. The `/agente` calendar section uses both for its "Cambiar de calendario" picker.
- `getUpcomingEvents` normalizes events from all three providers into a common format.
- If credentials stop working (Google/Graph `invalid_grant`, CalDAV 401/403), the backend throws a `CalendarBusinessError` with code `GOOGLE_CALENDAR_RECONNECT_REQUIRED`, `OUTLOOK_CALENDAR_RECONNECT_REQUIRED` or `CALDAV_CALENDAR_RECONNECT_REQUIRED`. The frontend should prompt the user to reconnect.
- **Appointment booking** (`book_appointment` webhook handler) works with all three providers. It creates the calendar event and persists a `Booking` row with `professionalId`, `serviceIds` and `durationMinutes` (duration recalculated server-side from the verified services). If no `professionalId` is provided, it selects `availableProfessionals[0]` from `checkAvailability` (specialist first, then the least-loaded that day; never a "no sugerir").

### Arquitectura por adaptadores (`backend/src/adapters/calendar/`, desde 2026-09-18)

Cada proveedor es un adaptador detrás de la interfaz `CalendarProvider`; `CalendarService`
(`modules/calendar/service.ts`) es una fachada sin ramas `if (provider === ...)`, y los
consumidores (voiceTools, `jobs/retryFailedBooking.ts`, `calendar/routes.ts`, onboarding)
no conocen columnas de `Business`: reciben una `CalendarConnection` opaca.

```
backend/src/adapters/calendar/
├── CalendarProvider.ts   # SOLO tipos y constantes (PROVEEDORES_DE_CALENDARIO, DESCRIPTORES_DE_PROVEEDOR,
│                         #   CalendarConnection, ConexionActiva, NuevoEventoDeCalendario, interfaz CalendarProvider).
│                         #   Prohibido importar googleapis, microsoftGraph, prisma o redis: lo importan voiceTools y el job.
├── errors.ts             # CalendarBusinessError (+ `provider` opcional), codigoDeReconexion, esCalendarBusinessError
│                         #   (duck-typed por `name`), proveedorDesdeErrorDeReconexion (null si desconocido: nunca cae a google)
├── eventoDeCalendario.ts # buildEventContent, recordatorios, hashDeIdempotencia — común a todos los proveedores
├── registry.ts           # obtenerProveedorDeCalendario(id) → singleton sin estado (como retellAdapter)
├── google/GoogleCalendarProvider.ts    # googleapis; exporta crearClienteOAuthDeGoogle e isGoogleInvalidGrantError
├── outlook/OutlookCalendarProvider.ts  # envuelve lib/microsoftGraph.ts (que no cambió)
└── caldav/                             # Apple/iCloud (y cualquier CalDAV): CaldavCalendarProvider.ts sobre tsdav,
                                        #   ics.ts (iCalendar ↔ dominio con ical.js, funciones puras)

backend/src/modules/calendar/conexion.ts   # el ÚNICO fichero que lee/escribe calendar_connections; serializarBusiness para el panel
backend/src/lib/voiceConfigCache.ts        # claveDeCacheDeVoz / invalidarCacheDeVoz (antes 4 copias del literal)
```

- **Interfaz** (`CalendarProvider<P>`): `listarCalendarios(cuenta)`, `listarProximosEventos(conexion, max)`,
  `listarOcupacion(conexion, ventana)` (devuelve intervalos ya filtrados con la regla del proveedor; puede lanzar
  cualquier cosa, el servicio degrada a `{ intervals: [], calendarAvailabilityKnown: false }`), `crearEvento(conexion,
  evento)` (idempotente por `idempotencyDigest`, devuelve `{ id, htmlLink }`) y `borrarEvento(conexion, eventId)`
  (ya borrado = éxito). Los adaptadores reciben `ConexionActiva` (credenciales + `calendarId` garantizados) y un
  callback opcional `alRotarCredenciales` (Outlook rota el refresh token en cada refresh; el adaptador no persiste nada).
- **`conexion.ts`**: `resolverConexionDeCalendario(business, { provider?, calendarId? })` (lee la fila del proveedor
  activo de `business.calendarConnections`, valida `credentials` con Zod — una fila corrupta cuenta como "sin
  credenciales" y se loguea, nunca lanza —, aplica `"primary"` en Google, admite forzar proveedor/calendario para
  cancelar un `Booking` creado con otro), `SELECT_CONEXION_DE_CALENDARIO` (spread en los `select`; incluye `id` y la
  relación con su `select` anidado), `estadoDeConexion`, y los cuatro predicados que **nombran** las cuatro semánticas de
  "conectado" que ya existían (no se unificaron): `conexionOperativa` (token y flag `!== false`: voz y job),
  `conexionConfirmada` (token y flag `=== true`: caché de voz y rutas del panel), `usaCalendarioExterno` (token y
  calendario) y `marcadaComoConectada` (solo el flag: onboarding). `guardarConexionDeCalendario` centraliza las cuatro
  escrituras de conexión (callbacks OAuth y selección) y `marcarCalendarioDesconectado(businessId, provider, modo)` la
  única implementación de "desconectar", con dos modos: `{ modo: "panel", motivo }` (rutas del panel: conserva el refresh
  token, guarda `error.message`) y `{ modo: "revocar" }` (voz y job: el token ya fue rechazado con `invalid_grant`, se
  anula). Es best-effort **pero no silenciosa**: deja un `warn` en cada desconexión y, si la BD falla, un `error` con
  proveedor, negocio, modo, motivo y el error completo (`FALLO AL MARCAR CALENDARIO DESCONECTADO`, buscable en Cloud
  Logging); siempre invalida `voice_config:<id>`, así que la siguiente llamada volverá a pasar por aquí y el fallo se
  repite en los logs en vez de perderse.
- **Cambios de comportamiento deliberados en ese PR** (los únicos): en `GET /calendar/calendars` y
  `/calendar/events/upcoming`, el marcado de desconexión pasó a best-effort (409 en vez de 500 si Postgres falla en ese
  instante) y esas rutas ahora invalidan la caché de voz (antes la voz podía seguir reservando hasta 1 h con un token
  revocado). Las asimetrías Google/Outlook preexistentes (mapeo de errores por operación, regla de día completo solo en
  Google, `selectGoogleCalendar` no resincroniza tools y `connectMicrosoftCalendar` sí, `persistirCredencialesRotadas`
  con `updateMany` por valor del token) se conservaron a propósito.
- **CalDAV / Apple (desde 2026-09-18).** Proveedor `caldav`, descriptor «Calendario de Apple» con
  `tipoDeAutorizacion: "credenciales"` y `SERVIDOR_CALDAV_ICLOUD`. Credenciales
  `{ provider, serverUrl, username, appPassword }` (Apple ID + contraseña de aplicación de appleid.apple.com),
  cifradas como las demás. `calendarId` es la **URL absoluta** del calendario y `externalEventId` la del objeto
  `.ics`. Alta sin OAuth: `POST /calendar/auth/caldav/connect` `{ username, appPassword, serverUrl? }` →
  `CalendarService.conectarConCredenciales` valida listando calendarios (401 → **400 `CALDAV_INVALID_CREDENTIALS`**
  con mensaje hablable, sin dejar conexión a medias), guarda la conexión sin calendario y devuelve
  `{ calendars, email }` con el mismo contrato que el callback de Microsoft; el panel termina con
  `POST /calendar/select` (`seleccionarCalendario` resincroniza tools para todo lo que no sea Google).
  Detalles del adaptador (`adapters/calendar/caldav/`):
  - **`fetchVigilado`**: envuelve el `fetch` que se inyecta a tsdav y convierte 401/403/429/5xx en `ErrorHttpCaldav`.
    Sin esto tsdav devuelve **lista vacía ante un 401** y una consulta de ocupación con contraseña revocada diría
    "agenda libre" (dobles reservas). 404 y 412 pasan porque borrar y crear los interpretan.
  - Crear = `PUT` con `If-None-Match: *` y UID `alhabla-<digest>@alhabla.ai`; **412 = ya existía por un reintento**
    → mismo href, sin duplicar. Borrar: 404/410 = éxito. Sin `ATTENDEE` a propósito (iCloud mandaría
    invitaciones desde la cuenta del negocio). Fechas en UTC; dos VALARM como los recordatorios de Google.
  - Ocupación: `calendar-query` con `time-range` y `expand` (si el servidor no expande, `ics.ts` expande la RRULE);
    **misma regla que Google** (cancelado no cuenta; día completo cuenta aunque sea `TRANSPARENT`; con hora y
    `TRANSPARENT` no cuenta); día completo anclado a medianoche UTC; se registran los `VTIMEZONE` del objeto
    (iCloud manda `DTSTART;TZID=…`) para que en Cloud Run (UTC) no se desplacen las horas.
  - Errores: 401/403 → `CALDAV_CALENDAR_RECONNECT_REQUIRED`; 429 → `CALENDAR_RATE_LIMITED`; 5xx/timeout →
    `CALENDAR_TIMEOUT`; resto → `*_FAILED`. `listarOcupacion` deja pasar el error crudo (el servicio degrada a
    "disponibilidad desconocida").
  - Comprobación manual sin mocks contra Radicale en Docker: `scripts/manual/caldav-e2e.mts` (receta en su
    cabecera). Contra iCloud real basta cambiar servidor/usuario/contraseña.
  - **Estado (2026-09-19):** una cuenta de iCloud real quedó vinculada con éxito **desde el panel en
    desarrollo**. Verificado en la BD de dev: fila `caldav` con `connected = true`, `calendarId` con la URL
    absoluta de iCloud (`https://caldav.icloud.com/<id>/calendars/<uuid>/`), `accountEmail` con el Apple ID y
    `credentials` como sobre `aes-256-gcm`. El Apple ID va completo, **con `@`**: sin la arroba iCloud
    responde 401 y la ruta devuelve `400 CALDAV_INVALID_CREDENTIALS`.
  - **El alta resincronizó bien los dos orquestadores.** El negocio de pruebas es `orchestrator = "telnyx"`
    (auto-promoción del rollout) y su assistant de Telnyx quedó con las seis webhook tools + `hangup`
    (`telnyxSyncedAt` seis segundos después de crear la conexión, sin `telnyxSyncError`); el LLM de Retell,
    que sigue de fallback caliente, con las siete equivalentes. Es la prueba de que `seleccionarCalendario`
    resincroniza tools en todo lo que no es Google **y** de que llega a Telnyx, no solo a Retell.
  - **Pendiente: la prueba de extremo a extremo por voz** (`check_availability` contra el calendario de Apple
    → `book_appointment` → evento en iCloud). El negocio de pruebas **no tiene número de teléfono
    provisionado** y su `subscriptionStatus` es `null`, así que la provisión está cerrada por el gate de plan
    (`modules/phone/routes.ts` exige `ACTIVE` o `TRIALING`). Ojo: **`/demo/web-call` no sirve** para esto —
    usa el agente de demo del nicho (o el genérico), no el del negocio, así que no toca su calendario.
    Vías reales, de menos a más coste, **todas contra Telnyx** (es el primary):
    1. **Probar las tools sin llamada:** `POST /v2/ai/assistants/:assistantId/tools/:toolId/test` con
       `arguments` y `dynamic_variables` (ver "Re-syncing webhook URLs"). Ejercita el webhook real, así que
       cubre el camino completo hasta iCloud; lo que no cubre es la conversación.
    2. Conectar Apple desde `/agente` en un negocio de dev que **ya** tenga número y llamarlo de verdad (hoy
       los que tienen número están con Google; hacerlo cambia su proveedor activo y se revierte reconectando
       Google).
    3. Provisionar un número en dev para el negocio de pruebas: hay que poner antes su `subscriptionStatus` a
       `ACTIVE`/`TRIALING`, y compra un número real de Telnyx.
  - Nota histórica: cuando esto se escribió, dev iba por ngrok y había que resincronizar antes de cada
    prueba porque el túnel rotaba. Desde el 2026-09-19 el hostname de dev es fijo
    (`https://dev-api.alhabla.ai`) y eso ya no hace falta.

### El panel y el proveedor activo (`frontend/src/lib/calendar-state.ts`, desde PR #82)

Las respuestas de `Business` llevan `activeCalendar` (`{ provider, connected, calendarId, accountEmail,
disconnectedAt, lastError }` del proveedor activo, sin nombres de proveedor en las claves). El frontend
tiene **una sola** regla de estado de calendario en `lib/calendar-state.ts` (`getCalendarState`,
`CALENDAR_PROVIDER_INFO`, `normalizeCalendarProvider`), que sustituyó a las cuatro copias de
`=== "outlook" ? "outlook" : "google"` repartidas por los componentes, que no sabían pintar `caldav`.
Lee `activeCalendar` y cae a los campos `google*`/`outlook*` antiguos si la respuesta todavía no lo trae.
El alta de Apple es la tarjeta «Conecta el calendario de Apple» de `/agente`
(`components/apple-calendar-connect.tsx`), con formulario en línea: Apple ID + contraseña de aplicación →
`POST /calendar/auth/caldav/connect` → selector de calendario → `POST /calendar/select`.
- **Añadir otro proveedor**: (1) id en `PROVEEDORES_DE_CALENDARIO` + tipo de credenciales en `CalendarCredentials`
  + descriptor en `DESCRIPTORES_DE_PROVEEDOR`; el código `<ID>_CALENDAR_RECONNECT_REQUIRED` aparece solo por el
  template literal; (2) clase en `adapters/calendar/<id>/`, que nunca importa prisma/redis; (3) una línea en
  `registry.ts`; (4) en `conexion.ts`, su forma en `CredencialesSchema` (Zod); (5) si no es OAuth, reutilizar
  `conectarConCredenciales` desde una ruta de alta. `CalendarService`, voiceTools, el job y el resto de rutas no
  se tocan. Doctoralia queda fuera del roadmap por decisión de producto (2026-09-18).

## Booking & Availability

### Models

- `Service` — `name`, `durationMinutes` (5–480), `active`, `deletedAt`.
- `Professional` — `name`, `active`, `deletedAt`.
- `ProfessionalService` — many-to-many link with `assignedAt` and, since 2026-09-17,
  `level: ESPECIALISTA | NO_SUGERIR`. **No row = "lo hace" (normal)**, the default for
  any active professional. Rows that predate the column were the old "especialidad"
  checkbox and keep that meaning via the column default. See § Availability for what
  each level does at booking time and § CRUD for the `serviceLevels` API contract.

### CRUD de configuración (`/booking-settings`)

Los handlers de `routes.ts` son la capa controller del proyecto; la lógica de
persistencia y sincronización vive en `service.ts`, y los contratos Zod en
`schemas.ts`. Todos los recursos se limitan al `businessId` del JWT.

- `GET`/`PATCH /` — configuración agregada y capacidad.
- `GET`/`POST`/`PATCH`/`DELETE /services/:id` — catálogo de servicios.
- `GET`/`POST`/`PATCH`/`DELETE /professionals/:id` — equipo y sus servicios.
  Contrato de niveles (2026-09-17): request acepta `serviceLevels: Record<serviceId,
  "especialista" | "normal" | "no_sugerir">` (mapa COMPLETO: reemplaza todos los
  vínculos; `"normal"` = sin fila; todos los ids se validan como del negocio aunque
  no generen fila) y, como legado, `serviceIds: string[]` (cada id = especialista;
  si vienen los dos manda `serviceLevels`). Response (`serializeProfessional`, compartido
  con `GET /business/me`) devuelve `serviceLevels` (solo filas existentes; ausencia =
  lo hace) y `serviceIds` (= solo especialistas, para clientes antiguos). Cada
  guardado dispara `syncBookingConfiguration` (caché + resync de agentes), aunque
  `availability.ts` lee los niveles de la BD en cada tool call y no depende de esa caché.

`DELETE` nunca destruye un `Service` o `Professional`: marca `deletedAt` y
`active: false`, retira solo las filas auxiliares de `ProfessionalService`,
invalida la caché de voz y resincroniza los agentes Retell no eliminados. Las citas
y llamadas conservan sus referencias históricas. `Call`, `Booking`, `Lead`,
`Transcript`, pagos y eventos Stripe no tienen CRUD público: son registros
operativos o de auditoría creados por sus flujos específicos.

### Business Schedule (`backend/src/lib/businessSchedule.ts`)

- Zod schema: `BusinessScheduleSchema` with `version: 1`, 7 days (`monday`–`sunday`), each day has `enabled` + up to 3 non-overlapping intervals (`HH:mm` format), plus **`exceptions`** (added 2026-09-17).
- **`exceptions`**: up to 120 entries `{ date: "YYYY-MM-DD", closed, intervals, label? }` for a single date — a public holiday, a bridge day, holidays, or a one-off special timetable. The exception **overrides the weekly pattern** for that date: `closed: true` shuts a day that would otherwise be open, `closed: false` replaces its intervals. Optional in the schema (`.default([])`) so schedules stored before it still parse. Edited from `/ajustes` (`BusinessHoursEditor`, "Festivos y días cerrados"); the next 12 upcoming ones are appended to the schedule string injected into the agent prompt, so the agent can say *why* there is no slot.
  - This was a real hole: 25 December is a Thursday in 2026, so the agent confirmed appointments for a closed business. The usual workaround (blocking the day in Google Calendar) did not help either — Google marks all-day events as *free* (`transparency: "transparent"`) by default and `getBusyIntervals` filtered them out. It now treats any all-day event (`start.date` present) as busy regardless of transparency.
- Default: L–V 09:00–18:00, S–D closed, no exceptions.
- `checkBusinessHours(schedule, timezone, startDateTime, durationMinutes)` converts to local time, applies the date exception if there is one, and validates against intervals.
- Returns codes: `WITHIN_BUSINESS_HOURS`, `OUTSIDE_BUSINESS_HOURS`, `CLOSED_ON_DATE`, `BUSINESS_HOURS_NOT_CONFIGURED`, `INVALID_DATE_TIME`.
- `checkBookingRestrictions(business, startDateTime, durationMinutes)` — separate from business hours: validates `Business.minAdvanceBookingMinutes`/`maxAppointmentDurationMinutes` (both optional, `null` = no restriction). Returns codes `MIN_ADVANCE_NOT_MET`, `MAX_DURATION_EXCEEDED`, `TOO_FAR_IN_ADVANCE` (booking horizon, `MAX_ADVANCE_BOOKING_DAYS` = 120 — the counterpart of the minimum notice, without which a model that got the year wrong could confirm an appointment two years out), `INVALID_DATE_TIME`. Called both by the `check_business_hours` tool (so the agent finds out before offering a slot) and by `book_appointment` itself (never trusts a prior tool call in the same conversation).

### Availability (`backend/src/lib/availability.ts`)

`checkAvailability({ businessId, schedule, timezone, bookingCapacity, startDateTime, durationMinutes, serviceIds?, professionalId? })`

1. Validates business hours first.
2. Loads **all** active professionals of the business (ordered by `createdAt`) and computes each one's tier *for the requested services* (`professionalTierFor`): `no_sugerir` if any requested service is marked NO_SUGERIR for them, `especialista` if all requested services are marked ESPECIALISTA, `normal` otherwise (no row = normal). If `professionalId` was given and is not in the list → `PROFESSIONAL_NOT_FOUND`.
   - **Client named nobody:** candidates are everyone except `no_sugerir` (they are never auto-assigned). If that leaves nobody → `NO_AVAILABLE_PROFESSIONAL` with a message saying so.
   - **Client named someone:** candidates = that person only, whatever their tier — asking for someone by name is always honoured. If their tier is `no_sugerir`, the result also carries `recommendedProfessional` (best free member of the automatic pool at that same time, with `isSpecialist`), computed even when the requested person is busy.
   - **Order among candidates** (`ordenarParaAsignar`): tier first (especialista before normal), then fewest bookings that local day (counted from the already-loaded bookings, in the business timezone — "quien tenga el día más despejado"), then sign-up order. `availableProfessionals[0]` is who gets the appointment; `specialistIds` lists which of them are specialists in everything requested.
3. Finds overlapping bookings in the time slot, using each booking's stored `durationMinutes` for overlap calculation.
4. If `bookingsInSlot >= bookingCapacity` → `CAPACITY_REACHED`.
5. Identifies busy professionals by `professionalId` from overlapping bookings and returns the free ones with `id` and `name`. If none → `ALL_PROFESSIONALS_BUSY`.
6. Otherwise → `available: true` with `availableProfessionals` (array of `{ id, name }`, in assignment order), optional `specialistIds`, optional `recommendedProfessional`, and capacity counts. `findNextAvailableSlot` applies the same tier/load ordering per candidate day and, without `professionalId`, also excludes `no_sugerir`.

## Agent Configuration

### Managed Agent Prompt (`backend/src/lib/managedAgentPrompt.ts`)

`buildManagedAgentPrompt()` assembles the prompt as a list of independent text fragments (one lookup table per axis, no branching logic) joined with blank lines — this is the pattern to follow when adding a new axis, not a template string:

- **Tone:** `warm` / `professional` / `direct`
- **Primary goal:** `bookings` / `customer_service` / `lead_capture`
- **Response style:** `concise` / `balanced`
- **Escalation:** `take_message` / `request_callback`
- **Niche instructions** (`NICHE_INSTRUCTIONS`, keyed by `BusinessType`) — one sentence per vertical about what to additionally ask when booking (e.g. peluquería asks the service type, fisioterapia asks the reason for the visit **in general terms only, no structured health data** — see below). Adding a vertical is one line here, not a code branch.

The prompt includes:
- Business identity and verified info block (`INFORMACION_VERIFICADA_DEL_NEGOCIO`, free text from `Business.businessDetails`)
- Booking restrictions, in Spanish, only if set (`minAdvanceBookingMinutes`/`maxAppointmentDurationMinutes` — see Business Type / Booking & Availability)
- Instructions to NEVER invent data, always use `check_business_hours`, verify data before `book_appointment`
- Three **Retell dynamic variable placeholders** — `{{servicios_disponibles}}`, `{{empleados}}`, `{{horario_semanal}}` — literal `{{...}}` text, not baked-in data. See "Retell Dynamic Variables" below for how they get filled in per call.

Since 2026-09-04 the prompt text itself no longer contains the business's services, professionals or schedule — only the static per-axis instructions above. That data used to be interpolated directly into the string and re-sent to Retell (`updateLlm`) on every services/professionals/schedule edit; it's now delivered fresh on every call via the inbound-call webhook instead (see below), so the synced prompt template stays constant-size regardless of how large a business's catalog grows.

**GDPR note on the fisioterapia niche instruction:** it intentionally asks for the visit reason in general terms and does not solicit medical detail. Health data has a separate legal basis under GDPR Art. 9(2)(h) for the clinic itself as data controller, but this backend does not yet reflect that category explicitly in its DPA with Retell — until it does, don't add a structured field (post_call_analysis_data or a `Booking`/`Lead` column) that captures or labels health data. Free-text mentions volunteered by the caller still land in the transcript like the rest of the conversation, under the same protection as everything else.

**Who calls `buildManagedAgentPrompt()` and pushes the result to Retell:** `syncAgentToRetell()` (see Retell Configuration) is the only path that should be used going forward — it re-fetches the business's current settings from Postgres and pushes the prompt template + `post_call_analysis_data` together (it still fetches active service names for `post_call_analysis_data`'s `requested_service_type` choices — that's a separate mechanism from the prompt text). `agentBootstrap.ts`'s `getAgentTemplateForBusinessType()` also calls it once at agent-creation time (with `DEFAULT_AGENT_SETTINGS`, no services yet) so a brand-new agent already has niche instructions instead of the fully generic default text — that bootstrap prompt is short-lived anyway, since the first `PATCH /business/me` overwrites it via `syncAgentToRetell`.

### Retell Dynamic Variables (`POST /webhooks/retell/inbound`)

Retell supports `{{variable_name}}` templating in prompts, filled in either by built-in system variables (`{{current_time_[timezone]}}`, `{{current_calendar_[timezone]}}`, `{{direction}}`, `{{user_number}}`, etc. — free, no backend code needed) or by custom variables we supply. For **inbound** calls (the only kind Alhabla receives — businesses don't make outbound calls), custom variables come from a webhook Retell calls right when the call starts, configured **per phone number** via the `inbound_webhook_url` field (`RetellAdapter.importPhoneNumber`/`createPhoneNumber`/`updatePhoneNumber`) — a *different* mechanism from the account-level `webhook_url` used for `call_started`/`call_ended`/`call_analyzed` events.

- `phone/service.ts` sets `inbound_webhook_url` to `${BASE_URL}/webhooks/retell/inbound` whenever a number is imported via `importPhoneNumber` (the Telnyx SIP-trunk path — the only one actually used in production; `createPhoneNumber`, which has Retell buy from its own US/CA inventory, also accepts it but isn't called anywhere today).
- `server.ts`'s `POST /webhooks/retell/inbound` handler verifies the signature the same way as the other Retell webhooks (`retellAdapter.validateWebhookSignature`, `x-retell-signature`), reads `call_inbound.to_number` from the payload, looks up the `Business` by `retellPhoneNumber` (`@unique` in the schema), and responds with `{ call_inbound: { dynamic_variables: {...} } }` built by `buildInboundCallDynamicVariables()` in `agentBootstrap.ts`.
- `buildInboundCallDynamicVariables()` returns exactly the three keys the prompt template references — `servicios_disponibles`, `empleados`, `horario_semanal` — computed fresh from Postgres on every call. **All Retell dynamic variable values must be strings** (no nested objects) — `horario_semanal` is Spanish prose from `formatScheduleForPrompt()` in `businessSchedule.ts`, not the raw JSON schedule.
- Failure handling is deliberately soft: an unmatched `to_number`, a missing business, or any thrown error still returns `200` with empty `dynamic_variables` rather than rejecting the call (`{ call_inbound: { reject: true } }`) — an unfilled `{{...}}` placeholder just renders as literal text, which is far less disruptive than dropping the call outright, and the prompt's "no inventes" instruction already covers gaps.
- Numbers imported before 2026-09-04 don't have `inbound_webhook_url` set and won't get this until re-imported/updated — no backfill migration was written (see [[gcp-infra-alhabla]] memory: no real customer numbers existed yet at the time, so existing test data was wiped instead of migrated).

### Agent Settings (`AgentSettingsSchema`)

Stored in `Business.agentSettings` (JSON). Parsed with Zod; falls back to `DEFAULT_AGENT_SETTINGS` on invalid data.

Includes `voiceGender: "femenina" | "masculina"` (added 2026-09, `.default("femenina")` in the
Zod schema — required so businesses with `agentSettings` saved before this field existed keep
parsing successfully instead of losing their tone/goal/style/escalation customization to the
full `DEFAULT_AGENT_SETTINGS` fallback). Edited in `/agente` via `AgentSettingsEditor`, same
generic `fields` array pattern as tone/goal/style/escalation — no registration step, matches the
"configure once, tune later" pattern already used for the rest of `AgentSettings`.
`syncAgentToRetell` resolves it to a real Retell `voiceId` via `RETELL_VOICE_ID_BY_GENDER`
(`agentBootstrap.ts`) and pushes it with `retellAdapter.updateAgent({ voiceId, ... })` whenever
`agentSettings` changes — `femenina` maps to `DEFAULT_RETELL_AGENT_CONFIG.voiceId` (the
historical default voice), `masculina` to `13ff5deb-2591-42ad-a356-63a04e524411`. `Agent.voiceId`
(Prisma) is kept in sync as the denormalized copy, same as `Agent.systemPrompt`. Voice is a
property of the Retell **Agent** object, not the LLM — unrelated to `updateLlm`/`general_prompt`.

### Agent Defaults (`backend/src/lib/agentBootstrap.ts`)

- `firstMessage`: "Hola, soy la recepcionista virtual. ¿En qué te ayudo?"
- `firstMessageMode`: `assistant-speaks-first`
- `backgroundSound`: `office`
- `backgroundDenoisingEnabled`: true
- `startSpeakingPlan` with `smartEndpointingPlan`
- Transcriber fallbackPlan to `nova-3`

### Business Type (`Business.businessType`)

The `businessType` field stores the business niche selected during registration. Supported values: `peluqueria`, `centro-de-estetica`, `salon-de-unas`, `barberia`, `fisioterapia`, `other`. It is persisted in `Business.businessType` and used by `agentBootstrap.ts` to:

- Build a readable agent display name (`buildAgentDisplayName`) that includes the niche label, making agents easy to identify in orchestrator dashboards.
- Resolve the agent template (`getAgentTemplateForBusinessType`), which builds an initial prompt already including the niche instruction (`NICHE_INSTRUCTIONS`, see Managed Agent Prompt). TTS/LLM/STT settings are still shared across all niches — only prompt content differs today.
- Sync the agent name in Retell (`syncAgentNameWithBusinessType`, cosmetic only) **and** trigger a full prompt/`post_call_analysis_data` resync (`syncAgentToRetell`) when the business type is updated via `PATCH /business/me`, since it changes both the niche instruction and `requested_service_type`'s framing.

Niche landings pass `?niche=<slug>` to `/planes` and on to `/register`, so the type can be pre-selected. If the user comes from the generic flow, the type is inferred from the `types` array returned by Google Places API (`backend/src/modules/places/service.ts`) using the keywords defined in `BUSINESS_TYPE_PLACE_KEYWORDS` (both in `backend/src/lib/businessType.ts` and `frontend/src/lib/business-type.ts`). Each niche has exactly 2 keywords; if any place type contains at least one of them, that niche is assigned. The mapping is ordered from most specific to most generic:

| Niche | Keywords |
|-------|----------|
| `barberia` | `barber_shop`, `barber` |
| `salon-de-unas` | `nail_salon`, `nail` |
| `peluqueria` | `hair_care`, `hair_salon` |
| `centro-de-estetica` | `beauty_salon`, `spa` |
| `fisioterapia` | `physiotherapist`, `health` |

The inferred type is shown for confirmation on `/register/business/niche` after the Places API step; if no type can be inferred, the user selects it manually from the list.

After confirming the business type, the user is taken to `/register/business/services`, which offers a template of common services for the selected niche (defined in `frontend/src/lib/service-templates.ts`). Services are rendered as selectable pills showing name and duration. Selected services are created via `POST /booking-settings/services`; the user can also skip this step and configure services later in `/agente`.

The next step is `/register/business/team`, where the user sets the number of employees (1–20) and booking capacity (1–50). The backend creates placeholder professionals (`Profesional 1…N`) and updates `Business.bookingCapacity`.

The final setup step is `/register/business/calendar`, where the user connects Google or Outlook Calendar (Apple/CalDAV is only offered later, from `/agente`). The frontend stores `registration_next_step` in `localStorage` before starting OAuth so `/settings` can bounce the user back into the registration flow after the provider callback. The flow always ends at `/checkout?plan=` (if a plan is pending) or `/planes?from=register` (to select one).

Onboarding texts for headings, subheadings and CTAs are dynamically selected per business type via `BUSINESS_TYPE_ONBOARDING_TEXTS` in `frontend/src/lib/business-type.ts`.

Google Places autocomplete is filtered by the country selected during registration and stored in `localStorage` under `alhabla_registration_country`. The `/register/business` page shows the country as a summary with an optional "Cambiar" link; the selector only appears when no country is saved or when the user explicitly chooses to change it. The country is sent as the `country` query param and passed to `includedRegionCodes` in `backend/src/modules/places/service.ts`.

## Onboarding Flow

The onboarding checklist lives on the dashboard (`/`). It guides the business through five setup steps:

1. **Schedule** — valid `BusinessSchedule` configured.
2. **Services** — at least one active `Service` created.
3. **Professionals** — at least one active `Professional` created.
4. **Calendar** — a calendar connected with the active provider (Google, Outlook or Apple/CalDAV): `marcadaComoConectada`, i.e. only the `connected` flag, without looking at the credentials (historical semantics of this step).
5. **Forwarding** — the business's own line is forwarded to its Alhabla number.

**The forwarding step is the only one we cannot verify directly**: it is activated on the
business's own handset with a GSM MMI code and no API reports it. It is therefore treated as done
when either the business has received **at least one call** (real proof) or the user pressed "Ya lo
he activado" (`OnboardingState.forwardingConfirmedAt`). Its `status` also gates the UI:

| `forwarding.status` | When | UI |
|---|---|---|
| `waiting_number` | `phoneNumberStatus` is not `active`, or no number yet | Step shown but not actionable ("Disponible en cuanto tu número esté activo"). Telnyx takes a few minutes to approve a Spanish number, and the checklist copy redirects that wait to the other steps. |
| `ready` | Number active, no calls yet, not confirmed | Step is the highlighted action; `CallForwardingCard` on the dashboard shows the MMI codes with the real number substituted. |
| `done` | First call received, or user confirmed | Step complete; the card disappears. |

### Backend (`backend/src/modules/onboarding/routes.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/business/me/onboarding` | Computes step completion live from business data and returns progress, dismissed/completed timestamps, `isActive` and the `forwarding` object above. |
| `POST` | `/business/me/onboarding/dismiss` | Persists `dismissedAt`. |
| `POST` | `/business/me/onboarding/complete` | Persists `completedAt`. |
| `POST` | `/business/me/onboarding/confirm-forwarding` | Persists `forwardingConfirmedAt` — the user's word, not a verification. |
| `POST` | `/business/me/onboarding/forwarding/check` | «Comprobar desvío»: origina una llamada real desde el número de Alhabla a la línea de clientes (202 con `{ id, linea, startedAt, resultado, resueltaAt }`). Ver § Telefonía. |
| `GET` | `/business/me/onboarding/forwarding/check/:id` | Estado de esa comprobación (polling del panel); 404 si no es del negocio del token o ya caducó. |

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

Defined in `frontend/src/app/globals.css`. The site was redesigned in agosto 2026
(commit `eeab7f4`) from the old green palette to a black/white/purple system — the
values below are the current ones; any green token found in older docs is stale.

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#ffffff` | Body background (flat white, no gradients) |
| `--foreground` | `#0a0a0a` | Main text color |
| `--surface` | `#ffffff` | Card/panel backgrounds |
| `--surface-soft` | `#fafafa` | Second-level surfaces, hovers, sticky bars |
| `--border` | `#e5e5e5` | Default hairline borders |
| `--muted` | `#52525b` | Secondary text, descriptions (7.5:1 on white — AA) |
| `--accent` | `#0a0a0a` | Primary buttons, headings, emphasis |
| `--accent-strong` | `#262626` | Hover states on primary elements |
| `--accent-soft` | `#a78bfa` | Light purple accents |
| `--purple` | `#8b5cf6` | Brand accent: focus rings, links, selected states |
| `--purple-strong` | `#7c3aed` | Purple hover |
| `--purple-wash` | `#f3eeff` | Badge/icon tile backgrounds |
| `--purple-ink` | `#6d28d9` | Text on purple-wash surfaces |
| `--purple-ring` | `#ddd6fe` | Subtle purple rings |
| `--success` | `#2c7334` | Success states, connected indicators |
| `--warning` | `#9f7a15` | Warning states |
| `--error` | `#c53030` | Error states, validation failures |

Consume tokens through CSS variables or Tailwind utilities — do not hardcode
near-duplicate hex values. The old green palette (`#eef2eb`, `#1e2b22`, `#b8d96e`…)
is gone from `frontend/src`; the values above win on conflict.

### Accessibility Baseline

`PRODUCT.md` commits the project to **WCAG 2.1 AA**, which the European Accessibility Act makes
non-optional for a service sold online in the EU. Concretely:

- Text contrast ≥ 4.5:1 (≥ 3:1 for large text). Compute it, don't eyeball it — several colours in
  this palette look fine and fail.
- Every interactive control is at least 44px tall. Inline links inside prose are exempt.
- Body text never drops below 14px. 12px is for badges and column headers only.
- Focus is always visible (`focus-visible` ring in `#8b5cf6` — see `.field`).
- Modals need `role="dialog"`, `aria-modal`, a focus trap and body scroll lock.
- Anything driven by audio needs a non-audio equivalent.

### Base Classes

| Class | Purpose | Key properties |
|-------|---------|----------------|
| `.panel` | Card/container | `rounded-3xl`, `bg-white`, border `#e5e5e5`, `shadow-none` |
| `.field` | Text inputs | `rounded-full`, `h-11`, border `#e5e5e5`, focus `border/ring #8b5cf6` |
| `.btn-primary` | Primary action | `rounded-full`, `h-12`, `bg-[#0a0a0a]`, white text, hover lift |
| `.btn-secondary` | Secondary action | `rounded-full`, `h-12`, white bg, `border-[#0a0a0a]` |
| `.btn-purple` | Brand accent action | `rounded-full`, `h-12`, `bg-[#8b5cf6]`, hover `#7c3aed` |
| `.badge-soft` | Status badges | `rounded-full`, `bg-[#f3eeff]`, text `#6d28d9`, ring `#ddd6fe` |

### Styling Rules

- **Border radius:** `rounded-3xl` for panels, `rounded-xl` for cards and icon tiles,
  `rounded-lg` for small square controls, `rounded-full` for buttons, fields, badges
  and nav pills.
- **Shadows:** minimal — `.panel` is `shadow-none` with a hairline border; the ambient
  purple-tinted glow (`0 8px 24px rgba(0,0,0,0.06)` + purple halo, see `globals.css`) is
  reserved for specific highlighted elements. Don't add heavy drop shadows.
- **Typography:** Reserve `font-semibold` for H1/H2/H3, card titles, CTAs and key figures. Use
  `font-normal` for body text and descriptions.
- **Tracking:** `-0.02em` on headings (floor `-0.04em`), max `0.12em` on uppercase labels. Anything
  from `0.15em` up reads as texture, not words.
- **No eyebrows.** Do not put an uppercase label above a heading ("Cómo te ayuda", "Precios",
  "Sin letra pequeña"). The heading carries its own weight. A badge is fine when it adds
  information the heading doesn't — "Google Calendar" names the integration — but not when it just
  announces the section.
- **Backgrounds:** flat white (`#ffffff`) — the old green radial-gradient body is gone.
  Second-level surfaces use `#fafafa` (hovers, sticky bars).
- **Icons:** Lucide React icons in a `rounded-xl` tile with `bg-[#f3eeff]` and `text-[#8b5cf6]`
  (purple system, not the old green).
- **Black is the primary surface color:** primary buttons and headings are near-black
  (`#0a0a0a`); purple (`#8b5cf6`) is the single brand accent. Don't introduce additional
  accent colors.

### Component-Specific Notes

- **`HeroConversation` widget:** uses the purple system (`#8b5cf6`, `#f3eeff`) — never green
  or orange.
- **Checkout:** container has `min-h-[480px]` to prevent empty-state collapse.
- **`AppShell` header:** sticky, `bg-[#fafafa]/80` with `backdrop-blur-xl`.
- **`MobileNav`:** closes on Escape and on outside pointerdown, restores focus to the toggle, and
  locks body scroll while open.
- **Skip link:** `SiteLanding`'s "Saltar al contenido" targets `#contenido` (the wrapper around
  `LandingHero`), not `#main-content` — the `<main>` contains the link, so it skipped nothing.

## Content & Evidence Rules

Alhabla is **pre-launch: there are no paying customers.** `PRODUCT.md` holds the full record. For
any user-facing copy:

- Never fabricate testimonials, customer logos, "X negocios confían" counts, own product metrics,
  awards or press mentions about Alhabla. None exist.
- Every published figure needs an external, verifiable source rendered on screen, the way
  `SectorDataSection` does. The stats in `niche-landings.ts` and `generalSectorData` follow this.
- The quotes in `niche-landings.ts` are business owners interviewed in the press **about the
  problem**, not Alhabla customers. Do not present them as testimonials.
- Do not promise capabilities that do not ship. As of 2026-09 there **is** a real voice picker —
  `AgentSettingsEditor` in `/agente` lets the business choose `femenina`/`masculina`
  (`AgentSettings.voiceGender`, see Agent Configuration below) — but it is exactly two options,
  not "choose your voice" or a voice library; copy must not overclaim beyond that. Onboarding is
  self-service, so copy must not promise a human configuring things with the customer.
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
- **Path aliases:** Backend uses `"@/*"` → `"./*"` (relative to `backend/src/`). Frontend uses `"@/*"` → `"./src/*"`.
- **Types:** Prefer explicit types on Fastify route generics (`Body`, `Params`, `Querystring`). Use `z.infer<typeof Schema>` for request shapes.
- **Null handling:** Prefer `??` for defaults. Be defensive with external API responses.
- **Logging:** Use `fastify.log` inside routes, `console.log`/`console.error` in startup code and workers. Prefix logs with the module name in brackets, e.g. `[Agent]`, `[Calendar]`, `[Job]`.

## Testing

The project uses **Vitest** for backend testing.

- **Config:** `backend/vitest.config.ts` — Node environment, includes `backend/tests/**/*.{test,spec}.ts` (excludes `backend/tests/integration/**`), setup file `backend/tests/setup.ts` (loads `backend/.env.test`).
- **Coverage:** V8 provider, reports text/html/lcov. Excludes `node_modules/`, `dist/`, `frontend/`, `backend/tests/`.
- **Mocking:** `backend/tests/helpers/prismaMock.ts` provides a `createPrismaMock()` factory. MSW is available for HTTP mocking.

### Integration tests (`backend/tests/integration/`)

Separate suite (`npm run test:integration`, config `backend/vitest.integration.config.ts`) that runs against **real** Postgres and Redis — the same ones `docker compose --profile dev up` already starts, not `@testcontainers/postgresql` (deliberately not used — see `backend/tests/integration/setup.ts`). Isolation without spinning up new containers:

- Postgres: separate database `alhabla_test` on the same server (create once with `CREATE DATABASE alhabla_test;`, then `DATABASE_URL=... npx prisma migrate deploy`).
- Redis: same instance, different logical DB index (`/1` instead of `/0`).
- `backend/.env.test` (gitignored) holds both connection strings. On this project's dev machine, Postgres is reachable at `localhost:5433`, not 5432 — a native Homebrew Postgres occupies 5432 on the host.
- `backend/tests/integration/helpers/db.ts` exposes `resetDb()` (deletes in FK-safe order + `redis.flushdb()`) — call it in `beforeEach`.
- Requires `docker compose --profile dev up -d` running; does not start Postgres/Redis itself.
- Pattern for external APIs (Retell/Telnyx/Stripe/Google/Microsoft): mock the adapter module boundary (e.g. `vi.mock("../../../src/modules/calendar/service.js", ...)`) rather than intercepting HTTP with MSW, when the external API isn't what the test is actually verifying.

### Test Files

| File | Coverage |
|------|----------|
| `backend/tests/adapters/retell/webhookHandlers.test.ts` | `call_started`, `call_ended`, `call_analyzed` handlers |
| `backend/tests/adapters/retell/RetellAdapter.test.ts` | Create/update/delete agents and LLMs, phone numbers, health check |
| `backend/tests/lib/availability.test.ts` | Availability logic (hours, professionals, capacity, overlaps, busy professional detection) |
| `backend/tests/lib/businessSchedule.test.ts` | Schedule schema validation, checkBusinessHours |
| `backend/tests/lib/businessType.test.ts` | Business type detection from Google Places `types`, normalization |
| `backend/tests/modules/auth/routes.test.ts` | Login, register, register-first-user, Google OAuth URL |
| `backend/tests/modules/billing/service.test.ts` | Stripe event handling, billing summary, checkout session, reconciliation |
| `backend/tests/modules/phone/service.test.ts` | Phone provisioning idempotency, async order polling/resume, partial failure handling, status retrieval |
| `backend/tests/modules/calendar/service.test.ts` | Google/Outlook/CalDAV booking, upcoming events, cancel, sync tools to agents, invalid_grant detection, timeout/rate-limit classification, `listarCalendarios`/`seleccionarCalendario`/`conectarConCredenciales` |
| `backend/tests/modules/calendar/conexion.test.ts` | Resolver de conexión sobre filas de `calendar_connections` (proveedor activo, defaults, credenciales corruptas, caché antigua sin filas), los cuatro predicados de "conectado", `marcarCalendarioDesconectado` (modos panel/revocar, fallo de BD → log de error con identificadores, fallo de Redis), `guardarConexionDeCalendario` (nested upsert exacto por cada caller), `actualizarCalendarioDeConexion`, rotación de credenciales por id y por valor, `serializarBusiness`/`camposDeCalendarioParaElPanel`. Fixtures compartidas en `tests/helpers/conexionDeCalendario.ts` |
| `backend/tests/adapters/calendar/caldav/ics.test.ts`, `CaldavCalendarProvider.test.ts` | iCalendar ↔ dominio (UID determinista, escapado, alarmas, día completo, TRANSPARENT, cancelado, RRULE, TZID+VTIMEZONE) y adaptador con tsdav mockeado (Basic auth, If-None-Match/412, 404 al borrar, mapeo de errores, `fetchVigilado`) |
| `backend/tests/lib/cifradoDeCredenciales.test.ts` | Sobre AES-256-GCM: ida y vuelta, IV aleatorio, manipulación y clave distinta fallan, clave ausente/corta falla explícitamente |
| `backend/tests/modules/businesses/me.test.ts` | Contrato de `GET /business/me` con el panel: campos de calendario históricos calculados desde las filas, nunca `calendarConnections` ni credenciales |
| `backend/tests/adapters/calendar/errors.test.ts`, `registry.test.ts` | Códigos de reconexión, duck typing de `CalendarBusinessError`, resolución de proveedor desde un error (null si desconocido), registro de adaptadores |
| `backend/tests/modules/voiceTools/service.test.ts` | `book_appointment` call-linking (callId vs. most-recent-call fallback) |
| `backend/tests/adapters/telnyx/TelnyxAdapter.test.ts` | Search, purchase (order), poll order, release, fetch Telnyx numbers |
| `backend/tests/plugins/auth.test.ts` | Auth plugin (valid token, missing header, invalid token) |

## Security Checklist

- **JWT_SECRET** is mandatory — the server refuses to start without it.
- CORS is restricted to the exact `APP_URL`, `WEB_URL` and `EXTRA_ALLOWED_ORIGIN` origins (`lib/urls.ts › origenesPermitidos`).
- Rate limiting is active globally (100 req/min per IP, Redis-backed) and raised for Retell webhooks (300 req/min). Places endpoints use 10/min. Internal job routes (`/internal/jobs/*`) are exempt.
- Retell webhook signatures are verified via `retellAdapter.validateWebhookSignature` using the Retell API key. This also applies to the Retell custom tool endpoints (`/webhooks/retell/tools/:retellAgentId/:toolName`).
- Stripe webhook signatures are verified in the route handler before calling `handleStripeEvent` (route uses `rawBody: true`).
- Raw body parsing is enabled only on the Retell and Telnyx webhook routes to avoid memory overhead on regular routes.
- Business-scoped queries must always filter by `request.user.businessId`. Do not accept a `businessId` from the body for reads/writes.
- Never commit `.env` — it is listed in `.gitignore`.

### Implementation Notes

- **`DELETE /recordings/:id`** es un borrado lógico: establece `deletedAt` y la oculta de las lecturas del negocio, sin borrar el objeto de R2/S3 ni la fila histórica. La purga física de audio debe quedar en una política de retención explícita, no en una acción de UI.
- **`PATCH /business/me`** rebuilds the managed agent prompt and synchronizes it to every agent via `syncAgentToRetell` (see Retell Configuration).
- **Onboarding flow:** `backend/src/modules/onboarding/routes.ts` exposes `GET /business/me/onboarding`, `POST /business/me/onboarding/dismiss` and `POST /business/me/onboarding/complete`. The `/agente` page consumes these endpoints to show/persist the setup guide state. Step completion is computed live from business data; only `dismissedAt`/`completedAt` are persisted.

## Common Tasks

### Add a new backend route module

1. Create `backend/src/modules/<domain>/routes.ts` exporting an `async function <domain>Routes(fastify: FastifyInstance)`.
2. Import and register it in `backend/src/server.ts` with an optional prefix.
3. Use `zod` for validation and `prisma` for DB access.
4. If the route requires authentication, add `onRequest: fastify.authenticate` or `preValidation: [fastify.authenticate]` to the route options.
5. Always filter business-scoped queries by `request.user.businessId`.

### Add a new Prisma model

1. Edit `backend/prisma/schema.prisma`.
2. Run `npm run prisma:migrate` to create a migration.
3. Run `npm run prisma:generate` to update the TypeScript client.
4. Use the new model in your module.

### Add a new environment variable

1. Add it to `.env.example` with a placeholder value and a comment.
2. Add it to `docker-compose.yml` in both `backend` and `backend-dev` services so it is forwarded into containers.
3. Read it via `process.env.VAR_NAME` in code. Do not provide real defaults for secrets.

### Run Prisma Studio

```bash
cd backend

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

## Lista de ramas por componente

Convención ligera desde 2026-09-07: cuando queda pendiente pulir o rediseñar un
componente concreto sin tocarlo todavía, se abre una rama con su nombre y se
apunta aquí — un sitio único para saber dónde vive ese trabajo futuro cuando
se retome. La rama no tiene por qué llevar commits desde el principio; puede
partir vacía de `main` como marcador.

| Rama | Componente | Issue | Notas |
|------|-----------|-------|-------|
| `step-followups-landing` | `frontend/src/components/call-forwarding-flow.tsx` + tarjetas `threeSteps` en `site-landing.tsx` (sección "Cómo funciona") | [#12](https://github.com/MMARTID/botbook/issues/12) | Pulir y/o rediseñar el recorrido de 3 pasos. |
| `demo-modal-landing` | Modal/experiencia de "Escuchar una llamada" del hero (`DemoVoiceCall`) | — | Pulir y/o rediseñar la demo de llamada de voz que se abre desde la landing. Sin Issue todavía. |
| `telnyx-whatsapp-calls` | Llamadas de voz por WhatsApp vía Telnyx — distinto de la mensajería de texto ya existente (`WhatsAppAdapter`, `jobs/sendWhatsapp.ts`, plantillas de confirmación/recordatorio) | — | **Descartado** el 2026-09-19 (ver `PLAN-CANAL-DUENO.md` v3). `PLAN-WHATSAPP-LLAMADAS.md` queda en `main` solo como referencia. Rama sin trabajo; borrar cuando se confirme. |

Al abrir el Issue correspondiente, añade su número en la columna "Issue". Al
fusionar o descartar una rama, quita su fila de esta tabla.

## Deployment Notes

### Automated CI/CD (GitHub Actions) — added 2026-09-04

- **`.github/workflows/ci.yml`** — on every PR and every push to `main`: backend
  (`typecheck`/`lint`/`test`), **backend integration** and frontend (`lint`/`test`/`build`, which
  also type-checks — there is no `typecheck` script in `frontend/package.json`) run as three
  parallel jobs. Test-only, never deploys.
  - The **integration** job (added 2026-09-19) runs `npm run test:integration` against real
    Postgres and Redis service containers, after `npx prisma migrate deploy` creates the schema.
    That suite existed for a while but **nothing ran it** — only the unit tests were gated, so the
    one layer that exercises the real schema and transactions was only ever checked by hand.
    Locally it reads `backend/.env.test` (gitignored); in CI the values come from the job's `env`,
    which wins because `tests/integration/setup.ts` loads dotenv **without** `override`. CI uses
    port 5432 where local uses 5433: that 5433 only exists to dodge Homebrew's Postgres, which
    holds `127.0.0.1:5432` on the dev machine and answers `P1010` to these credentials.
  - The **diff** job (pull requests only, added 2026-09-19) reads the PR's own diff rather than
    the code:
    - **Destructive migrations fail the PR.** `cloudbuild.yaml` applies migrations *before*
      traffic switches, so during a deploy the new schema coexists with the old revision. A
      `DROP COLUMN`/`DROP TABLE`/`RENAME`/`SET NOT NULL` shipped alongside the code that stopped
      using the column breaks that old revision while the switch happens — the expand/contract
      rule (two deploys: stop using it, then drop it) that until now lived only in whoever
      learned it on the calendar migrations. To ship it deliberately, label the PR
      `migracion-contract` or put `contract-migration: ok` in a commit message.
    - **A warning when one PR touches frontend and backend.** Vercel publishes the frontend on
      merge while the backend still has to build, migrate and roll out a revision, so a frontend
      that depends on something new can be live first. It never blocks — the window is short and
      the risk occasional.
- **`.github/workflows/deploy-backend.yml`** — on push to `main` only: a `test` job (same backend
  checks, kept as an independent pre-deploy gate on purpose, not just a dependency on `ci.yml`)
  must pass before the `deploy` job runs `gcloud builds submit --config cloudbuild.yaml
  --substitutions=_TAG=<commit sha>` then `gcloud run deploy alhabla-api --image=...:<sha>`, then
  curls `/health` to confirm (three attempts, for cold starts).
  Two steps were added on 2026-09-19:
  - **Automatic rollback.** The job records the serving revision *before* deploying and, if
    `/health` never answers ok, sends 100% of traffic back to it. Without this a revision that
    doesn't come up keeps serving everything while the workflow sits red — the failure is visible
    on GitHub but production stays broken until a human notices. The revision is captured
    beforehand rather than derived afterwards as "the second newest": if the deploy fails without
    creating a revision, the second newest is two deploys old and rolling back to it would undo
    more than the bad deploy.
  - **Propagating agent behaviour.** If the push touches `lib/managedAgentPrompt.ts` or
    `lib/telnyxAssistantPayload.ts`, the job forces the `telnyx-reconciler` Cloud Scheduler job
    instead of waiting for its daily 04:00 pass, and prints a warning that the **Retell fallback
    is still manual** (`scripts/syncManagedAgentPrompts.ts`). It never fails the deploy: if the
    trigger is refused (the CI service account needs `roles/cloudscheduler.jobRunner`), the
    daily pass will reconcile anyway. This exists because a deploy changes the code that *runs*
    tools but not the prompt and tool URLs **baked into each assistant at the provider** — on
    2026-09-19 a prompt fix had to be pushed to production by hand for exactly this reason. Runs on merges to `main` that touch `backend/**` (or the
  workflow itself) — since 2026-09-17 a `paths` filter skips frontend-only and docs-only
  merges, which used to request a manual production approval to rebuild an identical image.
  The `production` environment **no longer requires manual approval** (removed 2026-09-19; the
  branch policy stays, so only protected branches deploy). It had required approval from MMARTID
  since ~2026-09-15, and with `cancel-in-progress: false` a run left in `waiting` held the queue
  for every later push — on 2026-09-19 one sat for 1h46m and blocked the two behind it. The gate
  is now the `test` job plus the automatic rollback below, which catch more than a human clicking
  approve on a diff they already reviewed in the PR. **Removing the reviewers fails any run that
  was already waiting** (that is how the deploy for PR #88 ended, at 2h08m); the next merge
  redeploys the same code, so nothing is lost, but it is worth knowing before touching this
  setting again.
  **Neither web is deployed by this workflow** — Vercel's own Git integration handles both
  projects: `alhabla-frontend` (Root Directory `frontend`, domain `app.alhabla.ai`) and
  `alhabla-web` (Root Directory `web`, domains `alhabla.ai` + `www` → 308 to `alhabla.ai`),
  split on 2026-09-21 (`PLAN-APP-DOMINIO.md`). DNS lives in Cloudflare (proxied CNAMEs to the
  project's `*.vercel-dns-017.com` target). `alhabla.ai` answers every app route with a 301 to
  `app.alhabla.ai` (`web/next.config.mjs`), which is what keeps the Meta template URL buttons
  (`alhabla.ai/ajustes/{{1}}`) and old emails working. Backend URLs: `APP_URL`
  (`https://app.alhabla.ai`), `WEB_URL` (`https://alhabla.ai`), `FRONTEND_URL` kept equal to
  `APP_URL` as a fallback. Vercel env: the app has `NEXT_PUBLIC_WEB_URL`; the web has
  `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_BASE_URL` (production →
  `api.alhabla.ai`, preview → `dev-api.alhabla.ai`, same rule as the app). The Vercel MCP token
  cannot write to the team; the `vercel` CLI session (`--scope mmartids-projects`) and the REST
  API with its token can. The web project rejected `next-mdx-remote` 5 as vulnerable (Vercel's
  build-time check): keep it on 6. Rollback of the cut: move `alhabla.ai` back to
  `alhabla-frontend` in Vercel and set `APP_URL`/`FRONTEND_URL` back to `https://alhabla.ai`.
  - **Preview deployments point at the dev backend, not production** (fixed 2026-09-19).
    `NEXT_PUBLIC_API_BASE_URL` used to be a single Vercel entry targeting `production` **and**
    `preview`, so every PR preview talked to `https://api.alhabla.ai` — clicking through a
    preview (registering, creating a business, saving a schedule) wrote to the **production
    database**, which is part of how production accumulated accounts nobody meant to create.
    There are now two entries: `production` → `https://api.alhabla.ai`, `preview` →
    `https://dev-api.alhabla.ai`. A preview therefore needs the Cloudflare tunnel up
    (`docker compose --profile dev up`) to work; the build still succeeds without it, the calls
    just fail. The accidental mitigation that was already there:
    `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is production-only, so checkout in a preview breaks
    rather than charging anyone.
  - **Four variables were deleted from Vercel** the same day because no file under `frontend/`
    referenced them: `GOOGLE_CLIENT_SECRET` (which Vercel itself flagged `readable-secret`),
    `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` and `FRONTEND_URL`. Those belong to the backend and
    live in Secret Manager. The three `NEXT_PUBLIC_VAPI_DEMO_*` entries are unused too (the
    landing demo runs on Retell now) but were left alone.
- **Auth: Workload Identity Federation, no stored keys.** A dedicated service account
  (`github-actions-ci@project-84381467-a606-4b71-a6e.iam.gserviceaccount.com`, least-privilege —
  deliberately *not* the default Compute Engine SA that Cloud Run/Cloud Build use for everything
  else) is impersonated via a WIF pool (`github-pool`) + OIDC provider (`github-provider`)
  restricted to the `MMARTID/botbook` repo (`attribute.repository` condition on the IAM binding,
  plus `attribute_condition: assertion.repository_owner == 'MMARTID'` on the provider itself —
  belt and suspenders). No GitHub secret holds a GCP key. Exact roles granted and why: Second
  Brain "Runbook de despliegue a producción" § CI/CD automático and memory `ci-cd-pipeline-setup`.
- **`backend/cloudbuild.yaml` gained a `_TAG` substitution** (default `latest`) so CI can tag each
  deploy with the commit SHA instead of always overwriting `:latest` — avoids ambiguity if two
  builds ever overlap. Manual builds (`gcloud builds submit --config cloudbuild.yaml .` with no
  `--substitutions`) are unaffected, still publish `:latest` exactly as before.

- The `backend/Dockerfile` has 5 stages: `base`, `deps`, `builder`, `runtime`, `development`.
- Production image runs `node dist/server.js` (compiled output).
- Development image runs `npx tsx watch backend/src/server.ts` over a volume-mounted source tree.
- Health check endpoint at `GET /health` probes Postgres, Redis and (when `RETELL_API_KEY` is set) Retell. Returns `200` if all healthy, `503` if degraded.

### Local development (Docker Compose)

- `docker-compose.yml` uses profiles: `--profile dev` for local development, `--profile prod` for a production-like runtime locally.
- **Webhooks reach the local backend through a named Cloudflare tunnel on a fixed hostname, `https://dev-api.alhabla.ai`** (`cloudflared` service, `dev` profile). `BASE_URL` in `.env` is that hostname and is the single source of the public URL (`getPublicWebhookBaseUrl`, `lib/serverUrl.ts`) — nothing is auto-detected at runtime any more.
- **Why it stopped being ngrok (2026-09-19).** ngrok's free tier rotates its hostname on every container restart. The URL is *baked in* when an agent or assistant is synced, so after a restart every Call Control App webhook and every tool URL still pointed at the dead tunnel and **failed silently** — nothing in `/health`, `telnyxSyncError` or the logs says so, and the agent just stalls mid-call. Verified on 2026-09-19: all 7 dev assistants were pointing at two different dead tunnels, and the dev Call Control App webhook at a third. A fixed hostname removes the whole class of bug: register once, valid forever. `lib/ngrok.ts` and `config/serverConfig.ts` were deleted.
- **One-time setup** (the hostname and the token outlive any reinstall): in Cloudflare Zero Trust › Networks › Tunnels create a tunnel, add a public hostname `dev-api.alhabla.ai` routed to `http://backend-dev:3000`, and put its token in `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. DNS for `alhabla.ai` is already on Cloudflare, so the record is created for you. The token does not expire and carries the routing inside it, so `docker compose --profile dev up` needs nothing else.
- **After changing `BASE_URL`** (only when moving to a different hostname), re-sync once so the providers learn it — see "Re-syncing webhook URLs".

### Production (Google Cloud Run)

Live since 2026-09-01. **One Cloud Run service, `alhabla-api`** (`node dist/server.js`, `backend/Dockerfile` `runtime` stage), public traffic, normal autoscaling (0→N), public URL `https://api.alhabla.ai` — see [[gcp-infra-alhabla]] memory for the actual project ID, resource names and exact `gcloud` commands used.

Until 2026-09-03 there was a second always-on `alhabla-worker` service (`node dist/workers.js`, `--min-instances=1 --no-cpu-throttling`) dedicated to BullMQ background workers, because Cloud Run only allocates CPU during an HTTP request by default and would otherwise starve a long-running worker process. It was deleted after migrating background jobs from BullMQ to **Cloud Tasks** (see Background Jobs above) — jobs are now HTTP requests to `alhabla-api` itself, so Cloud Run's normal per-request CPU allocation is enough and no dedicated always-on service is needed.

Supporting infra:
- **Cloud SQL** (Postgres 15) — reached via Unix socket (`--add-cloudsql-instances`), not a network host. `DATABASE_URL` is a Secret Manager secret formatted as `postgresql://user:pass@localhost/db?host=/cloudsql/PROJECT:REGION:INSTANCE` — never a plain env var, since it embeds the DB password.
  - **Pending (2026-09-17 audit):** the URL sets no `connection_limit`, so Prisma opens `cores×2+1` connections **per Cloud Run instance**. Under autoscaling that can exhaust Cloud SQL's `max_connections` before any query is slow. Add `&connection_limit=5` (and `&pool_timeout=10`) to the secret and check it against the instance tier — it is a secret edit, so it has to be done by hand in Secret Manager.
- **Memorystore** (Redis) — private IP only, reachable from Cloud Run through a Serverless VPC Access connector (`--vpc-connector`). Cloud SQL doesn't strictly need the connector (Cloud SQL Auth Proxy works over its own mechanism), but Memorystore does.
- **Secret Manager** — every sensitive value (`JWT_SECRET`, `STRIPE_SECRET_KEY`, API keys, `DATABASE_URL`, etc.) is injected via `--set-secrets`, not as a plain `--set-env-vars` value.
- **R2 recordings bucket is private** (RGPD — real customer call audio). Playback URLs are generated on demand by `getSignedRecordingUrl()` (`storage.ts`, `@aws-sdk/s3-request-presigner`, 1h expiry) when the frontend requests a recording — never stored in the DB (a stored presigned URL would eventually expire). `R2_REGION` must be one of R2's location codes (`auto`, `weur`, `eeur`, ...) — a literal `"eu"` is rejected by the SDK.
- **Image build:** via `gcloud builds submit` (Cloud Build), not local `docker build`. On Apple Silicon, a local build without `--platform=linux/amd64` produces an arm64 image Cloud Run rejects outright; Cloud Build's workers are amd64-native and sidestep it entirely. Needs a `cloudbuild.yaml` with an explicit `--target runtime` — without it, a multi-stage Dockerfile builds its *last* stage by default, which here is `development`.
- **IAM:** this project's default Compute Engine service account (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) is reused for both Cloud Build and Cloud Run revisions, and starts with zero roles on a fresh project. Needs `roles/cloudbuild.builds.builder`, `roles/storage.objectViewer`, `roles/artifactregistry.writer` (build-time) and `roles/secretmanager.secretAccessor`, `roles/cloudsql.client` (runtime) granted explicitly.

### Alertas (Cloud Monitoring)

Set up on 2026-09-17 after two days of `process-recording` failing every ten seconds
with `/health` and CI both green: **`/health` only proves Postgres, Redis and Retell
answer — it says nothing about jobs, queues or 5xx rates.** All three policies notify
the email channel *"Alhabla · avisos de producción (correo)"* (`miguel.zero.admin@gmail.com`,
same inbox as `TELNYX_ALERT_EMAIL`); change the address in Monitoring › Alerting ›
Notification channels, not in code.

| Policy | Condition | Why this threshold |
|---|---|---|
| **alhabla-api · errores 5xx** | `run.googleapis.com/request_count` with `response_code_class=5xx`, summed over 5 min, **> 10** | The 15–17 Sep loop produced 29–30 per 5 min; a healthy day produces 0. Replayed against that day's data: would have fired continuously until the fix deployed. |
| **Cloud Tasks · cola que no baja** | `cloudtasks.googleapis.com/queue/depth`, any queue, 5-min mean **> 200 for 15 min** | Queues drain in seconds at current traffic; a queue that grows is a task failing in a loop. Same incident peaked at ~9,000. |
| **alhabla-api · /health caído** | Uptime check `alhabla-api-health-tJzyQ7cVqx8` (HTTPS `api.alhabla.ai/health` every minute from 6 regions, must contain `"status":"ok"`) failing from **more than one region for 60 s** | One region failing is usually the checker; two is us. |

Resource ids (project `project-84381467-a606-4b71-a6e`): channel
`notificationChannels/3301523917747931516`, policies `14798085137940900180` (5xx),
`8824325884392888489` (queue), `14275085039933176867` (uptime). List with
`gcloud alpha monitoring policies list` / `gcloud monitoring uptime list-configs`.

**When one fires:** the policy's own documentation (visible in the email) says what to
look at first. The habit that would have caught the September loop on day one: after
any deploy, check response codes per revision (`gcloud logging read ... httpRequest.status>=500`)
and the queues (`gcloud tasks list --queue=<q> --location=europe-west1`), not just `/health`.

**Side effect worth knowing:** the uptime check hits `/health` ~6 times a minute, which
keeps at least one Cloud Run instance warm most of the time — fewer cold starts for real
callers, at the cost of a few thousand trivial requests a day.

### Propagating a tool-schema or prompt change to existing agents

A deploy alone does not touch the agents already created in Retell/Telnyx.
- **Telnyx**: automatic. `syncAgentToTelnyx` hashes the whole assistant payload (prompt +
  tools); the reconciler (`jobs/telnyxReconciler.ts`, Cloud Scheduler `telnyx-reconciler`,
  daily 04:00, 200 assistants per pass) and every professional/service/schedule save push
  the new payload. A rejected schema lands in `Agent.telnyxSyncError` (reconciler email +
  panel) — check it is null after the deploy.
- **Retell**: run `scripts/syncManagedAgentPrompts.ts` **against production** after the
  deploy (prompt + tools, strict tool verification when `NODE_ENV=production`). The script
  reads its configuration from the shell environment — not from `.env` — so with the local
  `.env` it would sync the *dev* agents and register tool URLs pointing at the dev tunnel. The dev
  backend runs in Docker, so the host has no `tsx`: use `npx tsx`. Recipe (run by a human;
  reading these secrets is blocked for Claude Code):
  ```bash
  # 1. Cloud SQL proxy (see § Producción for the socket-path trap)
  mkdir -p /tmp/cloudsql && cloud-sql-proxy --unix-socket=/tmp/cloudsql project-84381467-a606-4b71-a6e:europe-west1:alhabla-db &
  # 2. Production environment, in this shell only. TELNYX_API_KEY is needed too: the
  #    script ends by syncing Telnyx tools, and without the key every Telnyx business is
  #    reported as an error and gets telnyxSyncError written (harmless — the reconciler
  #    clears it — but noisy).
  export DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL --project=project-84381467-a606-4b71-a6e | sed 's#/cloudsql/#/tmp/cloudsql/#')" \
         RETELL_API_KEY="$(gcloud secrets versions access latest --secret=RETELL_API_KEY --project=project-84381467-a606-4b71-a6e)" \
         TELNYX_API_KEY="$(gcloud secrets versions access latest --secret=TELNYX_API_KEY --project=project-84381467-a606-4b71-a6e)" \
         BASE_URL=https://api.alhabla.ai NODE_ENV=production
  # 3. Dry run, then for real, from a checkout of main
  cd backend && npx tsx scripts/syncManagedAgentPrompts.ts --dry-run && npx tsx scripts/syncManagedAgentPrompts.ts
  # 4. Close the session: pkill cloud-sql-proxy; unset DATABASE_URL RETELL_API_KEY TELNYX_API_KEY BASE_URL NODE_ENV
  ```
  Since 2026-09-17 the script no longer filters by `orchestrator: "retell"`: businesses
  promoted to Telnyx keep a live Retell agent as fallback and were silently left with old
  tools/prompt. Agents with `promptManuallyEdited=true` get the new tools but keep their
  text — which is why behaviour that matters (e.g. `PROFESSIONAL_CONFIRMATION_REQUIRED`)
  is enforced by the backend, not only by the prompt.
- **Cleaning the Retell account** (same environment as above, plus the demo agent ids —
  they live in Cloud Run's env, not in `.env`): `scripts/inventarioAgentesRetell.ts
  --proteger <demo ids>` cross-references every Retell agent with the `Agent` table and
  classifies it (demo / business with Telnyx / business without Telnyx / **not in this
  DB**); `scripts/borrarAgentesRetell.ts --ids … [--llms …] --proteger … [--confirm]`
  deletes agents and their now-unused LLMs and clears `retellAgentId`/`retellLlmId` on the
  affected `Agent` rows (dry run without `--confirm`). Used on 2026-09-17: 48 → 11 agents
  (6 landing demos + 5 Telnyx fallbacks). The salon-de-uñas demo agent is
  `agent_dbbdb6134a4cf5c8e4998560f5`; its env var is `RETELL_DEMO_SALON_UNAS_AGENT_ID`
  (no Ñ — Cloud Run rejects it — the old name is still read as fallback).
  - **These two scripts are environment-blind by construction, and that has already cost
    agents.** `listAgents()` returns the *whole* Retell account, which dev and production
    share, but the cross-reference is against whatever single database this shell points
    at. Anything in the account without a row here used to be classed `huerfano` and
    printed in a ready-to-paste `--ids` line; that is how six dev businesses lost their
    Retell agents. Since 2026-09-19 that class is `desconocido`, it is **excluded from the
    candidate list**, it is reported in a loud warning naming the database, and
    `borrarAgentesRetell.ts` refuses to delete it without `--incluir-desconocidos`. Both
    scripts print the database they are cross-referencing against (`describirEntorno()`,
    name + host, never the password) — run the inventory from dev today and it correctly
    reports production's six agents as not-yours instead of offering them for deletion.
    The protection is about the *database*, not the account: it also catches pointing at
    the wrong DB within one environment.
- Between the deploy and the resync an agent may have a new prompt with an old schema or
  vice versa: handlers treat a missing `professionalConfirmed` as false and nothing in the
  booking path depends on the new field to complete a plain reservation.

### Re-syncing webhook URLs

Retell registers the webhook URL **per agent** via its own API when an agent is created or a business's calendar settings change — it is not something that updates itself when `BASE_URL` changes (e.g. moving a dev tunnel to a new hostname, or pointing a local backend at `https://api.alhabla.ai`). An agent created before a `BASE_URL` change keeps calling the old URL until explicitly re-synced. **The same applies to Telnyx assistants, which are the primary orchestrator** — there the URL is baked into each webhook tool at sync time, so a stale assistant means every tool call goes nowhere:

- **Retell:** `calendarService.syncCalendarToolsToAgents(businessId)` (LLM tools) and `retellAdapter.updateAgent(agentId, { webhookUrl })` (call lifecycle events `call_started`/`call_ended`/`call_analyzed`) — these are two independent registrations, fixing one doesn't fix the other.
- **Telnyx:** the tail of that same `syncCalendarToolsToAgents(businessId)` — `buildTelnyxVoiceTools(baseUrl)` + `syncAgentToTelnyx(businessId, prisma, { tools })`, **once per business** (it walks every agent with a `telnyxAssistantId` internally, unlike Retell which needs one API call per agent). It runs whatever `orchestrator` says, so a business still in backfill also gets current tools. **`syncAgentToTelnyx` never throws**: a failed sync is only visible in `Agent.telnyxSyncError` / `telnyxSyncedAt` / `telnyxConfigHash`, so check those columns before believing a sync happened (`strict: true` re-reads them and raises).

In dev, `backend/scripts/manual/resyncToolsDev.mts` sweeps every business against `BASE_URL`: `docker exec alhabla_backend_dev npx tsx scripts/manual/resyncToolsDev.mts`. It refuses to run with a production `BASE_URL`, because dev and prod still share the Telnyx and Retell accounts and it would repoint real customers' assistants at this process. With the hostname now fixed, this is no longer routine repair — it is how a tool-schema or prompt change reaches assistants that already exist.

This can be verified independently of the app's own DB by querying the provider's API directly with the account's API key and checking the registered URL against what's actually live: Retell `GET /get-agent/:id` and `GET /get-retell-llm/:id`, Telnyx `GET https://api.telnyx.com/v2/ai/assistants/:assistantId` (look at `tools[].webhook.url`; `tool_id` is the field to address a single tool, and the native `hangup` tool has neither URL nor webhook).

**Telnyx's tool tester** hits the real webhook without placing a call: `POST /v2/ai/assistants/:assistantId/tools/:toolId/test` with `arguments` and `dynamic_variables`, returning `{ status_code, response, success }`. Two things to know before relying on it (both confirmed 2026-09-19):

- **Telnyx signs the test request**, so it clears `telnyx-signature-ed25519` on our route. The tester is a genuine end-to-end exercise of the production path, not a bypass.
- **It needs a real `call_control_id`.** `/webhooks/telnyx/tools/:toolName` resolves the business *only* from the `x-alhabla-call-control-id` header (templated from `{{call_control_id}}`) via `prisma.call.findUnique({ where: { callId } })` — there is no assistant id in the tool body to fall back on. With no such `Call` row the route answers `404 Call not found` before reaching `executeVoiceTool`, and with none at all `400 Missing call_control_id`. Pass an existing call's id in `dynamic_variables.call_control_id`, or insert a throwaway `Call` row for the business in the dev DB. **Mind which business that call belongs to**: the tool runs against *its* `businessId`, not the assistant's.

**Drift observed in dev on 2026-09-19, the incident that killed ngrok** (both failure modes at once): the six seeded businesses had `telnyxSyncedAt = 2026-09-14`, so their assistants still pointed at that day's ngrok hostname **and** were missing `notify_when_available` entirely (the tool is unconditional in `telnyxAssistantPayload.ts`, it simply postdates their last sync) — five webhook tools plus `hangup` instead of six plus `hangup`. No `telnyxSyncError` on any of them: nothing had failed, nothing had re-run. The fixed hostname removes the URL half of this permanently; **the tool-set half remains**, because a deploy still does not touch assistants that already exist. A stale assistant is silent; only the provider's API tells you.

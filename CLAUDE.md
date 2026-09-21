# Alhabla

SaaS multi-tenant de recepcionistas de voz con IA para pequeños negocios en España
(peluquerías, barberías, salones de uñas, centros de estética, clínicas de fisioterapia).
Los agentes de voz atienden llamadas, consultan horario y disponibilidad, y reservan citas
en el calendario de Google, Outlook o Apple/iCloud del negocio.

Backend Fastify 5 + Prisma/PostgreSQL + Redis. Dos webs Next.js 14 App Router con Tailwind 3
(desde el 2026-09-21, `PLAN-APP-DOMINIO.md`): **la app** en `frontend/` (puerto 3001,
`app.alhabla.ai`, TanStack Query, sesión JWT en `localStorage`) y **la web pública** en `web/`
(puerto 3002, `alhabla.ai`: landing, sectores, planes, legal, registro de cuenta y blog en MDX,
sin sesión). El registro crea la cuenta en la web y entra en la app con un pase de un solo uso
(`POST /auth/pase/canjear`). Voz vía Retell.ai, telefonía Telnyx, pagos Stripe.

**Producción** (desde 2026-09-01): backend en Google Cloud Run, **un solo servicio**,
`alhabla-api` (`https://api.alhabla.ai`, tráfico público). Los jobs en segundo plano (antes
BullMQ en un servicio `alhabla-worker` aparte) migraron el 2026-09-03 a Cloud Tasks/Cloud
Scheduler, que llaman de vuelta a `alhabla-api` — ya no hace falta un servicio siempre
encendido. Las dos webs en Vercel (proyectos `alhabla-frontend`, root `frontend`, dominio
`app.alhabla.ai`; y `alhabla-web`, root `web`, dominio `alhabla.ai`). `alhabla.ai` redirige con
301 toda ruta de la app a `app.alhabla.ai`. Detalle completo, IDs de recursos y comandos reales
en `AGENTS.md` § Deployment Notes.

## Reglas que no se negocian

- **Todo en español.** Copy de UI, comentarios, nombres de variables y lógica de negocio.
  Solo se aceptan términos técnicos en inglés (`routes.ts`, `service.ts`, `prisma`, `fastify`).
- **Imports con extensión `.js`** en rutas TypeScript — requisito de ESM:
  `import { prisma } from "../../lib/prisma.js";`
- **Aislamiento multi-tenant:** toda consulta con ámbito de negocio se filtra por
  `request.user.businessId` del token JWT. Nunca aceptes un `businessId` del body para
  lecturas ni escrituras.
- **Los adaptadores son la única vía a las APIs de voz.** Retell pasa por
  `backend/src/adapters/retell/RetellAdapter.ts`. Jamás llames a esa API desde un route
  handler.
- **No toques la verificación de firmas de webhooks** (firma de Retell incluida en
  `/webhooks/retell/tools/:toolName`, firma de Stripe con `rawBody: true`).
- **Nunca commitees `.env`.** En la raíz hay `.env`, `.env.bak` y `.env.google` con
  credenciales reales; están en `.gitignore`. `docker-compose.yml` vive en la raíz y lee
  ese `.env` (build context de `backend`/`backend-dev` es `./backend`).

## Convenciones

- Prettier: `semi: true`, `trailingComma: "es5"`, `singleQuote: false`, `printWidth: 80`,
  `tabWidth: 2`.
- Alias: backend `"@/*"` → `"./*"` (relativo a `backend/src/`); frontend `"@/*"` → `"./src/*"`.
- Validación con Zod en bodies y params; `400` con `error.errors` en `ZodError`.
- Logs prefijados con el módulo entre corchetes: `[Agent]`, `[Calendar]`, `[Job]`.
  `fastify.log` dentro de rutas, `console.log`/`console.error` en arranque y workers.
- Rutas autenticadas: `onRequest: fastify.authenticate` o
  `preValidation: [fastify.authenticate]`.
- Frontend: TanStack Query para todo el estado de servidor (`staleTime: 30s`, sin retry,
  sin refetch on focus). `useBusiness()` para estado de auth.
- Nueva variable de entorno ⇒ añadirla a `.env.example` **y** a `docker-compose.yml`
  (servicios `backend` y `backend-dev`). Sin defaults reales para secretos.
- Un componente que usan las dos webs (`brand-mark`, `particle-*`, `google-auth-button`,
  `range-slider`…) vive copiado en las dos: si lo cambias en una, cámbialo en la otra.

## Diseño (frontend)

Estética SaaS conservadora y profesional para negocios tradicionales españoles. Nada de
look de startup ni de app de consumo. Rediseño negro/blanco/morado (agosto 2026, commit
`eeab7f4`) — no queda ni un token de la paleta verde anterior. Tokens reales en
`frontend/src/app/globals.css`:

| Token | Hex | Uso |
|-------|-----|-----|
| `--background` / `--surface` | `#ffffff` | Fondo base y de tarjetas/paneles |
| `--foreground` / `--accent` | `#0a0a0a` | Texto principal, botones primarios |
| `--muted` | `#52525b` | Texto secundario |
| `--purple` / `--accent-soft` | `#8b5cf6` / `#a78bfa` | Acento de marca — iconos, focus rings, `HeroConversation` |
| `--purple-wash` / `--purple-ink` | `#f3eeff` / `#6d28d9` | Fondo y texto de badges/contenedores de icono morados |
| `--success` / `--warning` / `--error` | `#2c7334` / `#9f7a15` / `#c53030` | Estados |

Clases base (`.panel`, `.field`, `.btn-primary`, `.btn-secondary`, `.btn-purple`,
`.badge-soft`) usan `rounded-full` en botones/inputs/badges y `rounded-3xl` en paneles —
lo contrario de la escala 8/12/16px de antes. Iconos Lucide React en contenedores
`rounded-xl` con `bg-[#f3eeff]` y `text-[#8b5cf6]`. Detalle completo en `DESIGN.md`.

## Comandos

```bash
cd backend
npm run dev            # backend, tsx watch (:3000)
npm run build          # tsc
npm run test           # vitest run
npm run lint           # eslint src --ext .ts
npm run typecheck      # tsc --noEmit
npm run prisma:migrate # migraciones en dev
npm run prisma:studio  # :5555

cd frontend && npm run dev   # la app, Next.js :3001
cd web && npm run dev        # la web pública, Next.js :3002

docker compose --profile dev up   # backend + postgres + redis + cloudflared (desde la raíz)
```

## Estructura

```
backend/
├── src/
│   ├── server.ts     # entry Fastify: registra rutas + endpoints internos de jobs (Cloud Tasks)
│   ├── plugins/      # auth, CORS, rate-limit, multipart, internalAuth (OIDC de Cloud Tasks)
│   ├── modules/      # rutas por dominio (agents, auth, billing, bookings, businesses,
│   │                 #   calendar, calls, demo, internal, onboarding, phone, places,
│   │                 #   recordings, voiceTools) — cada uno con routes.ts
│   ├── adapters/     # Retell, Telnyx
│   ├── lib/          # prisma, redis, cloudTasks, storage, stripe, availability,
│   │                 #   zohoMail, emailTemplates, businessSchedule, agentBootstrap, managedAgentPrompt
│   └── jobs/         # lógica de los jobs (sin framework): processRecording, retryFailedBooking,
│                     #   sendEmail, cleanupZombieCalls — invocados vía Cloud Tasks/Scheduler en
│                     #   producción, en línea en dev (ver AGENTS.md § Background Jobs)
├── prisma/schema.prisma
├── tests/            # Vitest (tests/integration/ aparte, contra Postgres/Redis reales)
└── Dockerfile
frontend/src/{app,components,lib,hooks}/   # la app (app.alhabla.ai)
web/src/{app,components,lib,hooks}/        # la web pública (alhabla.ai); artículos en web/content/blog/*.mdx
```

Enlaces entre las dos: la app enlaza a la web con `NEXT_PUBLIC_WEB_URL` (`frontend/src/lib/web-url.ts`)
y la web a la app con `NEXT_PUBLIC_APP_URL` (`web/src/lib/app-url.ts`); el backend con `APP_URL`
y `WEB_URL` (`backend/src/lib/urls.ts`). Nada de rutas de la otra web escritas a mano.

## Documentación

- `AGENTS.md` — referencia técnica completa (43 KB): modelos Prisma, flujos de webhooks,
  facturación Stripe, integración de calendarios, catálogo de configuración de Retell.
  Consúltalo cuando trabajes sobre un subsistema concreto.
- `.claude-context.md` — resumen de producto, audiencia, tono de marca y problemas
  UI/UX conocidos.

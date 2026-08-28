# BotBook

SaaS multi-tenant de recepcionistas de voz con IA para pequeños negocios en España
(peluquerías, barberías, salones de uñas, centros de estética, clínicas de fisioterapia).
Los agentes de voz atienden llamadas, consultan horario y disponibilidad, y reservan citas
en el calendario de Google u Outlook del negocio.

Backend Fastify 5 + Prisma/PostgreSQL + Redis/BullMQ. Frontend Next.js 14 App Router
(puerto 3001) con Tailwind 3 y TanStack Query. Voz vía Vapi y Retell.ai, telefonía Telnyx
(Twilio inactivo — no vende números de España en autoservicio), pagos Stripe.

## Reglas que no se negocian

- **Todo en español.** Copy de UI, comentarios, nombres de variables y lógica de negocio.
  Solo se aceptan términos técnicos en inglés (`routes.ts`, `service.ts`, `prisma`, `fastify`).
- **Imports con extensión `.js`** en rutas TypeScript — requisito de ESM:
  `import { prisma } from "../../lib/prisma.js";`
- **Aislamiento multi-tenant:** toda consulta con ámbito de negocio se filtra por
  `request.user.businessId` del token JWT. Nunca aceptes un `businessId` del body para
  lecturas ni escrituras.
- **Los adaptadores son la única vía a las APIs de voz.** Vapi pasa por
  `src/adapters/vapi/VapiAdapter.ts` y Retell por `src/adapters/retell/RetellAdapter.ts`.
  Jamás llames a esas APIs desde un route handler.
- **No toques la verificación de firmas de webhooks** (HMAC-SHA256 de Vapi, firma de Retell
  incluida en `/webhooks/retell/tools/:toolName`, firma de Stripe con `rawBody: true`).
- **Nunca commitees `.env`.** En la raíz hay `.env`, `.env.bak` y `.env.google` con
  credenciales reales; están en `.gitignore`.

## Convenciones

- Prettier: `semi: true`, `trailingComma: "es5"`, `singleQuote: false`, `printWidth: 80`,
  `tabWidth: 2`.
- Alias: backend `"@/*"` → `"./*"` (relativo a `src/`); frontend `"@/*"` → `"./src/*"`.
- Validación con Zod en bodies y params; `400` con `error.errors` en `ZodError`.
- Logs prefijados con el módulo entre corchetes: `[Agent]`, `[Calendar]`, `[Job]`.
  `fastify.log` dentro de rutas, `console.log`/`console.error` en arranque y workers.
- Rutas autenticadas: `onRequest: fastify.authenticate` o
  `preValidation: [fastify.authenticate]`.
- Frontend: TanStack Query para todo el estado de servidor (`staleTime: 30s`, sin retry,
  sin refetch on focus). `useBusiness()` para estado de auth.
- Nueva variable de entorno ⇒ añadirla a `.env.example` **y** a `docker-compose.yml`
  (servicios `backend` y `backend-dev`). Sin defaults reales para secretos.

## Diseño (frontend)

Estética SaaS conservadora y profesional para negocios tradicionales españoles. Nada de
look de startup ni de app de consumo. Tokens en `frontend/src/app/globals.css`:

| Token | Hex | Uso |
|-------|-----|-----|
| `--background` | `#eef2eb` | Base del gradiente de fondo |
| `--foreground` | `#17211c` | Texto principal |
| `--surface` | `#ffffff` | Tarjetas y paneles |
| `--muted` | `#687267` | Texto secundario |
| `--accent` | `#1e2b22` | Botones primarios, titulares |
| `--accent-soft` | `#b8d96e` | Focus rings, highlights |
| `--success` / `--warning` / `--error` | `#2c7334` / `#9f7a15` / `#c53030` | Estados |

Prohibidos: `#101814` (negro con tinte verde), `#d6ff72` (lima neón), y púrpura o naranja
en `HeroConversation`.

Clases base: `.panel`, `.field`, `.btn-primary`, `.btn-secondary`, `.badge-soft`.
Radios `rounded-lg` (8px) en inputs y botones, `rounded-xl` (12px) en tarjetas,
`rounded-2xl` (16px) en paneles — nunca `rounded-full` en contenedores grandes.
Sombras sutiles (`0_8px_24px_rgba(30,43,34,0.06)`), nada de `0_22px_55px`.
Iconos Lucide React en contenedores con `bg-[#eef6dc]` y `text-[#2c7334]`.

## Comandos

```bash
npm run dev            # backend, tsx watch (:3000)
npm run build          # tsc
npm run test           # vitest run
npm run lint           # eslint src --ext .ts
npm run typecheck      # tsc --noEmit
npm run prisma:migrate # migraciones en dev
npm run prisma:studio  # :5555

cd frontend && npm run dev   # Next.js :3001

docker compose --profile dev up   # backend + postgres + redis + ngrok
```

## Estructura

```
src/
├── server.ts     # entry Fastify: registra rutas y workers
├── plugins/      # auth, CORS, rate-limit, multipart
├── modules/      # rutas por dominio (agents, auth, billing, bookings, businesses,
│                 #   calendar, calls, demo, files, onboarding, phone, places,
│                 #   recordings, voiceTools) — cada uno con routes.ts
├── adapters/     # Vapi, Retell, Twilio (inactivo), Telnyx
├── lib/          # prisma, redis, queue, storage, stripe, twilio, availability,
│                 #   businessSchedule, agentBootstrap, managedAgentPrompt
└── jobs/         # workers BullMQ: processRecording, classifyCall, cleanupZombieCalls
frontend/src/{app,components,lib,hooks}/
prisma/schema.prisma
tests/           # Vitest
```

## Documentación

- `AGENTS.md` — referencia técnica completa (43 KB): modelos Prisma, flujos de webhooks,
  facturación Stripe, integración de calendarios, catálogo de configuración de Vapi/Retell.
  Consúltalo cuando trabajes sobre un subsistema concreto.
- `.claude-context.md` — resumen de producto, audiencia, tono de marca y problemas
  UI/UX conocidos.

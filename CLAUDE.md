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

# BotBook

BotBook es una plataforma SaaS multi-tenant que proporciona recepcionistas de voz con IA para pequeños negocios en España (peluquerías, barberías, clínicas de fisioterapia, centros de estética, etc.). Cada negocio dispone de uno o más agentes de voz construidos sobre Vapi o Retell.ai. Las cuentas europeas usan Retell por defecto para cumplir RGPD.

## Características principales

- **Agentes de voz multilingües** (español por defecto) con detección automática del orquestador (Vapi/Retell) según el país.
- **Reservas en calendario** (Google Calendar y Outlook) mediante herramientas de voz.
- **Detección de tipo de negocio** desde Google Places API para personalizar agentes y servicios.
- **Flujo de registro guiado** con Google Places, selección de servicios, equipo y conexión de calendario.
- **Facturación con Stripe** y provisioning automático de números Twilio tras la suscripción.
- **Webhooks seguros** con validación HMAC-SHA256 (Vapi) y firma Retell (incluyendo endpoints de herramientas).

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Backend | Node.js 20, TypeScript 5.9, Fastify 5 |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Base de datos | PostgreSQL 15 + Prisma |
| Caché / Colas | Redis 7 + BullMQ |
| Voice AI | Vapi + Retell.ai |
| LLM | Anthropic Claude (clasificación de llamadas) |
| Almacenamiento | Cloudflare R2 (S3) |
| Telefonía | Twilio |
| Pagos | Stripe |

## Requisitos

- Node.js 20+
- Docker y Docker Compose
- Cuentas y claves de API: Vapi, Retell, Google Cloud (Calendar + Places), Microsoft Azure (Outlook), Stripe, Twilio, Anthropic, Cloudflare R2

## Puesta en marcha rápida

```bash
# Clonar e instalar dependencias
npm install
cd frontend && npm install && cd ..

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Levantar backend + Postgres + Redis + ngrok (dev)
docker compose --profile dev up -d

# Ejecutar migraciones
docker compose exec backend-dev npx prisma migrate dev

# Frontend en desarrollo (puerto 3001)
cd frontend && npm run dev
```

## Comandos útiles

### Backend

```bash
npm run dev          # tsx watch
npm run build        # tsc
npm start            # node dist/server.js
npm run test         # vitest run
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

### Frontend

```bash
cd frontend
npm run dev          # Next.js en :3001
npm run build
npm run lint
```

### Docker

```bash
# Desarrollo completo (backend tsx watch, ngrok, postgres, redis)
docker compose --profile dev up

# Producción (backend compilado)
docker compose --profile prod up
```

## Estructura del proyecto

```
/
├── src/                    # Backend ESM TypeScript
│   ├── server.ts           # Fastify entry point
│   ├── plugins/            # auth, CORS, rate-limit, multipart
│   ├── modules/            # módulos de rutas por dominio
│   ├── adapters/           # Vapi, Retell, Twilio
│   ├── lib/                # utilidades compartidas
│   ├── jobs/               # workers BullMQ
│   └── config/             # constantes
├── frontend/               # Next.js 14
├── prisma/                 # schema y migraciones
├── tests/                  # suite Vitest
└── scripts/                # scripts E2E
```

## Flujo de registro post-login

1. `/register` — email/contraseña o Google OAuth + país.
2. `/register/business` — Google Places API para autocompletar negocio.
3. `/register/business/niche` — tipo de negocio (detectado o manual).
4. `/register/business/services` — plantilla de servicios.
5. `/register/business/team` — empleados y capacidad.
6. `/register/business/calendar` — conectar Google u Outlook.
7. `/checkout` — Stripe checkout (obligatorio para finalizar).

## Seguridad

- JWT firmado con `JWT_SECRET` (obligatorio).
- Webhooks Vapi con HMAC-SHA256 (`x-vapi-signature`).
- Webhooks Retell con firma validada (`x-retell-signature`), incluyendo herramientas personalizadas.
- Webhooks Stripe con firma verificada.
- Rate limiting global (100 req/min) y elevado en webhooks (300 req/min).
- CORS restringido al origen exacto de `FRONTEND_URL`.

## Documentación adicional

- `AGENTS.md` — referencia detallada para agentes de IA y desarrolladores.
- `frontend/src/lib/niche-landings.ts` — copy SEO por nicho.

## Licencia

MIT

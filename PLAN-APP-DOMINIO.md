# Plan: separar la web (alhabla.ai) de la aplicación (app.alhabla.ai)

Estado: **fase 0 hecha** (21-09-2026; PR de backend con `APP_URL`/`WEB_URL`, CORS doble y el
pase). Siguiente: fase 1 (`web/`).

## 1. Qué está al revés hoy

Un solo proyecto Next (`frontend/`, Vercel, dominio `alhabla.ai`) sirve las dos cosas:

| Ruta | Qué es | Problema |
|---|---|---|
| `/` | El panel autenticado (`PanelInicio`); sin sesión redirige **en cliente** a `/landing` | La raíz del dominio público es una página `noindex` que parpadea antes de mandar a la landing |
| `/landing`, `/peluqueria`, `/barberia`, `/centro-de-estetica`, `/salon-de-unas`, `/fisioterapia`, `/planes`, `/legal/*` | Marketing | Cuelgan de rutas secundarias; el sitemap apunta a `/landing` |
| `/register`, `/register/business/*` | Alta de cuenta **y** asistente del negocio (ya con sesión) | Mezcla conversión (marketing) con onboarding (app) |
| `/login`, `/agenda`, `/llamadas`, `/agente`, `/gestor`, `/ajustes/*`, `/checkout/*`, `/auth/google/callback`, `/settings`, `/dev/entrar` | App | Comparten bundle, deploy y `robots` con la web pública |

Todo el backend habla con **un** origen (`FRONTEND_URL` gobierna CORS, los redirects de
OAuth de calendario y de Google Login, las URLs de vuelta de Stripe, los enlaces de emails y
de WhatsApp — `panelUrl()` — y el SMS de reserva). Los botones URL de las plantillas de Meta
llevan `https://alhabla.ai/ajustes/{{1}}` horneado.

La sesión es un JWT en `localStorage` (`alhabla_token`), no una cookie: **no se comparte entre
`alhabla.ai` y `app.alhabla.ai`**. Eso es lo único que hace el cambio algo más que mover
ficheros.

## 2. Decisiones (21-09)

- **Registro**: `alhabla.ai/register` crea solo la cuenta (email o Google) y salta a
  `app.alhabla.ai` con un **pase de un solo uso**; el asistente del negocio
  (`/register/business/*`) se muda a la app como `/bienvenida/*`.
- **Arquitectura**: dos proyectos Next en el monorepo. `frontend/` pasa a ser la app
  (`app.alhabla.ai`); nace `web/` para landing, sectores, planes, legal, registro y artículos
  (`alhabla.ai`). Dos proyectos de Vercel con deploys independientes.
- **Artículos**: MDX en el repo (`web/content/blog/*.mdx`), rutas `/blog` y `/blog/[slug]`
  generadas en build, sitemap y RSS automáticos.

Consecuencias fijadas por esas decisiones:

- `alhabla.ai` **redirige (301) toda ruta de app** a `app.alhabla.ai` con la misma ruta y
  query. Así sobreviven marcadores, emails ya enviados y, sobre todo, los botones URL de las
  plantillas de Meta (`alhabla.ai/ajustes/…`): **no hay que crear plantillas nuevas**.
- El backend deja de tener un solo origen: `APP_URL` (app) y `WEB_URL` (marketing). CORS admite
  los dos; los redirects de OAuth, Stripe, emails y WhatsApp van a `APP_URL`; solo el registro
  y la recuperación de contraseña se originan en `WEB_URL`.
- Login, recuperación de contraseña y todo lo que exige sesión vive en la app. La web solo
  tiene «Entrar» (enlace a `app.alhabla.ai/login`) y «Empezar» (registro).

## 3. El pase de un solo uso (el único mecanismo nuevo)

Google Login ya funciona entre dominios sin nada nuevo: el navegador va a Google, Google
vuelve al backend (`GOOGLE_AUTH_REDIRECT_URI`, en `api.alhabla.ai`) y el backend redirige a
`APP_URL/auth/google/callback?token=…`, que guarda el JWT en el `localStorage` **de la app**.

El registro por email no: `POST /auth/register` devuelve el JWT a una página de `alhabla.ai`,
que no puede guardarlo para `app.alhabla.ai`. Se resuelve con un pase:

1. `POST /auth/register` sigue devolviendo `token` (nada cambia para clientes viejos) y además
   `pase`: un código aleatorio de 32 bytes guardado en Redis (`auth:pase:<código>` → userId,
   TTL 60 s, un solo uso).
2. La web redirige a `https://app.alhabla.ai/auth/entrar?pase=<código>&plan=<planId>&sector=<tipo>`.
   Los datos que hoy viajan por `localStorage` entre `/register` y `/register/business/*`
   (`alhabla_pending_plan`, `REGISTRATION_NICHE_KEY`) van en la query, porque el
   `localStorage` de la web no se ve desde la app.
3. `POST /auth/pase/canjear { pase }` (sin sesión, rate limit estricto) devuelve el JWT y borra
   el código. `/auth/entrar` lo guarda y manda a `/bienvenida`.

El JWT nunca va en una URL (ni en `#fragment`): el pase caduca en 60 s y muere al canjearse.
`/dev/entrar?token=` (solo dev) se mantiene tal cual.

## 4. Fases

Cada fase es un PR desplegable sin cambio visible hasta el corte (fase 3). El orden importa:
el backend primero, porque las dos webs se apoyan en él; la web nueva después, porque se
puede probar en preview sin tocar `alhabla.ai`; el corte al final, en una ventana corta.

### Fase 0 — Backend: dos orígenes y el pase

- `APP_URL` y `WEB_URL` (nuevas; `FRONTEND_URL` sigue valiendo como `APP_URL` de respaldo para
  no romper dev ni el deploy actual). Un helper `urls.ts` con `appUrl(ruta)` y `webUrl(ruta)`
  sustituye las siete lecturas sueltas de `process.env.FRONTEND_URL` (auth, passwordReset,
  billing ×4, calendar routes, voiceTools, whatsapp/mensajes).
- CORS: `APP_URL`, `WEB_URL` y `EXTRA_ALLOWED_ORIGIN`.
- `POST /auth/register` devuelve `pase`; `POST /auth/pase/canjear`. Tests unitarios e
  integración (Redis real: un solo uso, caducidad).
- `.env.example`, `docker-compose.yml`, `AGENTS.md` § Deployment Notes (tabla de variables).
- Producción: añadir `APP_URL=https://alhabla.ai` y `WEB_URL=https://alhabla.ai` (aún los dos
  al mismo sitio). Sin cambio visible.

### Fase 1 — `web/`: la web de marketing

- Nuevo proyecto Next 14 en `web/` (App Router, Tailwind 3, mismos tokens de `globals.css` y
  `DESIGN.md`; **sin** TanStack Query, sin `AppShell`, sin `providers`).
- Se **mueven** (no se copian) desde `frontend/`: `main-landing.tsx` y sus piezas
  (`landing-hero`, `hero-hilos*`, `hero-conversation`, `how-it-works-scrollytelling`,
  `demo-voice-call`, `revenue-loss-calculator`, `plans-with-roi`, `plans-headline`,
  `sector-data-section`, `site-landing`, `mobile-nav`, `scroll-reveal`, `particle-*`,
  `lottie-*`, `count-up`, `animated-currency`, `range-slider`, `brand-*`, `legal-page`),
  las páginas `/landing` → `/`, los cinco sectores, `/planes`, `/legal/*`, los vídeos y
  assets de `public/heroes` y `public/brand`, `sitemap.ts`, `robots.ts`,
  `opengraph-image.tsx`, `lib/seo.ts`.
- `/register`: solo la cuenta. Email → `POST /auth/register` → pase → salto a la app. Google →
  el botón de siempre (el backend devuelve a la app). El plan elegido en `/planes` y el sector
  de las landings viajan en la query del salto.
- `/blog` y `/blog/[slug]` con MDX (`@next/mdx` o `next-mdx-remote`), frontmatter mínimo
  (título, fecha, resumen, sector opcional), listado, RSS y entrada en el sitemap. Un artículo
  de ejemplo.
- Cabecera de la web: «Entrar» → `app.alhabla.ai/login`; «Empezar» → `/register`.
- Vercel: proyecto nuevo `alhabla-web` con Root Directory `web`, sin dominio todavía (solo
  previews). Variables: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL=https://alhabla.ai`,
  `NEXT_PUBLIC_APP_URL=https://app.alhabla.ai`.
- CI: tercer job `Web — lint, test, build` (y añadirlo a los checks obligatorios de `main`).
- El demo de voz (`/demo/web-call`) y la búsqueda de Places de la landing siguen contra la
  API; CORS ya los admite desde la fase 0.

Al acabar: la web entera funciona en una URL de preview; `alhabla.ai` sigue igual.

### Fase 2 — `frontend/`: solo la app

- `/` = panel (ya lo es). Sin sesión, redirige a `/login` (no a `/landing`).
- `/register/business/*` → `/bienvenida/*` (mismas pantallas; lee plan y sector de la query
  con la que llegó el pase, con `localStorage` como respaldo). `/register` en la app pasa a
  redirigir a `WEB_URL/register`.
- `/auth/entrar`: canjea el pase. `/login`, `/recuperar-contrasena`,
  `/restablecer-contrasena`, `/auth/google/callback`, `/checkout/*`, `/settings` se quedan.
- Se **eliminan** de la app las páginas de marketing y `PUBLIC_ROUTES` queda en las de cuenta.
- `next.config`: `redirects()` de `/landing`, sectores, `/planes`, `/legal/*` → `WEB_URL`
  (permanente), para el periodo en que alguien llegue a la app con una ruta de la web.
- Metadata: toda la app `noindex`; sin `sitemap`/`robots` (o `robots` que prohíbe todo).
- `AppShell`: el enlace del logo apunta a `/`; los enlaces a legal apuntan a la web.
- Tests: los de landing/sectores se mudan con sus componentes a `web/tests`.

Al acabar: la app funciona en preview sola; `alhabla.ai` sigue sirviendo el `frontend/`
viejo hasta el corte.

### Fase 3 — Corte (una tarde)

Orden pensado para que en ningún momento un enlace ya enviado deje de funcionar:

1. DNS: `app.alhabla.ai` → Vercel (CNAME). En Vercel, dominio `app.alhabla.ai` al proyecto
   `frontend`. Comprobar `https://app.alhabla.ai/login`.
2. Google Cloud Console: **nada que tocar**. El login de Google y el OAuth de calendario son
   redirects que construye el backend con su propio `redirect_uri` (`api.alhabla.ai`), no
   botones JS con orígenes autorizados. La verificación de Google en curso tampoco cambia
   (la privacidad sigue en `alhabla.ai/legal/privacidad`).
3. Backend (Cloud Run, sin redeploy de imagen): `APP_URL=https://app.alhabla.ai`,
   `WEB_URL=https://alhabla.ai`, `FRONTEND_URL=https://app.alhabla.ai`. Desde este momento
   emails, WhatsApp, Stripe y OAuth mandan a la app. Stripe: las URLs de éxito/cancelación se
   construyen por petición, no hay nada que tocar en el dashboard.
4. Vercel: `alhabla.ai` (y `www`) pasan del proyecto `frontend` al proyecto `alhabla-web`. En
   `web/next.config` van los **redirects 301 de las rutas de app** (`/login`, `/agenda`,
   `/llamadas/:path*`, `/agente`, `/gestor`, `/ajustes/:path*`, `/checkout/:path*`,
   `/auth/:path*`, `/settings`, `/recuperar-contrasena`, `/restablecer-contrasena`,
   `/register/business/:path*` → `/bienvenida/...`, `/dev/:path*`) a `app.alhabla.ai`, y
   `/landing` → `/`.
5. Comprobar de punta a punta: registro por email y por Google desde `alhabla.ai` → app;
   login; olvido de contraseña (el email lleva a la app); conectar Google Calendar (vuelve a
   `app.alhabla.ai/settings`); checkout de Stripe (vuelve a la app); un botón «Ir a Ajustes»
   de una alerta por WhatsApp (`alhabla.ai/ajustes/…` → redirect → app); `/gestor`.
6. Search Console: propiedad nueva no hace falta (`alhabla.ai` sigue siendo la web); enviar el
   sitemap nuevo. La app no se indexa.

Marcha atrás: volver a apuntar `alhabla.ai` al proyecto `frontend` en Vercel y restaurar
`APP_URL`/`FRONTEND_URL`. Nada de la fase 3 destruye datos.

### Fase 4 — Limpieza y docs

- Borrar de `frontend/` lo que quedó por compatibilidad (redirects a la web, código muerto),
  `FRONTEND_URL` del backend cuando ya nadie lo lea, `EXTRA_ALLOWED_ORIGIN` si sobra.
- `CLAUDE.md` (estructura: `web/` + `frontend/` + `backend/`), `AGENTS.md` (variables, Vercel
  ×2, receta de previews), `.claude-context.md`, `DESIGN.md` (dónde viven los tokens
  compartidos), memoria.
- Opcional: paquete `packages/ui` con tokens y `brand-mark` si la duplicación de CSS entre
  `web/` y `frontend/` molesta. No antes: dos copias de un `globals.css` son más baratas que
  un workspace de npm.

## 5. Riesgos y cómo se acotan

| Riesgo | Mitigación |
|---|---|
| Registro roto entre dominios (la conversión) | El pase se prueba en integración (Redis real) y de punta a punta en preview antes del corte; Google Login no cambia de mecanismo |
| Enlaces antiguos (emails, plantillas de Meta con `alhabla.ai/ajustes/…`) | Redirects 301 en la web; se comprueba con un botón real de WhatsApp en el paso 3.5 |
| OAuth de Google (login y calendario) | No cambia: los `redirect_uri` son del backend y no hay orígenes JS autorizados que añadir |
| Previews de Vercel de la web llaman a la API con un origen no permitido | Mismo régimen que hoy para el `frontend` (memoria: «los previews ya no escriben en producción») |
| SEO: la landing cambia de `/landing` a `/` | 301 de `/landing` → `/`; sitemap nuevo; el contenido y las URLs de sectores no cambian |
| El bug conocido del registro (`register/page.tsx` con errores de validación como array) | Se arregla al reescribir `/register` en la web (fase 1), no se arrastra |

## 6. Complejidad

**Media-alta por volumen, baja por riesgo técnico.** Es sobre todo mover ficheros y rutas: la
web y la app ya están separadas por componentes, la sesión es un JWT sin cookies y el backend
ya centraliza las URLs en una variable. Lo único nuevo de verdad es el pase de un solo uso
(un endpoint, una clave de Redis, una página) y el segundo proyecto de Vercel. Cuatro PRs y
una tarde de corte con marcha atrás en dos pasos.

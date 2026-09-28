# frontend — la app de Alhabla (app.alhabla.ai)

Panel del negocio: inicio, agenda, llamadas, recepcionista (`/agente`), tu asistente
(`/asistente`), ajustes, asistente de alta (`/bienvenida`) y checkout. La web pública
(landing, sectores, planes, legal, registro y blog) vive en `../web` y se sirve en
`alhabla.ai`; el reparto está contado en `../PLAN-APP-DOMINIO.md`.

```bash
npm install
npm run dev     # http://localhost:3001 (la web corre en :3002, el backend en :3000)
npm run test    # vitest
npm run lint
npm run build   # tipa como parte de la compilación (no hay script typecheck)
```

No ejecutes `npm run build` con `npm run dev` levantado: los dos escriben en `.next` y el
servidor de desarrollo se queda sin estilos (ver `../AGENTS.md`).

Variables (`.env.local` en dev, proyecto `alhabla-frontend` en Vercel):

- `NEXT_PUBLIC_API_BASE_URL` — el backend (`https://api.alhabla.ai`). Obligatoria en build.
- `NEXT_PUBLIC_WEB_URL` — la web pública (`https://alhabla.ai`), para enlazarla y para los
  redirects 301 de rutas de marketing (`lib/web-url.ts`, `next.config.mjs`).
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — clave pública de Stripe para el checkout embebido.
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` — ID público de medición de GA4 (opcional).

Referencia completa (páginas, componentes, estado, sistema de diseño) en `../AGENTS.md` y
`../DESIGN.md`.

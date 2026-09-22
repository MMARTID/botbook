# web — la web pública de Alhabla (alhabla.ai)

Landing, páginas por sector, planes, legal, registro de cuenta y blog. La aplicación
(panel, agenda, ajustes…) vive en `../frontend` y se sirve en `app.alhabla.ai`; el reparto
está contado en `../PLAN-APP-DOMINIO.md`.

```bash
npm install
npm run dev     # http://localhost:3002 (la app corre en :3001, el backend en :3000)
npm run test    # vitest
npm run lint
npm run build
```

Variables (`.env.local` en dev, proyecto `alhabla-web` en Vercel):

- `NEXT_PUBLIC_API_BASE_URL` — el backend (`https://api.alhabla.ai`). Obligatoria en build.
- `NEXT_PUBLIC_SITE_URL` — esta web (`https://alhabla.ai`), para canónicas, sitemap y OG.
- `NEXT_PUBLIC_APP_URL` — la app (`https://app.alhabla.ai`): «Entrar» y el salto tras el registro.

- `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`,
  `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` — el editor del blog (`/keystatic`, Keystatic con una
  GitHub App instalada en `MMARTID/botbook`). Sin ellas la web se construye igual y `/api/keystatic`
  responde 503. En dev no hacen falta: Keystatic escribe en disco.

Artículos: ficheros `content/blog/<slug>.mdx` con frontmatter y fotos en `public/blog/<slug>/`.
Se editan en `/keystatic` (editor visual que crea rama + PR) o a mano; formato, campos y reglas
SEO en `content/blog/README.md`. Aparecen en `/blog`, en el sitemap y en `/blog/rss.xml` con el
siguiente deploy.

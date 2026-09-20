/**
 * URLs públicas de las dos webs (PLAN-APP-DOMINIO.md § 2): la app
 * (`APP_URL`, app.alhabla.ai) y la web de marketing (`WEB_URL`, alhabla.ai).
 * Hasta el corte las dos apuntan al mismo sitio; `FRONTEND_URL` sigue
 * valiendo como respaldo de las dos para no romper dev ni el deploy actual.
 * Todo lo que el backend enlaza (emails, WhatsApp, SMS, vueltas de OAuth y de
 * Stripe) es de la app; la web solo origina el registro y la recuperación de
 * contraseña, y para eso basta con admitir su origen en CORS.
 */

const POR_DEFECTO = "http://localhost:3001";

function sinBarraFinal(url: string): string {
  return url.replace(/\/$/, "");
}

function primera(
  porDefecto: string,
  ...valores: Array<string | undefined>
): string {
  for (const v of valores) {
    if (v && v.trim()) return sinBarraFinal(v.trim());
  }
  return porDefecto;
}

/** Origen de la app (panel), con `ruta` opcional (`/ajustes`, `/login?x=1`).
 * `porDefecto` es lo que vale sin ninguna variable (los mensajes de WhatsApp
 * prefieren la URL pública a localhost). */
export function appUrl(
  ruta = "",
  opciones: { porDefecto?: string } = {}
): string {
  return `${primera(
    opciones.porDefecto ?? POR_DEFECTO,
    process.env.APP_URL,
    process.env.FRONTEND_URL
  )}${ruta}`;
}

/** Origen de la web de marketing, con `ruta` opcional. */
export function webUrl(ruta = ""): string {
  return `${primera(
    POR_DEFECTO,
    process.env.WEB_URL,
    process.env.APP_URL,
    process.env.FRONTEND_URL
  )}${ruta}`;
}

/** Orígenes que admite CORS: app, web y el extra opcional (túneles). */
export function origenesPermitidos(): Set<string> {
  return new Set(
    [appUrl(), webUrl(), process.env.EXTRA_ALLOWED_ORIGIN?.trim()].filter(
      (o): o is string => !!o
    )
  );
}

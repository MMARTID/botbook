export const siteName = "Alhabla";
export const defaultDescription =
  "Alhabla es el asistente telefónico con IA para negocios con cita previa: responde llamadas, resuelve dudas y reserva citas automáticamente las 24 horas.";

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/$/, "") : undefined;

/**
 * Metadata para páginas privadas (panel, login, registro, checkout...):
 * fuera del índice de Google y sin heredar canónicas ni OG del root layout.
 */
export const noindexMetadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
} as const;

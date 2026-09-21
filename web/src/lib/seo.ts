export const siteName = "Alhabla";
export const defaultTitle = "Alhabla | Asistente telefónico 24/7 para peluquerías y centros de estética";
export const defaultDescription =
  "Alhabla es el asistente telefónico con IA para negocios con cita previa: responde llamadas, resuelve dudas y reserva citas automáticamente las 24 horas.";

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const siteUrl = rawSiteUrl ? rawSiteUrl.replace(/\/$/, "") : undefined;

export const seoKeywords = [
  // Categoría principal
  "asistente telefónico 24/7",
  "asistente telefónico con IA",
  "recepción telefónica con IA",
  "recepcionista virtual para negocios",
  "asistente virtual de llamadas",
  "automatizar atención telefónica",
  "reservas telefónicas automáticas",
  "gestión de citas con IA",
  "integración google calendar",
  "transcripción llamadas",
  "resumen automático de llamadas",
  "atención de llamadas fuera de horario",
  siteName,
];

export function absoluteUrl(path = "/") {
  if (!siteUrl) {
    return path;
  }

  return new URL(path, siteUrl).toString();
}

export const landingStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteName,
      url: absoluteUrl("/"),
      description: defaultDescription,
    },
    {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/"),
      inLanguage: "es-ES",
      description: defaultDescription,
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      description:
        "Asistente telefónico con IA para responder llamadas, organizar citas y mantener atención continua en negocios de belleza y servicios con agenda.",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      audience: {
        "@type": "Audience",
        audienceType: "Peluquerías, barberías, centros de estética y negocios con cita previa",
      },
      url: absoluteUrl("/"),
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "69",
        highPrice: "299",
        priceCurrency: "EUR",
        offerCount: "3",
      },
    },
    {
      "@type": "Service",
      serviceType: "Asistente telefónico 24/7 con IA",
      provider: {
        "@type": "Organization",
        name: siteName,
        url: absoluteUrl("/"),
      },
      areaServed: "ES",
      audience: {
        "@type": "Audience",
        audienceType: "Peluquerías, barberías, salones de uñas, centros de estética y clínicas de fisioterapia",
      },
      description:
        "Servicio de recepción telefónica inteligente para captar llamadas, reservar citas y mantener una atención constante sin ampliar equipo.",
      url: absoluteUrl("/"),
    },
  ],
} as const;

/**
 * Bloque FAQPage reutilizable: mismo formato para la portada (FAQ corta) y
 * cada landing de nicho (FAQ completa) — antes vivía duplicado inline. Sin
 * `@context` propio porque va anidado dentro de un `@graph` que ya lo
 * declara; para usarlo como `<script>` suelto hay que añadirlo aparte.
 */
export function buildFaqPageStructuredData(faqs: readonly { question: string; answer: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  } as const;
}

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

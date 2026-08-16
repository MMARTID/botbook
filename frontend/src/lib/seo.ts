export const siteName = "AsistAI";
export const defaultTitle = "AsistAI | Asistente telefónico 24/7 para peluquerías y centros de estética";
export const defaultDescription =
  "AsistAI es el asistente telefónico con IA para negocios con cita previa: responde llamadas, resuelve dudas y reserva citas automáticamente las 24 horas.";

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
      url: absoluteUrl("/landing"),
      description: defaultDescription,
    },
    {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/landing"),
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
      url: absoluteUrl("/landing"),
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
        url: absoluteUrl("/landing"),
      },
      areaServed: "ES",
      audience: {
        "@type": "Audience",
        audienceType: "Peluquerías, barberías, centros de estética, clínicas estéticas y negocios locales con reservas",
      },
      description:
        "Servicio de recepción telefónica inteligente para captar llamadas, reservar citas y mantener una atención constante sin ampliar equipo.",
      url: absoluteUrl("/landing"),
    },
    {
      "@type": "Service",
      name: "Soporte para Kit Digital",
      serviceType: "Compatibilidad Kit Digital",
      provider: {
        "@type": "Organization",
        name: siteName,
        url: absoluteUrl("/landing"),
      },
      areaServed: "ES",
      description:
        "AsistAI es compatible con requisitos técnicos habituales de proyectos financiables por el programa Kit Digital y puede integrarse con sistemas de reservas para facilitar la optención de subvenciones.",
      url: absoluteUrl("/landing#kit-digital"),
    },
  ],
} as const;

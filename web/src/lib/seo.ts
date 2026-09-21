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

/** Correo público (el del pie de la web). */
export const contactEmail = "hola@alhabla.ai";

/**
 * Imagen de Open Graph / Twitter para TODAS las páginas. La ruta
 * `app/opengraph-image.tsx` solo se hereda cuando la página no declara su
 * propio `openGraph`; en cuanto una página lo declara (todas las indexables
 * lo hacen para fijar título y canónica), Next sustituye el objeto entero y
 * la imagen desaparece — visto en el HTML generado de los nichos, /planes,
 * legales y artículos. Se añade explícitamente en cada una.
 */
export const ogImageAlt = "Alhabla — Recepción telefónica para negocios con cita previa";
export function ogImages() {
  return [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: ogImageAlt }];
}

/** Identificadores estables del grafo: los nichos y el blog los referencian
 * con `isPartOf`/`publisher`, así que TODAS las páginas comparten la misma
 * entidad de organización y de sitio web. */
export const organizationId = () => `${absoluteUrl("/")}#organization`;
export const websiteId = () => `${absoluteUrl("/")}#website`;

export function organizationStructuredData() {
  return {
    "@type": "Organization",
    "@id": organizationId(),
    name: siteName,
    url: absoluteUrl("/"),
    logo: { "@type": "ImageObject", url: absoluteUrl("/icon.png"), width: 512, height: 512 },
    description: defaultDescription,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: contactEmail,
      availableLanguage: ["es"],
      areaServed: "ES",
    },
  } as const;
}

/** Migas para el grafo de cualquier página interior (Inicio → … → página). */
export function buildBreadcrumbStructuredData(items: readonly { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Inicio", path: "/" }, ...items].map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  } as const;
}

export const landingStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    organizationStructuredData(),
    {
      "@type": "WebSite",
      "@id": websiteId(),
      name: siteName,
      url: absoluteUrl("/"),
      inLanguage: "es-ES",
      description: defaultDescription,
      publisher: { "@id": organizationId() },
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
      provider: { "@id": organizationId() },
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

import type { Metadata } from "next";
import { nicheLandings, type NicheSlug } from "@/lib/niche-landings";
import { absoluteUrl, ogImages, organizationId, siteName, websiteId } from "@/lib/seo";

/**
 * Páginas de nicho + ciudad (`/[nicho]/[ciudad]`, 2026-09-25): el dato real
 * que las hace defendibles frente al riesgo de "contenido fino" (páginas que
 * solo cambian el nombre de la ciudad). Dos fuentes, según lo que el INE
 * puede o no distinguir:
 *
 * - **Peluquería, barbería, salón de uñas y centro de estética**: el INE
 *   clasifica por CNAE y ahí peluquería y barbería comparten código (96.21),
 *   igual que salón de uñas y estética (96.22) — no da un número por nicho.
 *   Se usa en su lugar `places:searchText` (mismo endpoint que
 *   `backend/src/modules/places`) con una rejilla de puntos por ciudad para
 *   superar el tope de 60 resultados de una sola consulta, deduplicando por
 *   `place.id`. Sigue sin ser un censo, así que la cifra final se redondea
 *   hacia abajo y se presenta siempre como cota mínima («más de N»).
 * - **Fisioterapia**: SÍ tiene fuente oficial limpia — el INE publica cada
 *   año fisioterapeutas colegiados por provincia («Estadística de
 *   Profesionales Sanitarios Colegiados», tabla 75049,
 *   https://www.ine.es/jaxi/Tabla.htm?tpx=75049). Cifra exacta, no cota.
 *
 * Refrescar cada 6-12 meses basta (la densidad de negocios por sector no
 * cambia rápido): repetir la consulta de Places y actualizar
 * `CITY_DATA_FECHA`; para fisioterapia, comprobar si el INE publicó tabla
 * nueva (se actualiza una vez al año, hacia mayo).
 */

export type CitySlug = "madrid" | "barcelona" | "valencia" | "sevilla" | "zaragoza" | "malaga";

export type CityInfo = {
  slug: CitySlug;
  name: string;
  /** Para el schema `Service.areaServed` (`City` → `containedInPlace`). */
  region: string;
};

export const CITIES: Record<CitySlug, CityInfo> = {
  madrid: { slug: "madrid", name: "Madrid", region: "Comunidad de Madrid" },
  barcelona: { slug: "barcelona", name: "Barcelona", region: "Cataluña" },
  valencia: { slug: "valencia", name: "Valencia", region: "Comunidad Valenciana" },
  sevilla: { slug: "sevilla", name: "Sevilla", region: "Andalucía" },
  zaragoza: { slug: "zaragoza", name: "Zaragoza", region: "Aragón" },
  malaga: { slug: "malaga", name: "Málaga", region: "Andalucía" },
};

export const CITY_SLUGS = Object.keys(CITIES) as CitySlug[];

/** Fecha de la consulta a Google Places que respalda los 4 nichos sin colegio profesional. */
export const CITY_DATA_FECHA = "2026-09-25";

export type CityNicheStat = {
  /** Ya redondeada hacia abajo si `esCota` es `true`. */
  cifra: number;
  /** Lo que sigue a la cifra, p. ej. "peluquerías en Madrid". */
  unidad: string;
  /** Pie de la cifra: fuente y fecha. */
  fuente: string;
  /** `true` → se antepone "más de " (cota mínima, Google Maps). `false` → cifra exacta (INE). */
  esCota: boolean;
};

const GOOGLE_MAPS: Pick<CityNicheStat, "fuente" | "esCota"> = {
  fuente: `según Google Maps (${CITY_DATA_FECHA})`,
  esCota: true,
};

const INE_COLEGIADOS: Pick<CityNicheStat, "fuente" | "esCota"> = {
  fuente: "según el INE — Profesionales Sanitarios Colegiados, a 31 de diciembre de 2024",
  esCota: false,
};

export const CITY_NICHE_STATS: Record<CitySlug, Record<NicheSlug, CityNicheStat>> = {
  madrid: {
    peluqueria: { cifra: 235, unidad: "peluquerías en Madrid", ...GOOGLE_MAPS },
    barberia: { cifra: 150, unidad: "barberías en Madrid", ...GOOGLE_MAPS },
    "salon-de-unas": { cifra: 220, unidad: "salones de uñas en Madrid", ...GOOGLE_MAPS },
    "centro-de-estetica": { cifra: 170, unidad: "centros de estética en Madrid", ...GOOGLE_MAPS },
    fisioterapia: { cifra: 13279, unidad: "fisioterapeutas colegiados en la Comunidad de Madrid", ...INE_COLEGIADOS },
  },
  barcelona: {
    peluqueria: { cifra: 225, unidad: "peluquerías en Barcelona", ...GOOGLE_MAPS },
    barberia: { cifra: 155, unidad: "barberías en Barcelona", ...GOOGLE_MAPS },
    "salon-de-unas": { cifra: 200, unidad: "salones de uñas en Barcelona", ...GOOGLE_MAPS },
    "centro-de-estetica": { cifra: 160, unidad: "centros de estética en Barcelona", ...GOOGLE_MAPS },
    fisioterapia: { cifra: 9457, unidad: "fisioterapeutas colegiados en la provincia de Barcelona", ...INE_COLEGIADOS },
  },
  valencia: {
    peluqueria: { cifra: 230, unidad: "peluquerías en Valencia", ...GOOGLE_MAPS },
    barberia: { cifra: 135, unidad: "barberías en Valencia", ...GOOGLE_MAPS },
    "salon-de-unas": { cifra: 165, unidad: "salones de uñas en Valencia", ...GOOGLE_MAPS },
    "centro-de-estetica": { cifra: 145, unidad: "centros de estética en Valencia", ...GOOGLE_MAPS },
    fisioterapia: { cifra: 3977, unidad: "fisioterapeutas colegiados en la provincia de Valencia", ...INE_COLEGIADOS },
  },
  sevilla: {
    peluqueria: { cifra: 210, unidad: "peluquerías en Sevilla", ...GOOGLE_MAPS },
    barberia: { cifra: 130, unidad: "barberías en Sevilla", ...GOOGLE_MAPS },
    "salon-de-unas": { cifra: 140, unidad: "salones de uñas en Sevilla", ...GOOGLE_MAPS },
    "centro-de-estetica": { cifra: 120, unidad: "centros de estética en Sevilla", ...GOOGLE_MAPS },
    fisioterapia: { cifra: 2241, unidad: "fisioterapeutas colegiados en la provincia de Sevilla", ...INE_COLEGIADOS },
  },
  zaragoza: {
    peluqueria: { cifra: 210, unidad: "peluquerías en Zaragoza", ...GOOGLE_MAPS },
    barberia: { cifra: 105, unidad: "barberías en Zaragoza", ...GOOGLE_MAPS },
    "salon-de-unas": { cifra: 110, unidad: "salones de uñas en Zaragoza", ...GOOGLE_MAPS },
    "centro-de-estetica": { cifra: 105, unidad: "centros de estética en Zaragoza", ...GOOGLE_MAPS },
    fisioterapia: { cifra: 1500, unidad: "fisioterapeutas colegiados en la provincia de Zaragoza", ...INE_COLEGIADOS },
  },
  malaga: {
    peluqueria: { cifra: 155, unidad: "peluquerías en Málaga", ...GOOGLE_MAPS },
    barberia: { cifra: 110, unidad: "barberías en Málaga", ...GOOGLE_MAPS },
    "salon-de-unas": { cifra: 120, unidad: "salones de uñas en Málaga", ...GOOGLE_MAPS },
    "centro-de-estetica": { cifra: 100, unidad: "centros de estética en Málaga", ...GOOGLE_MAPS },
    fisioterapia: { cifra: 2055, unidad: "fisioterapeutas colegiados en la provincia de Málaga", ...INE_COLEGIADOS },
  },
};

export function getCityNicheMetadata(nicho: NicheSlug, ciudad: CitySlug): Metadata {
  const content = nicheLandings[nicho];
  const city = CITIES[ciudad];
  const url = absoluteUrl(`/${nicho}/${ciudad}`);
  const title = `${content.name} en ${city.name}: asistente telefónico con IA | ${siteName}`;
  const description = `Asistente telefónico con IA para ${content.name.toLowerCase()} en ${city.name}: atiende llamadas y reserva citas 24/7 con tu número de siempre.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    category: "business software",
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    openGraph: {
      title,
      description,
      url,
      siteName,
      locale: "es_ES",
      type: "website",
      images: ogImages(`/${nicho}`, title),
    },
    twitter: { card: "summary_large_image", title, description, images: ogImages(`/${nicho}`, title) },
    other: { "geo.region": "ES", "geo.placename": city.name, language: "es" },
  };
}

export function getCityNicheStructuredData(nicho: NicheSlug, ciudad: CitySlug) {
  const content = nicheLandings[nicho];
  const city = CITIES[ciudad];
  const url = absoluteUrl(`/${nicho}/${ciudad}`);
  const nicheUrl = absoluteUrl(`/${nicho}`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        name: `${content.name} en ${city.name} | ${siteName}`,
        url,
        inLanguage: "es-ES",
        isPartOf: { "@id": websiteId() },
        about: { "@id": `${url}#service` },
      },
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: `${content.primaryKeyword} en ${city.name}`,
        serviceType: "Recepción telefónica con inteligencia artificial y gestión de citas",
        provider: { "@id": organizationId() },
        areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": "AdministrativeArea", name: city.region } },
        audience: { "@type": "BusinessAudience", audienceType: content.name },
        url,
        offers: { "@type": "AggregateOffer", lowPrice: "69", highPrice: "299", priceCurrency: "EUR", offerCount: "3", url: absoluteUrl("/planes") },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: content.name, item: nicheUrl },
          { "@type": "ListItem", position: 3, name: city.name, item: url },
        ],
      },
    ],
  };
}

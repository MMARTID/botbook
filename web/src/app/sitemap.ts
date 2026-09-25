import type { MetadataRoute } from "next";
import { listarArticulos, urlAbsolutaDeImagen } from "@/lib/blog";
import { absoluteUrl } from "@/lib/seo";
import { CITY_SLUGS } from "@/lib/city-landings";

const NICHOS = ["peluqueria", "centro-de-estetica", "salon-de-unas", "barberia", "fisioterapia"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  // Solo páginas SEO reales: ni /register (noindex) ni nada de la app, que
  // vive en app.alhabla.ai y no se indexa.
  //
  // Sin `lastModified` en las páginas fijas: antes iba `new Date()` en cada
  // build, es decir, «todo cambió hoy» en cada deploy; Google deja de fiarse
  // de un lastmod que siempre es ahora. Los artículos llevan la fecha real de
  // su última revisión de fondo (`actualizado`; si no, la de publicación) y
  // su foto de portada, que ayuda a indexarla en Google Imágenes.
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...NICHOS.map((path) => ({
      url: absoluteUrl(`/${path}`),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    // Páginas nicho+ciudad (2026-09-25): profundidad corta, con el dato real
    // por ciudad como diferenciador — ver `src/lib/city-landings.ts`. Menor
    // prioridad y menor frecuencia que las landings de nicho: apuntan hacia
    // ellas, no compiten con ellas.
    ...NICHOS.flatMap((nicho) =>
      CITY_SLUGS.map((ciudad) => ({
        url: absoluteUrl(`/${nicho}/${ciudad}`),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      }))
    ),
    {
      url: absoluteUrl("/planes"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/blog"),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...listarArticulos().map((a) => ({
      url: absoluteUrl(`/blog/${a.slug}`),
      lastModified: new Date(`${a.actualizado ?? a.fecha}T08:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
      ...(a.imagen ? { images: [urlAbsolutaDeImagen(a.imagen)] } : {}),
    })),
    ...["/legal/aviso-legal", "/legal/privacidad"].map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}

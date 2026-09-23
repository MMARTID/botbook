import type { MetadataRoute } from "next";
import { listarArticulos } from "@/lib/blog";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  // Solo páginas SEO reales: ni /register (noindex) ni nada de la app, que
  // vive en app.alhabla.ai y no se indexa.
  //
  // Sin `lastModified` en las páginas fijas: antes iba `new Date()` en cada
  // build, es decir, «todo cambió hoy» en cada deploy; Google deja de fiarse
  // de un lastmod que siempre es ahora. Solo los artículos llevan su fecha
  // real.
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...["/peluqueria", "/centro-de-estetica", "/salon-de-unas", "/barberia", "/fisioterapia"].map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
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
      lastModified: new Date(`${a.fecha}T08:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...["/legal/aviso-legal", "/legal/privacidad"].map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}

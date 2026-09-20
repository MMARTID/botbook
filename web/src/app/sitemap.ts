import type { MetadataRoute } from "next";
import { listarArticulos } from "@/lib/blog";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Solo páginas SEO reales: ni /register (noindex) ni nada de la app, que
  // vive en app.alhabla.ai y no se indexa.
  return [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...["/peluqueria", "/centro-de-estetica", "/salon-de-unas", "/barberia", "/fisioterapia"].map((path) => ({
      url: absoluteUrl(path),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    {
      url: absoluteUrl("/planes"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/blog"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...listarArticulos().map((a) => ({
      url: absoluteUrl(`/blog/${a.slug}`),
      lastModified: new Date(`${a.fecha}T08:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}

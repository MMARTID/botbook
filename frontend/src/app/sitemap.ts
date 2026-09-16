import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Solo páginas SEO reales. Ni "/" (es el panel autenticado, que redirige a
  // /landing en cliente), ni /login ni /register (flujos privados, noindex):
  // tenerlas aquí hacía que Google las rastreara y marcara duplicados.
  return [
    {
      url: absoluteUrl("/landing"),
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
  ];
}

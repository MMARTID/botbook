import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Todo lo público se rastrea. Fuera del rastreo (además del `noindex` que
 * ya llevan): el editor del blog, sus rutas internas y el redirector de
 * previsualización — no aportan nada al índice y gastan rastreo. `/register`
 * NO se bloquea: lleva `noindex` y Google necesita poder leerlo para
 * respetarlo. Las previsualizaciones de Vercel ya salen con
 * `X-Robots-Tag: noindex` por su cuenta.
 */
export default function robots(): MetadataRoute.Robots {
  const host = siteUrl ?? "https://alhabla.ai";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/keystatic", "/api/", "/preview"],
      },
    ],
    sitemap: `${host}/sitemap.xml`,
    host,
  };
}

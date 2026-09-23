import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Todo lo público se rastrea. Las rutas internas del blog (/keystatic,
 * /preview, /vista-previa) NO se bloquean aquí a propósito: llevan `noindex`
 * en sus metadatos, y Google solo puede respetar un `noindex` si rastrea la
 * página y lo lee. Bloquearlas en robots.txt haría que Google nunca viera la
 * directiva y podría indexarlas como URL sin contenido si alguien las
 * enlazara. `/register` sigue el mismo criterio: `noindex` visible.
 *
 * Fuera solo `/api/`: no son páginas, no tienen nada que indexar y gastan
 * rastreo. Las previsualizaciones de Vercel ya salen con
 * `X-Robots-Tag: noindex` por su cuenta.
 */
export default function robots(): MetadataRoute.Robots {
  const host = siteUrl ?? "https://alhabla.ai";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${host}/sitemap.xml`,
    host,
  };
}

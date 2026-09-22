import { listarTodosLosArticulos } from "@/lib/blog";
import { absoluteUrl, defaultDescription, siteName } from "@/lib/seo";

export const revalidate = 86_400;

function escapar(texto: string): string {
  return texto.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

export async function GET() {
  const items = (await listarTodosLosArticulos())
    .map(
      (a) => `    <item>
      <title>${escapar(a.titulo)}</title>
      <link>${absoluteUrl(`/blog/${a.slug}`)}</link>
      <guid>${absoluteUrl(`/blog/${a.slug}`)}</guid>
      <description>${escapar(a.resumen)}</description>
      <pubDate>${new Date(`${a.fecha}T08:00:00Z`).toUTCString()}</pubDate>
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapar(siteName)} · Blog</title>
    <link>${absoluteUrl("/blog")}</link>
    <description>${escapar(defaultDescription)}</description>
    <language>es-ES</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}

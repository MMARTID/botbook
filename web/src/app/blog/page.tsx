import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { SiteFooter } from "@/components/site-footer";
import { fechaLarga, listarArticulos } from "@/lib/blog";
import { absoluteUrl, buildBreadcrumbStructuredData, ogImages, organizationId, siteName, websiteId } from "@/lib/seo";

const blogTitle = "Blog: llamadas, citas y atención al cliente";
const blogDescription =
  "Guías y consejos para peluquerías, barberías, centros de estética, salones de uñas y clínicas de fisioterapia que no quieren perder ni una llamada.";

export const metadata: Metadata = {
  title: blogTitle,
  description: blogDescription,
  alternates: { canonical: absoluteUrl("/blog"), types: { "application/rss+xml": absoluteUrl("/blog/rss.xml") } },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: absoluteUrl("/blog"),
    siteName,
    title: `${blogTitle} | ${siteName}`,
    description: blogDescription,
    images: ogImages("/blog", `${blogTitle} | ${siteName}`),
  },
  twitter: {
    card: "summary_large_image",
    title: `${blogTitle} | ${siteName}`,
    description: blogDescription,
    images: ogImages("/blog", `${blogTitle} | ${siteName}`),
  },
};

const blogStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    buildBreadcrumbStructuredData([{ name: "Blog", path: "/blog" }]),
    {
      "@type": "Blog",
      "@id": `${absoluteUrl("/blog")}#blog`,
      name: `${blogTitle} | ${siteName}`,
      description: blogDescription,
      url: absoluteUrl("/blog"),
      inLanguage: "es-ES",
      isPartOf: { "@id": websiteId() },
      publisher: { "@id": organizationId() },
    },
  ],
};

export default function BlogPage() {
  const articulos = listarArticulos();
  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <BackLink fallbackHref="/" />
          <Link href="/planes" className="btn-secondary px-4">
            Ver planes
          </Link>
        </header>
        <section className="mt-12">
          <span className="badge-soft">Blog</span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">Ideas para no perder ni una llamada</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Lo que aprendemos atendiendo el teléfono de negocios como el tuyo, contado sin humo.
          </p>
        </section>
        {articulos.length === 0 ? (
          <p className="mt-12 text-sm text-muted">Todavía no hay artículos. Vuelve pronto.</p>
        ) : (
          <ul className="mt-12 space-y-8">
            {articulos.map((a) => (
              <li key={a.slug} className="panel p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d28d9]">{fechaLarga(a.fecha)}</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  <Link href={`/blog/${a.slug}`} className="rounded hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
                    {a.titulo}
                  </Link>
                </h2>
                {a.resumen ? <p className="mt-3 text-sm leading-6 text-muted">{a.resumen}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <SiteFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogStructuredData) }}
      />
    </main>
  );
}

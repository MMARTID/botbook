import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { listarTodosLosArticulos } from "@/lib/blog";
import { TarjetaDeArticulo } from "@/components/blog/tarjeta-de-articulo";
import { SiteHeader } from "@/components/site-header";
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

/** Los artículos de BabyLoveGrowth llegan por red: se revalida una vez al día
 * para que uno nuevo aparezca en el listado sin volver a desplegar. */
export const revalidate = 86_400;

export default async function BlogPage() {
  const articulos = await listarTodosLosArticulos();
  const [destacado, ...resto] = articulos;
  return (
    <>
      <SiteHeader inicio="/" />
      <main className="min-h-screen bg-white text-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <section className="max-w-3xl">
            <span className="badge-soft">Blog</span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">
              Ideas para no perder ni una llamada
            </h1>
            <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
              Lo que aprendemos atendiendo el teléfono de peluquerías, barberías, centros de estética, salones de uñas
              y clínicas de fisioterapia, contado sin humo.
            </p>
          </section>

          {articulos.length === 0 ? (
            <p className="mt-12 text-sm text-muted">Todavía no hay artículos. Vuelve pronto.</p>
          ) : (
            <>
              {/* El más reciente ocupa toda la fila; el resto, rejilla de tres. */}
              <div className="mt-12">
                <TarjetaDeArticulo articulo={destacado} destacado />
              </div>
              {resto.length > 0 ? (
                <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {resto.map((a) => (
                    <li key={a.slug}>
                      <TarjetaDeArticulo articulo={a} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          <section className="mt-16 rounded-3xl border border-[#ddd6fe] bg-[#f3eeff] p-6 sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-[#0a0a0a] sm:text-3xl">
                ¿Quieres oír cómo atiende Alhabla con tus servicios y tu horario?
              </h2>
              <p className="mt-3 text-base leading-7 text-muted">
                Una recepcionista que coge todas las llamadas, reserva en tu calendario y te avisa por WhatsApp. 7 días
                de prueba, sin permanencia.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 lg:mt-0 lg:shrink-0">
              <Link href="/planes" className="btn-primary px-6">
                Ver planes
              </Link>
              <Link href="/#como-funciona" className="btn-secondary px-6">
                Cómo funciona
              </Link>
            </div>
          </section>
        </div>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(blogStructuredData) }}
        />
      </main>
    </>
  );
}

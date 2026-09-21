import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { BackLink } from "@/components/back-link";
import { SiteFooter } from "@/components/site-footer";
import { fechaLarga, leerArticulo, listarArticulos } from "@/lib/blog";
import { absoluteUrl, buildBreadcrumbStructuredData, ogImages, organizationId, siteName, websiteId } from "@/lib/seo";

type Props = { params: { slug: string } };

export const dynamicParams = false;

export function generateStaticParams() {
  return listarArticulos().map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const articulo = leerArticulo(params.slug);
  if (!articulo) return {};
  return {
    title: articulo.titulo,
    description: articulo.resumen,
    alternates: { canonical: absoluteUrl(`/blog/${articulo.slug}`) },
    openGraph: {
      type: "article",
      locale: "es_ES",
      url: absoluteUrl(`/blog/${articulo.slug}`),
      siteName,
      title: articulo.titulo,
      description: articulo.resumen,
      publishedTime: articulo.fecha,
      images: ogImages(`/blog/${articulo.slug}`, articulo.titulo),
    },
    twitter: {
      card: "summary_large_image",
      title: articulo.titulo,
      description: articulo.resumen,
      images: ogImages(`/blog/${articulo.slug}`, articulo.titulo),
    },
  };
}

export default function ArticuloPage({ params }: Props) {
  const articulo = leerArticulo(params.slug);
  if (!articulo) notFound();
  return (
    <main className="min-h-screen bg-white text-[#0a0a0a]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <BackLink fallbackHref="/blog" />
          <Link href="/planes" className="btn-secondary px-4">
            Ver planes
          </Link>
        </header>
        <article className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d28d9]">{fechaLarga(articulo.fecha)}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">{articulo.titulo}</h1>
          {articulo.resumen ? <p className="mt-4 text-lg leading-8 text-muted">{articulo.resumen}</p> : null}
          <div className="articulo mt-10">
            <MDXRemote source={articulo.contenido} />
          </div>
          {articulo.sector ? (
            <p className="mt-12 text-sm text-muted">
              ¿Tienes un negocio de este sector?{" "}
              <Link href={`/${articulo.sector}`} className="font-semibold text-[#6d28d9]">
                Mira cómo atiende Alhabla el teléfono
              </Link>
              .
            </p>
          ) : null}
        </article>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                buildBreadcrumbStructuredData([
                  { name: "Blog", path: "/blog" },
                  { name: articulo.titulo, path: `/blog/${articulo.slug}` },
                ]),
                {
                  // BlogPosting (subtipo de Article) con lo que Google pide
                  // para el resultado enriquecido: imagen, fechas y editor
                  // con logo, referenciando la misma organización que el
                  // resto del sitio.
                  "@type": "BlogPosting",
                  "@id": `${absoluteUrl(`/blog/${articulo.slug}`)}#article`,
                  headline: articulo.titulo,
                  description: articulo.resumen,
                  image: ogImages(`/blog/${articulo.slug}`).map((i) => i.url),
                  datePublished: articulo.fecha,
                  dateModified: articulo.fecha,
                  inLanguage: "es-ES",
                  author: { "@id": organizationId() },
                  publisher: { "@id": organizationId() },
                  isPartOf: { "@id": `${absoluteUrl("/blog")}#blog` },
                  mainEntityOfPage: {
                    "@type": "WebPage",
                    "@id": absoluteUrl(`/blog/${articulo.slug}`),
                    isPartOf: { "@id": websiteId() },
                  },
                },
                // La organización se declara aquí también: el artículo se
                // puede compartir/indexar sin pasar por la portada.
                {
                  "@type": "Organization",
                  "@id": organizationId(),
                  name: siteName,
                  url: absoluteUrl("/"),
                  logo: { "@type": "ImageObject", url: absoluteUrl("/icon.png"), width: 512, height: 512 },
                },
              ],
            }),
          }}
        />
      </div>
      <SiteFooter />
    </main>
  );
}

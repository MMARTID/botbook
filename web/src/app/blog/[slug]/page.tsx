import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { BackLink } from "@/components/back-link";
import { fechaLarga, leerArticulo, listarArticulos } from "@/lib/blog";
import { absoluteUrl, siteName } from "@/lib/seo";

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
              "@type": "Article",
              headline: articulo.titulo,
              description: articulo.resumen,
              datePublished: articulo.fecha,
              author: { "@type": "Organization", name: siteName },
              mainEntityOfPage: absoluteUrl(`/blog/${articulo.slug}`),
            }),
          }}
        />
      </div>
    </main>
  );
}

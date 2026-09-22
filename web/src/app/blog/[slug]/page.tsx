import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Clock3 } from "lucide-react";
import { componentesDeArticulo } from "@/components/blog/imagen-de-articulo";
import { PastillaDeSector, TarjetaDeArticulo, esSector } from "@/components/blog/tarjeta-de-articulo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { articulosRelacionados, fechaLarga, leerArticulo, listarArticulos } from "@/lib/blog";
import { AUTOR_POR_DEFECTO } from "@/lib/blog";
import { nicheLandings } from "@/lib/niche-landings";
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
      locale: articulo.idioma === "ca" ? "ca_ES" : "es_ES",
      url: absoluteUrl(`/blog/${articulo.slug}`),
      siteName,
      title: articulo.titulo,
      description: articulo.resumen,
      publishedTime: articulo.fecha,
      modifiedTime: articulo.actualizado ?? articulo.fecha,
      authors: [articulo.autor],
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
  const sector = esSector(articulo.sector) ? articulo.sector : null;
  const relacionados = articulosRelacionados(articulo, listarArticulos());
  const url = absoluteUrl(`/blog/${articulo.slug}`);
  // Para Google, la foto real del artículo si la hay; si no, la imagen
  // generada para compartir.
  const imagenes = [
    ...(articulo.imagen ? [absoluteUrl(articulo.imagen)] : []),
    ...ogImages(`/blog/${articulo.slug}`).map((i) => i.url),
  ];

  return (
    <>
      <SiteHeader niche={sector ?? undefined} inicio="/" />
      <main className="min-h-screen bg-white text-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <nav aria-label="Migas" className="text-sm text-muted">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-[#0a0a0a]">
                  Inicio
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/blog" className="hover:text-[#0a0a0a]">
                  Blog
                </Link>
              </li>
              {sector ? (
                <>
                  <li aria-hidden="true">/</li>
                  <li>
                    <Link href={`/${sector}`} className="hover:text-[#0a0a0a]">
                      {nicheLandings[sector].name}
                    </Link>
                  </li>
                </>
              ) : null}
            </ol>
          </nav>

          <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12 xl:gap-16">
            <article className="min-w-0 max-w-3xl" lang={articulo.idioma}>
              <header>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {sector ? <PastillaDeSector sector={sector} /> : null}
                  <span>{fechaLarga(articulo.fecha)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    {articulo.minutosDeLectura} min de lectura
                  </span>
                </div>
                <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">{articulo.titulo}</h1>
                {articulo.resumen ? <p className="mt-5 text-lg leading-8 text-muted">{articulo.resumen}</p> : null}
                <p className="mt-5 text-sm text-muted">
                  Por <span className="font-semibold text-[#27272a]">{articulo.autor}</span>
                  {articulo.actualizado && articulo.actualizado !== articulo.fecha
                    ? ` · Actualizado el ${fechaLarga(articulo.actualizado)}`
                    : null}
                </p>
              </header>

              {articulo.imagen ? (
                <figure className="mt-8">
                  <Image
                    src={articulo.imagen}
                    alt={articulo.imagenAlt ?? ""}
                    width={1600}
                    height={1000}
                    priority
                    sizes="(min-width: 1024px) 768px, 100vw"
                    className="h-auto w-full rounded-3xl border border-[#e5e5e5]"
                  />
                </figure>
              ) : null}

              <div className="articulo mt-10">
                <MDXRemote source={articulo.contenido} components={componentesDeArticulo} />
              </div>

              {sector ? (
                <aside className="mt-12 rounded-3xl border border-[#ddd6fe] bg-[#f3eeff] p-6 sm:p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d28d9]">
                    {nicheLandings[sector].name}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0a0a0a]">
                    Mira cómo atiende Alhabla el teléfono de tu negocio
                  </h2>
                  <p className="mt-2 text-base leading-7 text-muted">
                    Con tus servicios, tu equipo y tu calendario. 7 días de prueba, sin permanencia.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href={`/${sector}`} className="btn-primary px-6">
                      Ver cómo funciona
                    </Link>
                    <Link href={`/planes?niche=${sector}`} className="btn-secondary px-6">
                      Ver planes
                    </Link>
                  </div>
                </aside>
              ) : null}
            </article>

            <aside className="mt-12 lg:mt-0">
              <div className="lg:sticky lg:top-24 lg:space-y-6">
                <div className="rounded-3xl border border-[#e5e5e5] p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d28d9]">Alhabla</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#0a0a0a]">
                    Una recepcionista que coge todas las llamadas
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Atiende, reserva en tu calendario y te avisa por WhatsApp. Desde 69 €/mes.
                  </p>
                  <Link href="/planes" className="btn-primary mt-4 w-full">
                    Probar 7 días
                  </Link>
                </div>
                {relacionados.length > 0 ? (
                  <div className="hidden lg:block">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Sigue leyendo</p>
                    <ul className="mt-3 space-y-3">
                      {relacionados.map((a) => (
                        <li key={a.slug}>
                          <Link
                            href={`/blog/${a.slug}`}
                            className="block rounded-xl text-sm font-semibold leading-6 text-[#27272a] hover:text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                          >
                            {a.titulo}
                          </Link>
                          <p className="text-xs text-muted">{fechaLarga(a.fecha)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>

          {relacionados.length > 0 ? (
            <section className="mt-16 border-t border-[#e5e5e5] pt-10 lg:hidden" aria-labelledby="sigue-leyendo">
              <h2 id="sigue-leyendo" className="text-2xl font-bold tracking-tight">
                Sigue leyendo
              </h2>
              <ul className="mt-6 grid gap-6 sm:grid-cols-2">
                {relacionados.map((a) => (
                  <li key={a.slug}>
                    <TarjetaDeArticulo articulo={a} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                buildBreadcrumbStructuredData([
                  { name: "Blog", path: "/blog" },
                  ...(sector ? [{ name: nicheLandings[sector].name, path: `/${sector}` }] : []),
                  { name: articulo.titulo, path: `/blog/${articulo.slug}` },
                ]),
                {
                  // BlogPosting con lo que Google pide para el resultado
                  // enriquecido: imagen, fechas reales, autor y editor con logo.
                  "@type": "BlogPosting",
                  "@id": `${url}#article`,
                  headline: articulo.titulo,
                  description: articulo.resumen,
                  image: imagenes,
                  datePublished: articulo.fecha,
                  dateModified: articulo.actualizado ?? articulo.fecha,
                  inLanguage: articulo.idioma === "ca" ? "ca-ES" : "es-ES",
                  wordCount: articulo.minutosDeLectura * 200,
                  author:
                    articulo.autor === AUTOR_POR_DEFECTO
                      ? { "@id": organizationId() }
                      : { "@type": "Person", name: articulo.autor, worksFor: { "@id": organizationId() } },
                  publisher: { "@id": organizationId() },
                  isPartOf: { "@id": `${absoluteUrl("/blog")}#blog` },
                  mainEntityOfPage: {
                    "@type": "WebPage",
                    "@id": url,
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
      </main>
    </>
  );
}

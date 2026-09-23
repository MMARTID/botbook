import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Clock3 } from "lucide-react";
import { componentesDeArticulo } from "@/components/blog/imagen-de-articulo";
import { PastillaDeSector, esSector } from "@/components/blog/tarjeta-de-articulo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { esRamaDePrevisualizacion, fechaLarga, leerArticuloDePrevisualizacion } from "@/lib/blog";
import { nicheLandings } from "@/lib/niche-landings";

type Props = { params: { slug: string }; searchParams: { branch?: string } };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Vista previa del artículo | Alhabla",
  robots: { index: false, follow: false },
};

/** Muestra la rama del editor con su sesión de GitHub; no publica borradores. */
export default async function VistaPreviaArticulo({ params, searchParams }: Props) {
  const rama = searchParams.branch;
  const tokenDeGitHub = cookies().get("keystatic-gh-access-token")?.value;
  if (!rama || !esRamaDePrevisualizacion(rama) || !tokenDeGitHub) notFound();

  const articulo = await leerArticuloDePrevisualizacion(params.slug, rama, tokenDeGitHub);
  if (!articulo) notFound();

  const sector = esSector(articulo.sector) ? articulo.sector : null;
  return (
    <>
      <SiteHeader niche={sector ?? undefined} inicio="/" />
      <main className="min-h-screen bg-white text-[#0a0a0a]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <p className="mb-8 rounded-xl border border-[#ddd6fe] bg-[#f3eeff] px-4 py-3 text-sm text-[#5b21b6]">
            Vista previa privada · rama <code className="font-semibold">{rama}</code>
          </p>
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12 xl:gap-16">
            <article className="min-w-0 max-w-3xl" lang={articulo.idioma}>
              <nav aria-label="Migas" className="text-sm text-muted">
                <ol className="flex flex-wrap items-center gap-2">
                  <li><Link href="/" className="hover:text-[#0a0a0a]">Inicio</Link></li>
                  <li aria-hidden="true">/</li>
                  <li><Link href="/blog" className="hover:text-[#0a0a0a]">Blog</Link></li>
                  {sector ? <><li aria-hidden="true">/</li><li><Link href={`/${sector}`} className="hover:text-[#0a0a0a]">{nicheLandings[sector].name}</Link></li></> : null}
                </ol>
              </nav>
              <header className="mt-8">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {sector ? <PastillaDeSector sector={sector} /> : null}
                  <span>{fechaLarga(articulo.fecha)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-4 w-4" aria-hidden="true" />{articulo.minutosDeLectura} min de lectura</span>
                </div>
                <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.025em] sm:text-5xl">{articulo.titulo}</h1>
                {articulo.resumen ? <p className="mt-5 text-lg leading-8 text-muted">{articulo.resumen}</p> : null}
                <p className="mt-5 text-sm text-muted">Por <span className="font-semibold text-[#27272a]">{articulo.autor}</span></p>
              </header>
              <div className="articulo mt-10">
                <MDXRemote source={articulo.contenido} components={componentesDeArticulo} options={{ blockJS: false }} />
              </div>
            </article>
            <aside className="mt-12 lg:mt-0">
              <div className="rounded-3xl border border-[#e5e5e5] p-6 lg:sticky lg:top-24">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d28d9]">Vista previa</p>
                <p className="mt-2 text-sm leading-6 text-muted">Este borrador no aparece en el blog, el sitemap ni los buscadores.</p>
              </div>
            </aside>
          </div>
        </div>
        <SiteFooter />
      </main>
    </>
  );
}

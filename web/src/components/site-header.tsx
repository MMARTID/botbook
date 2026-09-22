import Link from "next/link";
import { appUrl } from "@/lib/app-url";
import { BrandMark } from "@/components/brand-mark";
import { MobileNav } from "@/components/mobile-nav";
import { SectorsMenu } from "@/components/sectors-menu";
import { type NicheSlug } from "@/lib/niche-landings";

function buildPlansHref(niche?: NicheSlug) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

/**
 * Cabecera única de la web pública: antes vivía duplicada (una versión en
 * `site-landing.tsx` para las landings de nicho, otra con animación propia
 * de ocultado en móvil en `main-landing.tsx`). Esa animación se llevaba el
 * botón de menú por delante mientras el visitante hacía scroll por "Cómo
 * funciona" en móvil — el propio menú quedaba inalcanzable. Aquí la cabecera
 * es siempre visible y el menú, siempre disponible.
 */
/**
 * `inicio`: en las landings las anclas («Cómo funciona», «Preguntas») son de
 * la propia página; en el blog y demás páginas apuntan a la portada («/»).
 */
export function SiteHeader({ niche, inicio = "" }: { niche?: NicheSlug; inicio?: string }) {
  const plansHref = buildPlansHref(niche);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        {/* Misma marca que la barra lateral de la app (app-shell.tsx):
            isotipo de 44 px y «Alhabla» en negrita normal, no en black. */}
        <Link href="/" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0 lg:h-11 lg:w-11" />
          <p className="text-base font-bold leading-none text-[#0a0a0a]">Alhabla</p>
        </Link>

        {/* Enlaces con aire entre ellos (gap-6/7) y los botones en su propio
            grupo, separados del último enlace. */}
        <nav className="hidden items-center md:flex" aria-label="Navegación principal">
          <div className="flex items-center gap-6 lg:gap-7">
            <SectorsMenu />
            <a href={`${inicio}#como-funciona`} className="enlace-nav">
              Cómo funciona
            </a>
            <Link href={plansHref} className="enlace-nav">
              Precios
            </Link>
            <Link href="/blog" className="enlace-nav">
              Blog
            </Link>
            <a href={`${inicio}#preguntas`} className="enlace-nav">
              Preguntas
            </a>
          </div>
          <div className="ml-8 flex items-center gap-3 lg:ml-10">
            <a href={appUrl("/login")} className="btn-secondary h-10 px-4">
              Iniciar sesión
            </a>
            <Link href={plansHref} className="btn-primary h-10 px-4">
              Empezar ahora
            </Link>
          </div>
        </nav>

        <MobileNav niche={niche} inicio={inicio} />
      </div>
    </header>
  );
}

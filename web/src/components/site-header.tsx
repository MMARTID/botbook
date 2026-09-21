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
export function SiteHeader({ niche }: { niche?: NicheSlug }) {
  const plansHref = buildPlansHref(niche);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <Link href="/" aria-label="Ir al inicio de Alhabla" className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <p className="text-base font-black leading-5 tracking-tight text-[#0a0a0a]">Alhabla</p>
        </Link>

        <nav className="hidden items-center gap-3 md:flex" aria-label="Navegación principal">
          <SectorsMenu />
          <a href="#como-funciona" className="enlace-nav">
            Cómo funciona
          </a>
          <Link href={plansHref} className="enlace-nav">
            Precios
          </Link>
          <Link href="/blog" className="enlace-nav">
            Blog
          </Link>
          <a href="#preguntas" className="enlace-nav">
            Preguntas
          </a>
          <a href={appUrl("/login")} className="btn-secondary h-10 px-4">
            Iniciar sesión
          </a>
          <Link href={plansHref} className="btn-primary h-10 px-4">
            Empezar ahora
          </Link>
        </nav>

        <MobileNav niche={niche} />
      </div>
    </header>
  );
}

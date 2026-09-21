import Link from "next/link";
import { contactEmail } from "@/lib/seo";

/**
 * Pie común de la portada y las landings de sector. Además de lo legal (la
 * razón social va aquí porque las verificaciones de empresa de Meta piden
 * el titular publicado en la web), enlaza a todas las páginas indexables:
 * hasta ahora los sectores solo se alcanzaban desde el desplegable de la
 * cabecera, y un pie con enlaces es la forma más barata de que Google (y
 * quien llega por un artículo) recorra el sitio entero.
 */
const SECTORES = [
  { href: "/peluqueria", label: "Peluquerías" },
  { href: "/barberia", label: "Barberías" },
  { href: "/centro-de-estetica", label: "Centros de estética" },
  { href: "/salon-de-unas", label: "Salones de uñas" },
  { href: "/fisioterapia", label: "Fisioterapia" },
] as const;

const enlace = "inline-flex h-11 items-center transition hover:text-white";

export function SiteFooter() {
  return (
    <footer className="bg-[#0a0a0a] text-white/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <nav
            aria-label="Sectores"
            className="flex flex-wrap items-center gap-x-4 text-sm font-medium"
          >
            {SECTORES.map((sector) => (
              <Link key={sector.href} href={sector.href} className={enlace}>
                {sector.label}
              </Link>
            ))}
          </nav>
          <nav
            aria-label="Más de Alhabla"
            className="flex flex-wrap items-center gap-x-4 text-sm font-medium"
          >
            <Link href="/planes" className={enlace}>
              Planes y precios
            </Link>
            <Link href="/blog" className={enlace}>
              Blog
            </Link>
          </nav>
        </div>
        <div className="flex flex-col gap-4 border-t border-white/10 pt-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm">© 2026 Alhabla</p>
            <p className="text-sm">Titular: Miguel Martín Delgado</p>
          </div>
          <nav
            aria-label="Enlaces legales"
            className="flex flex-wrap items-center gap-x-4 text-sm font-medium"
          >
            <Link href="/legal/privacidad" className={enlace}>
              Privacidad
            </Link>
            <Link href="/legal/aviso-legal" className={enlace}>
              Aviso legal
            </Link>
            <a href={`mailto:${contactEmail}`} className={enlace}>
              Contacto
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { ArrowRight, Check, MapPin } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Reveal } from "@/components/scroll-reveal";
import { nicheLandings, type NicheSlug } from "@/lib/niche-landings";
import { CITIES, CITY_NICHE_STATS, type CitySlug } from "@/lib/city-landings";

const formateador = new Intl.NumberFormat("es-ES");

/**
 * Forma singular de `content.name` para frases como "tu peluquería" o "tu
 * clínica de fisioterapia": `content.name` es un plural (a veces de varias
 * palabras, como "Clínicas y consultas de fisioterapia"), y quitarle solo la
 * "s" final rompía esos casos ("tu clínicas y consultas de fisioterapia").
 */
const SINGULAR_POR_NICHO: Record<NicheSlug, string> = {
  peluqueria: "peluquería",
  barberia: "barbería",
  "salon-de-unas": "salón de uñas",
  "centro-de-estetica": "centro de estética",
  fisioterapia: "clínica de fisioterapia",
};

/** "más de 235" (cota, Google Maps) o "13.279" (cifra exacta, INE). */
function formatearCifra(cifra: number, esCota: boolean) {
  const texto = formateador.format(cifra);
  return esCota ? `más de ${texto}` : texto;
}

/**
 * Copy propio de la página ciudad+nicho: deliberadamente NO reutiliza las
 * frases de `nicheLandings[…].benefits` — misma sustancia, otras palabras.
 * Reutilizar el bloque textual de la landing completa en 6 páginas por
 * nicho sería justo el patrón de "bloque repetido" que arriesga que Google
 * lea el conjunto como contenido fino. El primer punto cambia por nicho; el
 * segundo y el tercero son hechos de producto reales, iguales en las 5
 * landings también — repetir un hecho no es el problema, repetir un párrafo
 * completo sí.
 *
 * `intro` recibe la cifra ya formateada y `unidad` tal cual viene de
 * `CITY_NICHE_STATS` (ya incluye "en Madrid" / "en la provincia de
 * Barcelona" — la construye el dato, no esta plantilla, porque fisioterapia
 * cita una comunidad/provincia y el resto una ciudad).
 */
const COPY_POR_NICHO: Record<NicheSlug, { intro: (cifraTexto: string, unidad: string) => string; primerPunto: string }> = {
  peluqueria: {
    intro: (cifraTexto, unidad) => `Con ${cifraTexto} ${unidad}, quien no coge el teléfono a la primera pierde la cita frente a la de al lado.`,
    primerPunto: "Reserva cortes, color y tratamientos en tu agenda real, sin que nadie del salón suelte el secador.",
  },
  barberia: {
    intro: (cifraTexto, unidad) => `Con ${cifraTexto} ${unidad} compitiendo por el mismo cliente, la que contesta primero se queda con la cita.`,
    primerPunto: "Reserva cortes, barba y afeitado en tu agenda real, sin dejar la máquina a medias.",
  },
  "salon-de-unas": {
    intro: (cifraTexto, unidad) => `Con ${cifraTexto} ${unidad}, cada llamada que no coges es una clienta que reserva en otro sitio.`,
    primerPunto: "Reserva manicura, gel y nail art en tu agenda real, sin interrumpir el servicio.",
  },
  "centro-de-estetica": {
    intro: (cifraTexto, unidad) => `Entre ${cifraTexto} ${unidad}, el que responde al momento es el que se lleva la consulta.`,
    primerPunto: "Reserva faciales, tratamientos corporales y bonos en tu agenda real, sin salir de cabina.",
  },
  fisioterapia: {
    intro: (cifraTexto, unidad) => `Con ${cifraTexto} ${unidad}, un paciente que no consigue cita prueba en la siguiente clínica de la lista.`,
    primerPunto: "Reserva primeras consultas y sesiones en tu agenda real, sin interrumpir el tratamiento.",
  },
};

function buildPlansHref(niche: string) {
  return `/planes?niche=${encodeURIComponent(niche)}`;
}

export function CityNicheLanding({ nicho, ciudad }: { nicho: NicheSlug; ciudad: CitySlug }) {
  const content = nicheLandings[nicho];
  const city = CITIES[ciudad];
  const stat = CITY_NICHE_STATS[ciudad][nicho];
  const cifraTexto = formatearCifra(stat.cifra, stat.esCota);
  const copy = COPY_POR_NICHO[nicho];
  const singular = SINGULAR_POR_NICHO[nicho];
  const a = content.accent;
  const plansHref = buildPlansHref(nicho);

  return (
    <main id="main-content" className="min-h-screen bg-white text-[#0a0a0a]">
      <SiteHeader />

      <nav aria-label="Migas de pan" className="mx-auto max-w-4xl px-4 pt-6 text-sm text-[#71717a] sm:px-6 lg:px-8">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-[#0a0a0a]">Inicio</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={`/${nicho}`} className="hover:text-[#0a0a0a]">{content.name}</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-[#27272a]">{city.name}</li>
        </ol>
      </nav>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Reveal>
          <span className="badge-soft gap-2" style={{ backgroundColor: a.soft, color: a.deep }}>
            <MapPin className="h-3.5 w-3.5" />
            {city.name}
          </span>
          <h1 className="mt-5 text-balance text-4xl font-black leading-[1.05] tracking-[-0.03em] sm:text-5xl">
            Asistente telefónico para {content.name.toLowerCase()} en {city.name}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#52525b]">{copy.intro(cifraTexto, stat.unidad)}</p>
        </Reveal>

        <Reveal delay={0.08} y={12}>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={plansHref} className="btn-primary h-12 px-6">
              Probar Alhabla 7 días <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href={`/${nicho}`} className="btn-secondary h-12 px-6">
              Ver todo lo que Alhabla hace por tu {singular}
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.14} y={14}>
          <div className="panel mt-10 p-6 sm:p-8">
            <p className="text-5xl font-black tracking-tight tabular-nums sm:text-6xl">{cifraTexto}</p>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#52525b]">
              {stat.unidad}, {stat.fuente}.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.2} y={14}>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {[copy.primerPunto, "Atiende con tu número de siempre, sin publicar uno nuevo en " + city.name + ".", "Cambios de horario, precios o bajas de personal, por WhatsApp — sin entrar al panel."].map((texto) => (
              <li key={texto} className="flex items-start gap-2.5 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm leading-6 text-[#27272a]">
                <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: a.strong }} aria-hidden="true" />
                {texto}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.26} y={10}>
          <p className="mt-8 max-w-2xl text-sm leading-6 text-[#52525b]">
            No hace falta que tu negocio tenga presencia física distinta a la de siempre en {city.name}: Alhabla
            funciona con el número de teléfono que ya tienes, atiende en tu horario y reserva en tu Google
            Calendar, Outlook o iCloud, esté tu {singular} donde esté.
          </p>
        </Reveal>
      </section>

      <SiteFooter />
    </main>
  );
}

import { BellRing, CalendarCheck2, CalendarSync, ListOrdered, MessagesSquare } from "lucide-react";
import { SiWhatsapp } from "@icons-pack/react-simple-icons";

import { Reveal } from "@/components/scroll-reveal";

/**
 * Lo que recibe el cliente final por WhatsApp (2026-09-26). Mismas promesas
 * que `WhatsAppBenefitsTable` de las landings de nicho, contadas con una
 * línea de detalle cada una y el plan donde aplica.
 */
const VENTAJAS = [
  {
    Icono: CalendarCheck2,
    titulo: "Confirmación al momento",
    texto: "Nada más colgar le llega su cita por escrito: servicio, día, hora y con quién.",
  },
  {
    Icono: BellRing,
    titulo: "Recordatorio antes de la cita",
    texto: "Un aviso previo que reduce las ausencias y los huecos muertos en tu agenda.",
    plan: "Pro y Scale",
  },
  {
    Icono: CalendarSync,
    titulo: "Cambiar o cancelar sin llamar",
    texto: "Responde al mensaje y listo. El hueco que deja vuelve a estar libre para otro cliente.",
  },
  {
    Icono: ListOrdered,
    titulo: "Lista de espera",
    texto: "Si no hay hueco, se apunta. Cuando alguien cancela, le avisa para que lo coja.",
  },
  {
    Icono: MessagesSquare,
    titulo: "Reservar escribiendo",
    texto: "Quien prefiere escribir a llamar habla con la misma recepcionista por WhatsApp.",
  },
] as const;

export function WhatsAppClientesSection() {
  return (
    <section className="border-b border-[#e5e5e5] py-16 sm:py-24" aria-labelledby="whatsapp-clientes-titulo">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
        <Reveal>
          <span className="badge-soft gap-2">
            <SiWhatsapp className="h-3.5 w-3.5" color="#25D366" aria-hidden="true" />
            Para tus clientes
          </span>
          <h2 id="whatsapp-clientes-titulo" className="mt-5 text-3xl font-black tracking-tight text-[#0a0a0a] sm:text-4xl">
            La cita no acaba al colgar.
          </h2>
          <p className="mt-4 max-w-md text-base leading-7 text-[#52525b] sm:text-lg sm:leading-8">
            Tus clientes reciben su cita por WhatsApp y la gestionan desde ahí, sin volver a llamar. Todo lo que cambian acaba en tu agenda, sin que tengas que tocar nada.
          </p>
        </Reveal>

        <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
          {VENTAJAS.map(({ Icono, titulo, texto, ...resto }, i) => (
            <li key={titulo}>
              <Reveal delay={i * 0.05} y={10} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold text-[#0a0a0a]">
                    {titulo}
                    {"plan" in resto ? (
                      <span className="rounded-full bg-[#f4f4f5] px-2 py-0.5 text-xs font-semibold text-[#52525b]">{resto.plan}</span>
                    ) : null}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#52525b]">{texto}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

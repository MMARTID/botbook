"use client";

import { Fragment, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Phone, Users } from "lucide-react";
import { getAgenda } from "@/lib/api";
import { getCalendarState } from "@/lib/calendar-state";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import {
  INICIALES_DE_DIA,
  claveDeDia,
  diaLargo,
  etiquetaDeDia,
  horaDelNegocio,
  instanteAntesDelDia,
  lunesDe,
  numeroDelDia,
  rangoDeSemana,
  sumarDias,
} from "@/lib/fechas-negocio";
import { enlaceTel } from "@/lib/llamadas";
import type { AgendaBooking, Business } from "@/lib/types";
import { useAhora } from "@/hooks/use-es-movil";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { CabeceraMovil, CLASES_BOTON_REDONDO } from "@/components/movil/cabecera-movil";
import { HojaCita, finDeCita, importeDeCita, nombreDeCita } from "@/components/movil/hoja-cita";
import { VacioMovil } from "@/components/movil/piezas";

const POR_PAGINA = 50;
// El backend no deja pedir más de 60 días atrás: siete semanas caben con
// holgura aunque la semana empiece en domingo por la zona horaria.
const SEMANAS_ATRAS = 7;
const SEMANAS_ADELANTE = 12;

/** Todas las citas de la semana, por páginas: una peluquería llena pasa de
 * las 50 de una sola petición. */
async function citasDeLaSemana(lunes: string) {
  const citas: AgendaBooking[] = [];
  for (let pagina = 0; pagina < 6; pagina += 1) {
    const respuesta = await getAgenda(9, POR_PAGINA, pagina * POR_PAGINA, instanteAntesDelDia(lunes));
    citas.push(...respuesta.bookings);
    if (!respuesta.hasMore) break;
  }
  return citas;
}

function esClaveValida(valor: string | null): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}

/**
 * Agenda de la app móvil: la semana en una franja con un punto por cita y,
 * debajo, un día por pantalla. Hoy lleva la marca «Ahora» y lo pasado se
 * atenúa. Tocar una cita abre su hoja; el teléfono es un botón de 44 px.
 */
export function AgendaMovil({ business }: { business: Business }) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const timeZone = business.timezone || "Europe/Madrid";
  const calendario = getCalendarState(business);
  const ahora = useAhora();
  const hoy = claveDeDia(ahora, timeZone);
  const { aviso, avisar, cerrar } = useAviso();
  const [citaAbierta, setCitaAbierta] = useState<AgendaBooking | null>(null);

  // El día elegido vive en la URL (?dia=): «Ver en la agenda» desde una
  // llamada abre directamente ese día, y atrás vuelve al anterior.
  const pedido = parametros.get("dia");
  const lunesDeHoy = lunesDe(hoy);
  const minimo = sumarDias(lunesDeHoy, -7 * SEMANAS_ATRAS);
  const maximo = sumarDias(lunesDeHoy, 7 * SEMANAS_ADELANTE + 6);
  const elegido = esClaveValida(pedido) && pedido >= minimo && pedido <= maximo ? pedido : hoy;
  const lunes = lunesDe(elegido);
  const elegir = (dia: string) => {
    router.replace(dia === hoy ? pathname : `${pathname}?dia=${dia}`, { scroll: false });
  };

  const consulta = useQuery({
    queryKey: ["agenda-semana", lunes],
    queryFn: () => citasDeLaSemana(lunes),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const porDia = new Map<string, AgendaBooking[]>();
  for (const cita of consulta.data ?? []) {
    const clave = claveDeDia(cita.programedAt, timeZone);
    porDia.set(clave, [...(porDia.get(clave) ?? []), cita]);
  }
  const delDia = porDia.get(elegido) ?? [];
  const dias = Array.from({ length: 7 }, (_, indice) => sumarDias(lunes, indice));
  const puedeAtras = lunes > minimo;
  const puedeAdelante = sumarDias(lunes, 7) <= maximo;
  const indiceAhora = elegido === hoy ? delDia.findIndex((cita) => new Date(cita.programedAt) > ahora) : -2;

  return (
    <div>
      <CabeceraMovil
        titulo="Agenda"
        subtitulo="Las citas que ha reservado tu recepcionista."
        accion={
          calendario.connected ? (
            <a
              href={calendario.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${calendario.label}`}
              className={CLASES_BOTON_REDONDO}
            >
              <ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" />
            </a>
          ) : null
        }
      />

      <div className="flex min-h-11 items-center justify-between">
        <span className="text-[15px] font-bold text-tinta">{rangoDeSemana(lunes)}</span>
        <div className="flex items-center gap-1.5">
          {elegido !== hoy ? (
            <button
              type="button"
              onClick={() => elegir(hoy)}
              className="min-h-11 rounded-full border border-linea bg-superficie px-4 text-sm font-semibold text-tinta-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
            >
              Hoy
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => elegir(sumarDias(elegido, -7) < minimo ? minimo : sumarDias(elegido, -7))}
            disabled={!puedeAtras}
            aria-label="Semana anterior"
            className={CLASES_BOTON_REDONDO}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => elegir(sumarDias(elegido, 7) > maximo ? maximo : sumarDias(elegido, 7))}
            disabled={!puedeAdelante}
            aria-label="Semana siguiente"
            className={CLASES_BOTON_REDONDO}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-1 flex gap-0.5" role="group" aria-label="Días de la semana">
        {dias.map((dia, indice) => {
          const seleccionado = dia === elegido;
          const pasado = dia < hoy;
          const numero = porDia.get(dia)?.length ?? 0;
          return (
            <button
              key={dia}
              type="button"
              onClick={() => elegir(dia)}
              aria-pressed={seleccionado}
              aria-label={`${diaLargo(dia)}, ${numero === 1 ? "1 cita" : `${numero} citas`}`}
              className={`flex min-h-[76px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-2xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${
                seleccionado ? "border-lavado-borde bg-lavado text-morado-tinta" : "border-transparent text-tinta"
              } ${pasado && !seleccionado ? "opacity-55" : ""}`}
            >
              <span className={`text-xs font-semibold ${seleccionado ? "text-morado-tinta" : "text-muted"}`}>
                {INICIALES_DE_DIA[indice]}
              </span>
              <span className={`text-xl font-bold leading-none tabular-nums ${dia === hoy ? "underline underline-offset-4" : ""}`}>
                {numeroDelDia(dia)}
              </span>
              <span className="flex h-[5px] gap-[3px]" aria-hidden="true">
                {Array.from({ length: Math.min(numero, 3) }, (_, punto) => (
                  <span key={punto} className={`h-[5px] w-[5px] rounded-full ${seleccionado ? "bg-morado" : "bg-tenue"}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="mt-[18px] border-t border-linea pb-2 pt-4 text-lg font-bold tracking-[-0.01em] text-tinta">
        {etiquetaDeDia(elegido, hoy)}
        {delDia.length > 0 ? ` · ${delDia.length === 1 ? "1 cita" : `${delDia.length} citas`}` : ""}
      </h2>

      {consulta.isLoading ? (
        <div className="space-y-2.5" aria-label="Cargando agenda">
          {[0, 1, 2].map((indice) => (
            <div key={indice} className="ml-[58px] h-[88px] rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
          ))}
        </div>
      ) : consulta.isError ? (
        <SectionErrorState message="No se pudieron cargar las citas." onRetry={() => void consulta.refetch()} />
      ) : delDia.length === 0 ? (
        <VacioMovil icono={CalendarDays}>No hay citas reservadas para este día.</VacioMovil>
      ) : (
        <>
          <ol className="flex flex-col gap-2.5">
            {delDia.map((cita, indice) => (
              <Fragment key={cita.id}>
                {indice === indiceAhora ? <MarcaAhora hora={horaDelNegocio(ahora, timeZone)} /> : null}
                <FilaDeCita cita={cita} timeZone={timeZone} pasada={finDeCita(cita) <= ahora} onAbrir={() => setCitaAbierta(cita)} />
              </Fragment>
            ))}
            {indiceAhora === -1 ? <MarcaAhora hora={horaDelNegocio(ahora, timeZone)} /> : null}
          </ol>
          <p className="mt-[18px] text-[13px] leading-[1.55] text-muted">
            Solo las citas que ha reservado tu recepcionista.
            {calendario.connected ? ` El resto de tu agenda sigue en ${calendario.label}.` : ""}
          </p>
        </>
      )}

      <HojaCita cita={citaAbierta} timeZone={timeZone} calendario={calendario} onCerrar={() => setCitaAbierta(null)} avisar={avisar} />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

function MarcaAhora({ hora }: { hora: string }) {
  return (
    <li className="flex min-h-5 items-center gap-2.5" aria-label={`Ahora, ${hora}`}>
      <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-morado-tinta">{hora.replace(/^0/, "")}</span>
      <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-morado" aria-hidden="true" />
      <span className="h-0.5 flex-1 rounded-sm bg-morado" aria-hidden="true" />
      <span className="shrink-0 text-xs font-bold text-morado-tinta">Ahora</span>
    </li>
  );
}

function FilaDeCita({
  cita,
  timeZone,
  pasada,
  onAbrir,
}: {
  cita: AgendaBooking;
  timeZone: string;
  pasada: boolean;
  onAbrir: () => void;
}) {
  const importe = importeDeCita(cita);
  const telefono = formatPhoneLocal(cita.clientPhone);

  return (
    <li className="flex items-start gap-2.5">
      <span className={`w-12 shrink-0 pt-4 text-right text-[15px] font-bold tabular-nums ${pasada ? "text-muted" : "text-tinta"}`}>
        {horaDelNegocio(cita.programedAt, timeZone)}
      </span>
      <div
        className={`flex min-w-0 flex-1 items-center gap-1 rounded-2xl border border-linea pr-1.5 ${pasada ? "bg-relleno opacity-70" : "bg-superficie"}`}
      >
        <button
          type="button"
          onClick={onAbrir}
          className="min-h-[72px] min-w-0 flex-1 rounded-2xl py-3 pl-3.5 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
        >
          <span className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-bold leading-snug text-tinta">{nombreDeCita(cita)}</span>
            {importe != null ? <span className="shrink-0 text-sm font-bold tabular-nums text-tinta">{formatPrice(importe)}</span> : null}
          </span>
          <span className="mt-[3px] block text-[13px] leading-[1.45] text-muted">
            {cita.durationMinutes} min · hasta las {horaDelNegocio(finDeCita(cita), timeZone)}
            {cita.professional ? ` · ${cita.professional.name}` : ""}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-medium tabular-nums text-apagado">
            {telefono ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-morado-tinta" aria-hidden="true" />
                {telefono}
              </span>
            ) : (
              <span>Teléfono no disponible</span>
            )}
            {cita.numberPeople > 1 ? (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-morado-tinta" aria-hidden="true" />
                {cita.numberPeople} personas
              </span>
            ) : null}
          </span>
        </button>
        {cita.clientPhone ? (
          <a
            href={enlaceTel(cita.clientPhone)}
            aria-label={`Llamar al cliente al ${telefono}`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-linea bg-superficie text-apagado focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
          >
            <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

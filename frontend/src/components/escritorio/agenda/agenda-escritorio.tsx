"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Phone, TriangleAlert } from "lucide-react";
import { getAgenda, getBookingSettings, moverCita } from "@/lib/api";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import {
  claveDeDia,
  diaLargo,
  horaDelNegocio,
  instanteAntesDelDia,
  lunesDe,
  minutosDelDia,
  rangoDeSemana,
  sumarDias,
} from "@/lib/fechas-negocio";
import { horaDeMinutos, horarioDelNegocio, importeDeCitas, rangoDeHoras, tramosDelDia } from "@/lib/agenda-escritorio";
import { getCalendarState } from "@/lib/calendar-state";
import { enlaceTel } from "@/lib/llamadas";
import type { AgendaBooking, Business } from "@/lib/types";
import { useAhora } from "@/hooks/use-es-movil";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { importeDeCita, nombreDeCita } from "@/components/movil/hoja-cita";
import { ColumnaDelDia, RegletaDeHoras, ALTO_DE_HORA } from "@/components/escritorio/columna-del-dia";
import { Dialogo } from "@/components/escritorio/dialogo";
import { SelectorSegmentado, TiraDePagina } from "@/components/escritorio/piezas";
import { DetalleDeCita } from "@/components/escritorio/agenda/detalle-de-cita";
import { SemanaEnCuadricula } from "@/components/escritorio/agenda/semana";
import { mensajeDeLaRespuesta, useAccionesDeCita } from "@/components/escritorio/agenda/acciones-de-cita";

type Vista = "dia" | "semana" | "lista";
const VISTAS = [
  { valor: "dia", texto: "Día" },
  { valor: "semana", texto: "Semana" },
  { valor: "lista", texto: "Lista" },
] as const;

// El backend no deja pedir más de 60 días atrás.
const SEMANAS_ATRAS = 7;
const SEMANAS_ADELANTE = 26;
const POR_PAGINA = 200;

/** Todas las citas de la semana (9 días por los desfases de zona; lo que
 * sobra se filtra por día). Una semana llena cabe de sobra en una página. */
async function citasDeLaSemana(lunes: string) {
  const citas: AgendaBooking[] = [];
  for (let pagina = 0; pagina < 3; pagina += 1) {
    const respuesta = await getAgenda(9, POR_PAGINA, pagina * POR_PAGINA, instanteAntesDelDia(lunes));
    citas.push(...respuesta.bookings);
    if (!respuesta.hasMore) break;
  }
  return citas;
}

function esClaveValida(valor: string | null): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}

function citasEnTexto(numero: number) {
  return numero === 1 ? "1 cita" : `${numero} citas`;
}

/**
 * Agenda de escritorio (wireframe 1e, con la lista de 1f): la semana en
 * cuadrícula, el día por profesional o la lista por días, con el detalle de
 * la cita a la derecha. Día, vista, cita y profesional viven en la URL: el
 * buscador y «Ver en la agenda» abren directamente una cita.
 */
export function AgendaEscritorio({ business }: { business: Business }) {
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const timeZone = business.timezone || "Europe/Madrid";
  const ahora = useAhora();
  const hoy = claveDeDia(ahora, timeZone);
  const calendario = getCalendarState(business);
  const horario = useMemo(() => horarioDelNegocio(business.schedule), [business.schedule]);
  const { aviso, avisar, cerrar } = useAviso();
  const acciones = useAccionesDeCita(avisar);

  const vistaPedida = parametros.get("vista");
  const vista: Vista = vistaPedida === "dia" || vistaPedida === "lista" ? vistaPedida : "semana";
  const minimo = sumarDias(lunesDe(hoy), -7 * SEMANAS_ATRAS);
  const maximo = sumarDias(lunesDe(hoy), 7 * SEMANAS_ADELANTE + 6);
  const pedido = parametros.get("dia");
  const dia = esClaveValida(pedido) && pedido >= minimo && pedido <= maximo ? pedido : hoy;
  const citaId = parametros.get("cita");
  const profesionalId = parametros.get("pro");
  const lunes = lunesDe(dia);

  const actualizar = useCallback(
    (cambios: Record<string, string | null>) => {
      const siguiente = new URLSearchParams(parametros.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null) siguiente.delete(clave);
        else siguiente.set(clave, valor);
      }
      const texto = siguiente.toString();
      router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false });
    },
    [parametros, pathname, router]
  );

  const consulta = useQuery({
    queryKey: ["agenda-escritorio", lunes],
    queryFn: () => citasDeLaSemana(lunes),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });
  const profesionales = (ajustes.data?.professionals ?? []).filter((profesional) => profesional.active);

  const dias = Array.from({ length: 7 }, (_, indice) => sumarDias(lunes, indice));
  const todas = consulta.data ?? [];
  const visibles = profesionalId ? todas.filter((cita) => cita.professional?.id === profesionalId) : todas;
  const porDia = new Map<string, AgendaBooking[]>();
  for (const cita of visibles) {
    const clave = claveDeDia(cita.programedAt, timeZone);
    if (clave < lunes || clave > dias[6]) continue;
    porDia.set(clave, [...(porDia.get(clave) ?? []), cita]);
  }
  const deLaSemana = dias.flatMap((clave) => porDia.get(clave) ?? []);
  const delDia = porDia.get(dia) ?? [];
  const seleccionada = todas.find((cita) => cita.id === citaId) ?? null;
  const rango = rangoDeHoras(horario, vista === "dia" ? [dia] : dias, vista === "dia" ? delDia : deLaSemana, timeZone);
  const enPantalla = vista === "dia" ? delDia : deLaSemana;
  const importe = importeDeCitas(enPantalla);

  const paso = vista === "dia" ? 1 : 7;
  const anterior = sumarDias(dia, -paso);
  const siguiente = sumarDias(dia, paso);
  const ir = (destino: string) => actualizar({ dia: destino === hoy ? null : destino, cita: null });

  // Escape cierra el detalle (si no hay un diálogo encima).
  useEffect(() => {
    if (!citaId) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !document.querySelector('[aria-modal="true"]')) actualizar({ cita: null });
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [citaId, actualizar]);

  const [soltada, setSoltada] = useState<{ cita: AgendaBooking; dia: string; minuto: number } | null>(null);
  const abrir = (cita: AgendaBooking) => actualizar({ cita: cita.id === citaId ? null : cita.id });

  const mover = (cita: AgendaBooking, datos: { fechaHora: string; profesionalId?: string }) =>
    acciones.mover.mutate(
      { id: cita.id, ...datos },
      {
        onSuccess: () => {
          setSoltada(null);
          const nuevoDia = datos.fechaHora.slice(0, 10);
          actualizar({ dia: nuevoDia === hoy ? null : nuevoDia, cita: cita.id });
        },
      }
    );

  return (
    <div className="flex h-screen flex-col">
      <TiraDePagina icono={CalendarRange} titulo="Agenda">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => ir(anterior < minimo ? minimo : anterior)}
            disabled={lunesDe(dia) <= minimo && vista !== "dia"}
            aria-label={vista === "dia" ? "Día anterior" : "Semana anterior"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#27272a] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-[10.5rem] text-center text-[15px] font-bold tabular-nums text-[#0a0a0a]" aria-live="polite">
            {vista === "dia" ? diaLargo(dia) : rangoDeSemana(lunes)}
          </span>
          <button
            type="button"
            onClick={() => ir(siguiente > maximo ? maximo : siguiente)}
            disabled={siguiente > maximo}
            aria-label={vista === "dia" ? "Día siguiente" : "Semana siguiente"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#27272a] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {dia !== hoy ? (
            <button
              type="button"
              onClick={() => ir(hoy)}
              className="ml-1 h-9 rounded-full border border-[#e5e5e5] bg-white px-3.5 text-sm font-semibold text-[#27272a] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              Hoy
            </button>
          ) : null}
        </div>
        <SelectorSegmentado
          opciones={VISTAS}
          valor={vista}
          onCambiar={(valor) => actualizar({ vista: valor === "semana" ? null : valor })}
          etiqueta="Cómo ver la agenda"
        />
        <span className="flex-1" />
        {profesionales.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Profesional">
            {[{ id: null, name: "Todos" }, ...profesionales].map((profesional) => {
              const elegido = (profesional.id ?? null) === (profesionalId ?? null);
              return (
                <button
                  key={profesional.id ?? "todos"}
                  type="button"
                  role="radio"
                  aria-checked={elegido}
                  onClick={() => actualizar({ pro: profesional.id })}
                  className={`h-8 rounded-full border px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                    elegido ? "border-[#ddd6fe] bg-[#f3eeff] text-[#6d28d9]" : "border-[#e5e5e5] bg-white text-[#52525b] hover:text-[#0a0a0a]"
                  }`}
                >
                  {profesional.name}
                </button>
              );
            })}
          </div>
        ) : null}
        {calendario.connected ? (
          <a
            href={calendario.webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary h-9 shrink-0 px-3.5 text-sm"
          >
            Abrir {calendario.shortLabel}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </TiraDePagina>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-[#f0f0f0] px-8 py-2 text-sm text-muted">
            {consulta.isLoading ? (
              "Cargando…"
            ) : (
              <>
                <span>
                  <strong className="font-semibold text-[#27272a]">{citasEnTexto(enPantalla.length)}</strong>
                  {importe != null ? ` · ${formatPrice(importe)} según el precio de los servicios` : ""}
                </span>
                <span className="flex-1" />
                <span>
                  Solo las citas reservadas con Alhabla.{calendario.connected ? ` El resto sigue en ${calendario.label}.` : ""}
                </span>
              </>
            )}
          </div>
          {consulta.isLoading ? (
            <div className="m-8 flex-1 rounded-3xl bg-[#f4f4f5] motion-safe:animate-pulse" aria-label="Cargando agenda" />
          ) : consulta.isError ? (
            <SectionErrorState className="m-8" message="No se pudieron cargar las citas." onRetry={() => void consulta.refetch()} />
          ) : vista === "semana" ? (
            <SemanaEnCuadricula
              dias={dias}
              citasPorDia={porDia}
              rango={rango}
              horario={horario}
              timeZone={timeZone}
              ahora={ahora}
              hoy={hoy}
              seleccionada={citaId}
              onAbrir={abrir}
              onElegirDia={(destino) => actualizar({ dia: destino === hoy ? null : destino, vista: "dia" })}
              onSoltar={
                calendario.connected
                  ? (cita, destino, minuto) => {
                      if (destino < hoy || (destino === hoy && minuto <= minutosDelDia(ahora, timeZone))) {
                        avisar("Esa hora ya ha pasado: elige un hueco de hoy en adelante.", "error");
                        return;
                      }
                      setSoltada({ cita, dia: destino, minuto });
                    }
                  : null
              }
            />
          ) : vista === "dia" ? (
            <VistaDelDia
              citas={delDia}
              dia={dia}
              hoy={hoy}
              rango={rango}
              tramos={tramosDelDia(horario, dia)}
              profesionales={profesionalId ? profesionales.filter((profesional) => profesional.id === profesionalId) : profesionales}
              timeZone={timeZone}
              ahora={ahora}
              seleccionada={citaId}
              onAbrir={abrir}
            />
          ) : (
            <VistaDeLista dias={dias} porDia={porDia} hoy={hoy} timeZone={timeZone} seleccionada={citaId} onAbrir={abrir} />
          )}
        </div>

        {seleccionada ? (
          <DetalleDeCita
            cita={seleccionada}
            timeZone={timeZone}
            ahora={ahora}
            horario={horario}
            profesionales={profesionales}
            calendario={calendario}
            onCerrar={() => actualizar({ cita: null })}
            onMover={(datos) => mover(seleccionada, datos)}
            moviendo={acciones.mover.isPending}
            onCancelar={() =>
              acciones.cancelar.mutate(seleccionada.id, { onSuccess: () => actualizar({ cita: null }) })
            }
            cancelando={acciones.cancelar.isPending}
            avisar={avisar}
          />
        ) : null}
      </div>

      {soltada ? (
        <ConfirmarMovimiento
          soltada={soltada}
          timeZone={timeZone}
          moviendo={acciones.mover.isPending}
          onCerrar={() => setSoltada(null)}
          onConfirmar={(fechaHora) => mover(soltada.cita, { fechaHora })}
        />
      ) : null}

      <Dialogo
        abierto={Boolean(acciones.avisoPendiente)}
        onCerrar={acciones.descartarAviso}
        titulo={`¿Avisamos a ${acciones.avisoPendiente?.cliente ?? "tu cliente"} por WhatsApp?`}
        descripcion={
          acciones.avisoPendiente
            ? `Le mandamos un mensaje ${acciones.avisoPendiente.tipo === "cambio" ? "con la nueva hora" : "diciendo que su cita queda cancelada"} al ${formatPhoneLocal(acciones.avisoPendiente.telefono) ?? acciones.avisoPendiente.telefono}.`
            : undefined
        }
        pie={
          acciones.avisoPendiente ? (
            <>
              <a
                href={enlaceTel(acciones.avisoPendiente.telefono)}
                onClick={acciones.descartarAviso}
                className="btn-secondary h-10 px-4"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Le llamo yo
              </a>
              <button
                type="button"
                onClick={() => acciones.avisoPendiente && acciones.avisarAlCliente.mutate(acciones.avisoPendiente)}
                disabled={acciones.avisarAlCliente.isPending}
                className="btn-primary h-10 px-4"
              >
                {acciones.avisarAlCliente.isPending ? "Enviando…" : "Avisar por WhatsApp"}
              </button>
            </>
          ) : null
        }
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

/** Tras soltar una cita en otro hueco: se comprueba el hueco real (horario,
 * profesionales, calendario externo) antes de pedir el «sí». */
function ConfirmarMovimiento({
  soltada,
  timeZone,
  moviendo,
  onCerrar,
  onConfirmar,
}: {
  soltada: { cita: AgendaBooking; dia: string; minuto: number };
  timeZone: string;
  moviendo: boolean;
  onCerrar: () => void;
  onConfirmar: (fechaHora: string) => void;
}) {
  const { cita, dia, minuto } = soltada;
  const fechaHora = `${dia}T${horaDeMinutos(minuto)}`;
  const hueco = useQuery({
    queryKey: ["hueco", cita.id, fechaHora, ""],
    queryFn: () => moverCita(cita.id, { fechaHora, soloComprobar: true }),
    retry: false,
    staleTime: 15_000,
  });
  const antes = `${diaLargo(claveDeDia(cita.programedAt, timeZone))}, ${horaDelNegocio(cita.programedAt, timeZone)}`;
  const despues = `${diaLargo(dia)}, ${horaDeMinutos(minuto)}`;

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo="¿Mover esta cita?"
      descripcion={`${nombreDeCita(cita)}${cita.clientName ? ` de ${cita.clientName}` : ""}${cita.professional ? ` con ${cita.professional.name}` : ""}.`}
      pie={
        <>
          <button type="button" onClick={onCerrar} className="btn-secondary h-10 px-4">
            No moverla
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(fechaHora)}
            disabled={!hueco.isSuccess || moviendo}
            className="btn-primary h-10 px-4"
          >
            {moviendo ? "Moviendo…" : `Mover a las ${horaDeMinutos(minuto)}`}
          </button>
        </>
      }
    >
      <dl className="space-y-1.5 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Ahora</dt>
          <dd className="font-semibold text-[#71717a] line-through decoration-1">{antes}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Pasa a</dt>
          <dd className="font-bold text-[#0a0a0a]">{despues}</dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-sm leading-6" role="status">
        {hueco.isFetching ? (
          <>
            <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-[#8b5cf6]" aria-hidden="true" />
            <span className="text-muted">Comprobando el hueco en tu calendario…</span>
          </>
        ) : hueco.isError ? (
          <>
            <TriangleAlert className="mt-1 h-4 w-4 shrink-0 text-[#c53030]" aria-hidden="true" />
            <span className="text-[#c53030]">{mensajeDeLaRespuesta(hueco.error, "No se ha podido comprobar ese hueco.")}</span>
          </>
        ) : (
          <>
            <Check className="mt-1 h-4 w-4 shrink-0 text-[#2c7334]" aria-hidden="true" />
            <span className="font-semibold text-[#2c7334]">Hueco libre. Se cambia también en tu calendario.</span>
          </>
        )}
      </p>
    </Dialogo>
  );
}

/** Un día con una columna por profesional (y «Sin asignar» si hace falta). */
function VistaDelDia({
  citas,
  dia,
  hoy,
  rango,
  tramos,
  profesionales,
  timeZone,
  ahora,
  seleccionada,
  onAbrir,
}: {
  citas: AgendaBooking[];
  dia: string;
  hoy: string;
  rango: { desde: number; hasta: number };
  tramos: ReturnType<typeof tramosDelDia>;
  profesionales: Array<{ id: string; name: string }>;
  timeZone: string;
  ahora: Date;
  seleccionada: string | null;
  onAbrir: (cita: AgendaBooking) => void;
}) {
  const columnas: Array<{ id: string; nombre: string; citas: AgendaBooking[] }> =
    profesionales.length > 1
      ? profesionales.map((profesional) => ({
          id: profesional.id,
          nombre: profesional.name,
          citas: citas.filter((cita) => cita.professional?.id === profesional.id),
        }))
      : [{ id: "todas", nombre: profesionales[0]?.name ?? "Citas", citas }];
  const sinAsignar = profesionales.length > 1 ? citas.filter((cita) => !profesionales.some((p) => p.id === cita.professional?.id)) : [];
  if (sinAsignar.length > 0) columnas.push({ id: "sin-asignar", nombre: "Sin asignar", citas: sinAsignar });
  const cerrado = tramos !== null && tramos.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-[#e5e5e5]">
        <div className="w-14 shrink-0" />
        {columnas.map((columna) => (
          <div key={columna.id} className="min-w-0 flex-1 border-l border-[#f0f0f0] py-2.5 text-center text-sm font-semibold text-[#27272a]">
            {columna.nombre}
            <span className="ml-1.5 text-xs text-muted">· {columna.citas.length}</span>
          </div>
        ))}
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex pb-6 pt-3">
          <RegletaDeHoras rango={rango} />
          {columnas.map((columna) => (
            <div key={columna.id} className={`flex min-w-0 flex-1 border-l border-[#f0f0f0] ${dia === hoy ? "bg-[#faf8ff]" : ""}`}>
              <ColumnaDelDia
                citas={columna.citas}
                rango={rango}
                tramos={tramos}
                timeZone={timeZone}
                ahora={ahora}
                esHoy={dia === hoy}
                seleccionada={seleccionada}
                onAbrir={onAbrir}
                cerradoTodoElDia={cerrado}
                alto={ALTO_DE_HORA}
              />
            </div>
          ))}
        </div>
        {citas.length === 0 ? (
          <p className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-semibold text-muted shadow-sm">
            {cerrado ? "Ese día el negocio está cerrado." : "No hay citas reservadas este día."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** La semana en filas (wireframe 1f): cabecera fija por día con su total,
 * para cuadrar la caja. */
function VistaDeLista({
  dias,
  porDia,
  hoy,
  timeZone,
  seleccionada,
  onAbrir,
}: {
  dias: string[];
  porDia: Map<string, AgendaBooking[]>;
  hoy: string;
  timeZone: string;
  seleccionada: string | null;
  onAbrir: (cita: AgendaBooking) => void;
}) {
  const conCitas = dias.filter((dia) => (porDia.get(dia)?.length ?? 0) > 0);
  if (conCitas.length === 0) {
    return (
      <div className="flex flex-1 items-start justify-center p-10">
        <p className="flex items-center gap-2 rounded-2xl border border-dashed border-[#e5e5e5] bg-[#fafafa] px-5 py-4 text-sm text-muted">
          <CalendarDays className="h-4 w-4 text-[#8b5cf6]" aria-hidden="true" />
          No hay citas reservadas esta semana.
        </p>
      </div>
    );
  }
  const columnas = "grid grid-cols-[64px_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_76px_76px_44px] items-center gap-4";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" role="table" aria-label="Citas de la semana">
      <div role="row" className={`${columnas} sticky top-0 z-20 border-b border-[#e5e5e5] bg-[#fafafa] px-8 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted`}>
        <span role="columnheader">Hora</span>
        <span role="columnheader">Servicio</span>
        <span role="columnheader">Profesional</span>
        <span role="columnheader">Cliente</span>
        <span role="columnheader">Duración</span>
        <span role="columnheader" className="text-right">Precio</span>
        <span role="columnheader" className="sr-only">Llamar</span>
      </div>
      {conCitas.map((dia) => {
        const citas = porDia.get(dia) ?? [];
        const importe = importeDeCitas(citas);
        return (
          <div key={dia} role="rowgroup">
            <div role="row" className="sticky top-[33px] z-10 border-b border-[#ede9fe] bg-[#faf8ff] px-8 py-2 text-sm font-bold text-[#0a0a0a]">
              <span role="cell">
                {dia === hoy ? "Hoy" : dia === sumarDias(hoy, 1) ? "Mañana" : diaLargo(dia)}
                <span className="ml-2 font-semibold text-muted">
                  {citasEnTexto(citas.length)}
                  {importe != null ? ` · ${formatPrice(importe)}` : ""}
                </span>
              </span>
            </div>
            {citas.map((cita) => {
              const precio = importeDeCita(cita);
              const elegida = cita.id === seleccionada;
              return (
                <div
                  key={cita.id}
                  role="row"
                  aria-selected={elegida}
                  className={`${columnas} border-b border-[#f4f4f5] px-8 text-sm ${elegida ? "bg-[#f3eeff] shadow-[inset_3px_0_0_#8b5cf6]" : "hover:bg-[#fafafa]"}`}
                >
                  <button
                    type="button"
                    onClick={() => onAbrir(cita)}
                    className="col-span-6 grid min-h-12 grid-cols-subgrid items-center py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
                  >
                    <span role="cell" className="font-bold tabular-nums text-[#0a0a0a]">{horaDelNegocio(cita.programedAt, timeZone)}</span>
                    <span role="cell" className="truncate font-semibold text-[#0a0a0a]">{nombreDeCita(cita)}</span>
                    <span role="cell" className="truncate text-[#52525b]">{cita.professional?.name ?? "Sin asignar"}</span>
                    <span role="cell" className="min-w-0">
                      <span className="block truncate text-[#27272a]">{cita.clientName ?? "Sin nombre"}</span>
                      <span className="block truncate text-xs tabular-nums text-muted">{formatPhoneLocal(cita.clientPhone) ?? "Sin teléfono"}</span>
                    </span>
                    <span role="cell" className="tabular-nums text-[#52525b]">{cita.durationMinutes} min</span>
                    <span role="cell" className="text-right font-semibold tabular-nums text-[#0a0a0a]">{precio != null ? formatPrice(precio) : "—"}</span>
                  </button>
                  <span role="cell" className="flex justify-end">
                    {cita.clientPhone ? (
                      <a
                        href={enlaceTel(cita.clientPhone)}
                        aria-label={`Llamar a ${cita.clientName ?? formatPhoneLocal(cita.clientPhone)}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#52525b] transition hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                      >
                        <Phone className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

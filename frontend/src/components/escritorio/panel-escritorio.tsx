"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, LayoutDashboard, PhoneCall, PhoneForwarded } from "lucide-react";
import { getAgenda, getCalls, getStats } from "@/lib/api";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import { claveDeDia, diaLargo, horaDelNegocio, instanteAntesDelDia, sumarDias } from "@/lib/fechas-negocio";
import { horarioDelNegocio, importeDeCitas, rangoDeHoras, tramosDelDia } from "@/lib/agenda-escritorio";
import { getCalendarState } from "@/lib/calendar-state";
import { momentoCorto } from "@/lib/llamadas";
import type { AgendaBooking, Business } from "@/lib/types";
import { useAhora } from "@/hooks/use-es-movil";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { CallForwardingCard } from "@/components/call-forwarding-card";
import { SectionErrorState } from "@/components/section-card";
import { useEstadoDelServicio } from "@/components/movil/estado-del-servicio";
import { FilaLlamada } from "@/components/movil/fila-llamada";
import { nombreDeCita, importeDeCita } from "@/components/movil/hoja-cita";
import {
  CitasSinReservar,
  GuiaDeConfiguracion,
  TarjetaDeAviso,
  UltimosSieteDias,
} from "@/components/movil/inicio-movil";
import { TituloDeSeccion, VacioMovil } from "@/components/movil/piezas";
import { ColumnaDelDia, RegletaDeHoras } from "@/components/escritorio/columna-del-dia";
import { Dialogo } from "@/components/escritorio/dialogo";
import { SelectorSegmentado, TiraDePagina } from "@/components/escritorio/piezas";

type Vista = "hoy" | "manana" | "semana";

const VISTAS = [
  { valor: "hoy", texto: "Hoy" },
  { valor: "manana", texto: "Mañana" },
  { valor: "semana", texto: "7 días" },
] as const;

function citasEnTexto(numero: number) {
  return numero === 1 ? "1 cita" : `${numero} citas`;
}

function enMinusculaInicial(texto: string) {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

/**
 * Panel de escritorio (wireframes 1d + 1c): el día como protagonista a la
 * izquierda, en una columna de horas; a la derecha, primero lo que exige
 * hacer algo (citas que se cayeron, el desvío, la guía de configuración) y
 * después las cifras de la semana y las últimas conversaciones. Las piezas
 * de la derecha son las mismas que las de Inicio en el móvil.
 */
export function PanelEscritorio({
  business,
  avisoDeCalendario,
}: {
  business: Business;
  avisoDeCalendario: { type: "success" | "error"; message: string } | null;
}) {
  const router = useRouter();
  const timeZone = business.timezone || "Europe/Madrid";
  const ahora = useAhora();
  const hoy = claveDeDia(ahora, timeZone);
  const estado = useEstadoDelServicio(business);
  const calendario = getCalendarState(business);
  const { aviso, avisar, cerrar } = useAviso();
  const [vista, setVista] = useState<Vista>("hoy");
  const [desvioAbierto, setDesvioAbierto] = useState(false);

  const agendaQuery = useQuery({
    queryKey: ["agenda-panel", hoy],
    queryFn: () => getAgenda(9, 200, 0, instanteAntesDelDia(hoy)),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats });
  const llamadasQuery = useQuery({
    queryKey: ["recent-calls"],
    queryFn: () => getCalls(6, 0),
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const citas = (agendaQuery.data?.bookings ?? []).filter((cita) => claveDeDia(cita.programedAt, timeZone) >= hoy);
  const porDia = new Map<string, AgendaBooking[]>();
  for (const cita of citas) {
    const clave = claveDeDia(cita.programedAt, timeZone);
    porDia.set(clave, [...(porDia.get(clave) ?? []), cita]);
  }
  const manana = sumarDias(hoy, 1);
  const diaVisto = vista === "manana" ? manana : hoy;
  const delDia = porDia.get(diaVisto) ?? [];
  const deLaSemana = citas.filter((cita) => claveDeDia(cita.programedAt, timeZone) <= sumarDias(hoy, 6));
  const visibles = vista === "semana" ? deLaSemana : delDia;
  const importe = importeDeCitas(visibles);
  const horario = horarioDelNegocio(business.schedule);
  const tramos = tramosDelDia(horario, diaVisto);
  const rango = rangoDeHoras(horario, [diaVisto], delDia, timeZone);
  const deManana = porDia.get(manana) ?? [];
  const abrirCita = (cita: AgendaBooking) =>
    router.push(`/agenda?dia=${claveDeDia(cita.programedAt, timeZone)}&cita=${encodeURIComponent(cita.id)}`);

  const forwarding = estado.onboardingQuery.data?.forwarding;
  const desvioPendiente = Boolean(forwarding && forwarding.status !== "done");
  const guiaActiva = Boolean(estado.onboardingQuery.data?.isActive);
  const hayAtencion =
    estado.pendientes.length > 0 ||
    estado.pendientesQuery.isError ||
    estado.onboardingQuery.isError ||
    desvioPendiente ||
    !calendario.connected ||
    guiaActiva;
  const llamadas = (llamadasQuery.data?.data ?? []).slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col">
      <TiraDePagina icono={LayoutDashboard} titulo="Tu negocio, al día" subtitulo={diaLargo(hoy)}>
        <span className="flex-1" />
        <Link href="/agente" className="btn-secondary h-10 shrink-0 px-4">
          Configurar agente
        </Link>
      </TiraDePagina>

      <div className="flex-1 space-y-5 px-8 py-6">
        {avisoDeCalendario ? (
          <p
            role="status"
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              avisoDeCalendario.type === "success"
                ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]"
                : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"
            }`}
          >
            {avisoDeCalendario.message}
          </p>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          {hayAtencion ? (
            <div className="space-y-3 xl:col-start-2 xl:row-start-1" aria-label="Requiere tu atención">
              <CitasSinReservar
                pendientes={estado.pendientes}
                error={estado.pendientesQuery.isError}
                onReintentar={() => void estado.pendientesQuery.refetch()}
                timeZone={timeZone}
                avisar={avisar}
              />
              {estado.onboardingQuery.isError ? (
                <SectionErrorState
                  message="No hemos podido comprobar si el desvío de llamadas está activo. Hasta que no lo esté, tus clientes no llegan a tu recepcionista."
                  onRetry={() => void estado.onboardingQuery.refetch()}
                />
              ) : desvioPendiente && forwarding ? (
                <button
                  id="desvio"
                  type="button"
                  onClick={() => setDesvioAbierto(true)}
                  className="flex min-h-16 w-full items-center gap-3 rounded-[20px] border border-[#f0dfa8] bg-[#fef8e7] py-3.5 pl-4 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#9f7a15]" aria-hidden="true">
                    <PhoneForwarded className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-[#806012]">
                      {forwarding.status === "waiting_number" ? "Estamos activando tu número" : "Falta desviar tu teléfono"}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-[1.45] text-[#52525b]">
                      {forwarding.status === "waiting_number"
                        ? "En unos minutos podrás desviar tus llamadas."
                        : "Sin desvío no entra ninguna llamada a tu recepcionista."}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-[#806012]">
                    {forwarding.status === "waiting_number" ? "Ver" : "Activarlo"}
                  </span>
                </button>
              ) : null}
              {!calendario.connected ? (
                <TarjetaDeAviso
                  href="/agente?section=calendar-section"
                  icono={CalendarDays}
                  titulo={calendario.expired ? "Vuelve a conectar tu agenda" : "Conecta tu agenda"}
                  texto={
                    calendario.expired
                      ? `La conexión con ${calendario.label} ha caducado: sin ella no se reservan citas.`
                      : "Sin ella, tu recepcionista no puede reservar citas."
                  }
                />
              ) : null}
              {estado.onboardingQuery.data ? <GuiaDeConfiguracion estado={estado.onboardingQuery.data} /> : null}
            </div>
          ) : null}

          <section className="panel overflow-hidden xl:col-start-1 xl:row-span-2 xl:row-start-1" aria-labelledby="titulo-del-dia">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#e5e5e5] px-5 py-3.5">
              <h2 id="titulo-del-dia" className="text-lg font-bold tracking-[-0.01em] text-[#0a0a0a]">
                {vista === "hoy" ? "Hoy" : vista === "manana" ? "Mañana" : "Próximos 7 días"}
              </h2>
              {agendaQuery.data ? (
                <span className="text-sm text-muted">
                  {[
                    vista === "semana" ? null : enMinusculaInicial(diaLargo(diaVisto)),
                    citasEnTexto(visibles.length),
                    importe != null ? formatPrice(importe) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
              <span className="flex-1" />
              <SelectorSegmentado opciones={VISTAS} valor={vista} onCambiar={setVista} etiqueta="Qué días ver" />
            </div>

            {agendaQuery.isLoading ? (
              <div className="m-5 h-[420px] rounded-2xl bg-[#f4f4f5] motion-safe:animate-pulse" aria-label="Cargando agenda" />
            ) : agendaQuery.isError ? (
              <SectionErrorState className="m-5" message="No se pudieron cargar las citas." onRetry={() => void agendaQuery.refetch()} />
            ) : vista === "semana" ? (
              <ListaDeLaSemana citas={deLaSemana} hoy={hoy} timeZone={timeZone} onAbrir={abrirCita} />
            ) : (
              <>
                <div className="relative flex px-4 pb-4 pt-3">
                  <RegletaDeHoras rango={rango} />
                  <ColumnaDelDia
                    citas={delDia}
                    rango={rango}
                    tramos={tramos}
                    timeZone={timeZone}
                    ahora={ahora}
                    esHoy={diaVisto === hoy}
                    onAbrir={abrirCita}
                    cerradoTodoElDia={tramos !== null && tramos.length === 0}
                  />
                  {delDia.length === 0 ? (
                    <p className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-semibold text-muted shadow-sm">
                      {tramos !== null && tramos.length === 0
                        ? "Cerrado: no hay citas."
                        : `Sin citas reservadas para ${vista === "hoy" ? "hoy" : "mañana"}.`}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 border-t border-[#e5e5e5] bg-[#fafafa] px-5 py-3 text-sm">
                  {vista === "hoy" ? (
                    <>
                      <span className="text-muted">
                        <strong className="font-semibold text-[#27272a]">Mañana:</strong>{" "}
                        {deManana.length === 0
                          ? "sin citas"
                          : `${citasEnTexto(deManana.length)}, la primera a las ${horaDelNegocio(deManana[0].programedAt, timeZone)}`}
                      </span>
                      <span className="flex-1" />
                    </>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Link
                    href={`/agenda?dia=${diaVisto}`}
                    className="inline-flex min-h-9 items-center gap-1 font-semibold text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                  >
                    Ver en la agenda
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </>
            )}
          </section>

          <div className={`space-y-6 xl:col-start-2 ${hayAtencion ? "xl:row-start-2" : "xl:row-start-1"}`}>
            {statsQuery.data?.week ? <UltimosSieteDias semana={statsQuery.data.week} className="" /> : null}
            <section>
              <TituloDeSeccion enlace={{ href: "/llamadas", etiqueta: "Ver todas" }} className="mb-1">
                Llamadas recientes
              </TituloDeSeccion>
              {llamadasQuery.isLoading ? (
                <div className="space-y-2 pt-2" aria-label="Cargando llamadas recientes">
                  {[0, 1, 2].map((indice) => (
                    <div key={indice} className="h-16 rounded-2xl bg-[#f4f4f5] motion-safe:animate-pulse" aria-hidden="true" />
                  ))}
                </div>
              ) : llamadasQuery.isError ? (
                <SectionErrorState message="No se pudieron cargar las llamadas." onRetry={() => void llamadasQuery.refetch()} />
              ) : llamadas.length === 0 ? (
                <VacioMovil icono={PhoneCall} titulo="Aún no hay llamadas" className="mt-2">
                  En cuanto el agente atienda a un cliente, la llamada aparecerá aquí con su resultado.
                </VacioMovil>
              ) : (
                <ul>
                  {llamadas.map((call) => (
                    <li key={call.id} className="border-t border-[#e5e5e5]">
                      <FilaLlamada
                        call={call}
                        momento={momentoCorto(call.startedAt, timeZone, hoy)}
                        onAbrir={() => router.push(`/llamadas?llamada=${encodeURIComponent(call.id)}`)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      {forwarding ? (
        <Dialogo
          abierto={desvioAbierto}
          onCerrar={() => setDesvioAbierto(false)}
          titulo="Desvía tu teléfono a la recepcionista"
          descripcion="Es lo último para que tus clientes lleguen a ella."
          ancho="lg"
        >
          <CallForwardingCard forwarding={forwarding} customerLineType={business.customerLineType ?? null} />
        </Dialogo>
      ) : null}
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

/** «7 días»: las citas por día, en filas, para ver de un vistazo cuánto
 * trabajo viene y cuánto suma. */
function ListaDeLaSemana({
  citas,
  hoy,
  timeZone,
  onAbrir,
}: {
  citas: AgendaBooking[];
  hoy: string;
  timeZone: string;
  onAbrir: (cita: AgendaBooking) => void;
}) {
  if (citas.length === 0) {
    return (
      <div className="p-5">
        <VacioMovil icono={CalendarDays}>No hay citas reservadas en los próximos 7 días.</VacioMovil>
      </div>
    );
  }
  const dias = Array.from({ length: 7 }, (_, indice) => sumarDias(hoy, indice));
  return (
    <div className="max-h-[640px] overflow-y-auto">
      {dias.map((dia) => {
        const delDia = citas.filter((cita) => claveDeDia(cita.programedAt, timeZone) === dia);
        if (delDia.length === 0) return null;
        const importe = importeDeCitas(delDia);
        return (
          <section key={dia}>
            <h3 className="sticky top-0 z-10 flex items-baseline gap-2 border-y border-[#ede9fe] bg-[#faf8ff] px-5 py-2 text-sm font-bold text-[#0a0a0a]">
              {dia === hoy ? "Hoy" : dia === sumarDias(hoy, 1) ? "Mañana" : diaLargo(dia)}
              <span className="font-semibold text-muted">
                {citasEnTexto(delDia.length)}
                {importe != null ? ` · ${formatPrice(importe)}` : ""}
              </span>
            </h3>
            <ul>
              {delDia.map((cita) => {
                const precio = importeDeCita(cita);
                return (
                  <li key={cita.id} className="border-b border-[#f4f4f5] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onAbrir(cita)}
                      className="grid min-h-12 w-full grid-cols-[56px_minmax(0,1fr)_minmax(0,140px)_72px] items-center gap-3 px-5 py-2 text-left text-sm transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
                    >
                      <span className="font-bold tabular-nums text-[#0a0a0a]">{horaDelNegocio(cita.programedAt, timeZone)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[#0a0a0a]">{nombreDeCita(cita)}</span>
                        <span className="block truncate text-xs text-muted">
                          {cita.clientName ?? formatPhoneLocal(cita.clientPhone) ?? "Cliente sin nombre"}
                        </span>
                      </span>
                      <span className="truncate text-muted">{cita.professional?.name ?? "Sin asignar"}</span>
                      <span className="text-right font-semibold tabular-nums text-[#0a0a0a]">{precio != null ? formatPrice(precio) : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

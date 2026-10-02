"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Phone,
  PhoneCall,
  TriangleAlert,
} from "lucide-react";
import { dismissOnboarding, getAgenda, getCalls, getStats, resolverCitaPendiente } from "@/lib/api";
import { AGENT_CONFIGURATION_STEPS } from "@/lib/agent-configuration";
import { getCalendarState } from "@/lib/calendar-state";
import { formatPhoneLocal, formatPrice } from "@/lib/format";
import { claveDeDia, diaDeLaSemana, diaLargo, horaDelNegocio, instanteAntesDelDia, numeroDelDia } from "@/lib/fechas-negocio";
import { enlaceTel, momentoCorto, motivoDeCitaPendiente } from "@/lib/llamadas";
import type { AgendaBooking, Business, OnboardingState, PendingBooking, WeeklyStats } from "@/lib/types";
import { useAhora } from "@/hooks/use-es-movil";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { BrandMark } from "@/components/brand-mark";
import { CallForwardingCard } from "@/components/call-forwarding-card";
import { SectionErrorState } from "@/components/section-card";
import { CabeceraMovil } from "@/components/movil/cabecera-movil";
import { usePorDevolver } from "@/components/movil/barra-de-pestanas";
import { ChipDeEstado, HojaEstado, cuandoPedia, useEstadoDelServicio } from "@/components/movil/estado-del-servicio";
import { FilaLlamada } from "@/components/movil/fila-llamada";
import { HojaCita, finDeCita, nombreDeCita } from "@/components/movil/hoja-cita";
import { HojaLlamada } from "@/components/movil/hoja-llamada";
import { AzulejoIcono, TituloDeSeccion, VacioMovil } from "@/components/movil/piezas";

const NOMBRES_DE_DIA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function cuentaAtras(minutos: number) {
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `en ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `en ${horas} h${resto ? ` ${resto} min` : ""}`;
}

/**
 * Inicio de la app móvil, ordenado por urgencia: lo que hay que atender
 * (citas que se cayeron, el desvío, minutos, agenda), la próxima cita con
 * Llamar a un toque, la guía plegada, el resto del día, las llamadas y el
 * resumen de la semana. El estado del servicio es un chip en la cabecera.
 */
export function InicioMovil({
  business,
  avisoDeCalendario,
}: {
  business: Business;
  /** Vuelta de la conexión OAuth del calendario. */
  avisoDeCalendario: { type: "success" | "error"; message: string } | null;
}) {
  const timeZone = business.timezone || "Europe/Madrid";
  const ahora = useAhora();
  const hoy = claveDeDia(ahora, timeZone);
  const estado = useEstadoDelServicio(business);
  const porDevolver = usePorDevolver(true);
  const calendario = getCalendarState(business);
  const { aviso, avisar, cerrar } = useAviso();

  const [estadoAbierto, setEstadoAbierto] = useState(false);
  const [citaAbierta, setCitaAbierta] = useState<AgendaBooking | null>(null);
  const [llamadaAbierta, setLlamadaAbierta] = useState<string | null>(null);

  // Desde el principio de hoy: así «3 citas» cuenta también las de esta
  // mañana, aunque la próxima sea la de las cinco.
  const agendaQuery = useQuery({
    queryKey: ["agenda-inicio", hoy],
    queryFn: () => getAgenda(8, 50, 0, instanteAntesDelDia(hoy)),
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
  const deHoy = citas.filter((cita) => claveDeDia(cita.programedAt, timeZone) === hoy);
  const pendientesDeHoy = deHoy.filter((cita) => finDeCita(cita) > ahora);
  const proxima = pendientesDeHoy[0] ?? citas.find((cita) => claveDeDia(cita.programedAt, timeZone) > hoy) ?? null;
  const masTarde = proxima && claveDeDia(proxima.programedAt, timeZone) === hoy ? pendientesDeHoy.slice(1) : [];
  const forwarding = estado.onboardingQuery.data?.forwarding;
  const llamadas = (llamadasQuery.data?.data ?? []).slice(0, 4);

  const subtitulo = [
    diaLargo(hoy),
    agendaQuery.isLoading ? null : deHoy.length === 0 ? "Sin citas hoy" : deHoy.length === 1 ? "1 cita" : `${deHoy.length} citas`,
    porDevolver > 0 ? `${porDevolver} por devolver` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <CabeceraMovil
        titulo="Hoy"
        subtitulo={subtitulo}
        marca={
          <>
            <BrandMark className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[15px] font-bold text-[#0a0a0a]">{business.name}</p>
              <p className="mt-px text-xs text-muted">Alhabla</p>
            </div>
          </>
        }
        accion={<ChipDeEstado estado={estado} onAbrir={() => setEstadoAbierto(true)} />}
      />

      <div className="space-y-3">
        {avisoDeCalendario ? (
          <p
            role="status"
            className={`rounded-[20px] border px-4 py-3 text-sm font-semibold ${
              avisoDeCalendario.type === "success"
                ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]"
                : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"
            }`}
          >
            {avisoDeCalendario.message}
          </p>
        ) : null}

        <CitasSinReservar
          pendientes={estado.pendientes}
          error={estado.pendientesQuery.isError}
          onReintentar={() => void estado.pendientesQuery.refetch()}
          timeZone={timeZone}
          avisar={avisar}
        />

        {/* Sin desvío no entra ni una llamada: es lo primero que hay que
            resolver, por delante de cualquier otra cosa del día. */}
        {estado.onboardingQuery.isError ? (
          <SectionErrorState
            message="No hemos podido comprobar si el desvío de llamadas está activo. Hasta que no lo esté, tus clientes no llegan a tu recepcionista."
            onRetry={() => void estado.onboardingQuery.refetch()}
          />
        ) : forwarding && forwarding.status !== "done" ? (
          <CallForwardingCard forwarding={forwarding} customerLineType={business.customerLineType ?? null} />
        ) : null}

        {estado.minutos ? (
          <TarjetaDeAviso
            href="/ajustes/facturacion"
            icono={Clock3}
            titulo={estado.minutos.exhausted ? "Minutos del plan agotados" : `Te queda un ${estado.minutos.remainingPct} % de tus minutos`}
            texto={
              estado.minutos.exhausted
                ? `Las llamadas siguen atendiéndose${estado.minutos.extraPrice ? ` y se facturan a ${estado.minutos.extraPrice}` : " como minutos extra"}.`
                : `Al agotarlos, las llamadas se siguen atendiendo${estado.minutos.extraPrice ? ` a ${estado.minutos.extraPrice}` : " como minutos extra"}.`
            }
          />
        ) : null}

        {!calendario.connected ? (
          <TarjetaDeAviso
            href="/agente/calendario"
            icono={CalendarDays}
            titulo={calendario.expired ? "Vuelve a conectar tu agenda" : "Conecta tu agenda"}
            texto={
              calendario.expired
                ? `La conexión con ${calendario.label} ha caducado: sin ella no se reservan citas.`
                : "Sin ella, tu recepcionista no puede reservar citas."
            }
          />
        ) : null}

        {agendaQuery.isLoading ? (
          <div className="h-[212px] rounded-3xl bg-[#f4f4f5] motion-safe:animate-pulse" aria-hidden="true" />
        ) : agendaQuery.isError ? (
          <SectionErrorState message="No se pudieron cargar tus próximas citas." onRetry={() => void agendaQuery.refetch()} />
        ) : proxima ? (
          <ProximaCita cita={proxima} ahora={ahora} hoy={hoy} timeZone={timeZone} onAbrir={() => setCitaAbierta(proxima)} />
        ) : (
          <VacioMovil icono={CalendarDays} titulo="Ninguna cita en los próximos días">
            Cuando tu recepcionista reserve una cita por teléfono, aparecerá aquí.
          </VacioMovil>
        )}

        {estado.onboardingQuery.data ? <GuiaDeConfiguracion estado={estado.onboardingQuery.data} /> : null}
      </div>

      {masTarde.length > 0 ? (
        <section className="mt-5">
          <TituloDeSeccion enlace={{ href: "/agenda", etiqueta: "Ver agenda" }} className="mb-1">
            Más tarde hoy
          </TituloDeSeccion>
          <ul>
            {masTarde.map((cita) => (
              <li key={cita.id} className="flex items-center gap-1 border-t border-[#e5e5e5]">
                <button
                  type="button"
                  onClick={() => setCitaAbierta(cita)}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
                >
                  <span className="w-12 shrink-0 text-base font-bold tabular-nums text-[#0a0a0a]">
                    {horaDelNegocio(cita.programedAt, timeZone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[#0a0a0a]">{nombreDeCita(cita)}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      {[cita.professional?.name, `${cita.durationMinutes} min`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
                {cita.clientPhone ? (
                  <a
                    href={enlaceTel(cita.clientPhone)}
                    aria-label={`Llamar al cliente al ${formatPhoneLocal(cita.clientPhone)}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#52525b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                  >
                    <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
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
                  onAbrir={() => setLlamadaAbierta(call.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {statsQuery.data?.week ? <UltimosSieteDias semana={statsQuery.data.week} /> : null}

      <HojaEstado abierta={estadoAbierto} onCerrar={() => setEstadoAbierto(false)} estado={estado} timeZone={timeZone} />
      <HojaCita cita={citaAbierta} timeZone={timeZone} calendario={calendario} onCerrar={() => setCitaAbierta(null)} avisar={avisar} />
      <HojaLlamada callId={llamadaAbierta} timeZone={timeZone} onCerrar={() => setLlamadaAbierta(null)} avisar={avisar} />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

export function TarjetaDeAviso({
  href,
  icono: Icono,
  titulo,
  texto,
}: {
  href: string;
  icono: typeof Clock3;
  titulo: string;
  texto: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center gap-3 rounded-[20px] border border-[#f0dfa8] bg-[#fef8e7] py-3.5 pl-4 pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#9f7a15]" aria-hidden="true">
        <Icono className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-[#806012]">{titulo}</span>
        <span className="mt-0.5 block text-[13px] leading-[1.45] text-[#52525b]">{texto}</span>
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#806012]" aria-hidden="true" />
    </Link>
  );
}

/**
 * Citas que el cliente pidió y no llegaron a la agenda. Es lo único de
 * Inicio que pide descolgar el teléfono, así que va primero y en rojo; «Ya
 * la he confirmado» la cierra igual que «La apunté yo» en WhatsApp.
 */
export function CitasSinReservar({
  pendientes,
  error,
  onReintentar,
  timeZone,
  avisar,
}: {
  pendientes: PendingBooking[];
  error: boolean;
  onReintentar: () => void;
  timeZone: string;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  const queryClient = useQueryClient();
  const resolver = useMutation({
    mutationFn: resolverCitaPendiente,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pending-bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
      ]);
      avisar("Cita marcada como confirmada.");
    },
    onError: () => avisar("No se pudo marcar como confirmada. Inténtalo otra vez.", "error"),
  });

  // Si la consulta falla no pueden desaparecer sin dejar rastro: el negocio
  // no tiene otra forma de enterarse en el panel.
  if (error) {
    return <SectionErrorState message="No hemos podido comprobar si hay citas sin reservar." onRetry={onReintentar} />;
  }
  if (pendientes.length === 0) return null;
  const varias = pendientes.length > 1;

  return (
    <section className="rounded-[20px] border border-[#f5d3d3] bg-[#fff1f1] p-4" aria-labelledby="citas-sin-reservar">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#c53030]" aria-hidden="true">
          <TriangleAlert className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="citas-sin-reservar" className="text-base font-bold leading-snug text-[#0a0a0a]">
            {varias ? `${pendientes.length} citas se quedaron sin reservar` : "Una cita se quedó sin reservar"}
          </h2>
          {varias ? (
            <p className="mt-1 text-sm leading-6 text-[#c53030]">Llama a cada cliente para confirmarla: todavía estás a tiempo.</p>
          ) : (
            <TextoDeCitaPendiente cita={pendientes[0]} timeZone={timeZone} />
          )}
        </div>
      </div>
      <ul className={varias ? "mt-3 space-y-2" : ""}>
        {pendientes.map((cita) => (
          <li key={cita.id} className={varias ? "rounded-2xl bg-white p-3" : ""}>
            {varias ? <TextoDeCitaPendiente cita={cita} timeZone={timeZone} /> : null}
            {cita.clientPhone ? (
              <a href={enlaceTel(cita.clientPhone)} className="btn-primary mt-3.5 w-full px-4">
                <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
                <span className="truncate">
                  Llamar{cita.clientName ? ` a ${cita.clientName}` : ""} · <span className="tabular-nums">{formatPhoneLocal(cita.clientPhone)}</span>
                </span>
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => resolver.mutate(cita.id)}
              disabled={resolver.isPending}
              className="mt-0.5 min-h-11 w-full text-sm font-semibold text-[#c53030] underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:opacity-60"
            >
              {resolver.isPending && resolver.variables === cita.id ? "Guardando…" : "Ya la he confirmado"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextoDeCitaPendiente({ cita, timeZone }: { cita: PendingBooking; timeZone: string }) {
  const cuando = cuandoPedia(cita, timeZone);
  return (
    <p className="mt-1 text-sm leading-6 text-[#c53030]">
      <strong>{cita.clientName ?? "Un cliente"}</strong>
      {cuando ? ` pedía ${cuando}.` : " pedía una cita."} {motivoDeCitaPendiente(cita.failureCode)}
    </p>
  );
}

/** La próxima cita en negro: lo primero que se mira al abrir la app. */
function ProximaCita({
  cita,
  ahora,
  hoy,
  timeZone,
  onAbrir,
}: {
  cita: AgendaBooking;
  ahora: Date;
  hoy: string;
  timeZone: string;
  onAbrir: () => void;
}) {
  const clave = claveDeDia(cita.programedAt, timeZone);
  const inicio = new Date(cita.programedAt);
  const cuando =
    clave === hoy
      ? inicio <= ahora
        ? "en curso"
        : cuentaAtras(Math.round((inicio.getTime() - ahora.getTime()) / 60_000))
      : `${clave === claveDeDia(new Date(ahora.getTime() + 86_400_000), timeZone) ? "Mañana" : `${NOMBRES_DE_DIA[diaDeLaSemana(clave)]} ${numeroDelDia(clave)}`} · ${horaDelNegocio(cita.programedAt, timeZone)}`;
  const detalle = [cita.professional?.name, `${cita.durationMinutes} min`, formatPhoneLocal(cita.clientPhone)].filter(Boolean).join(" · ");

  return (
    <section className="rounded-3xl bg-[#0a0a0a] p-[18px] text-white" aria-label="Próxima cita">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-white/70">Próxima cita</span>
        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{cuando}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <span className="text-5xl font-extrabold leading-none tracking-[-0.035em] tabular-nums">
          {horaDelNegocio(cita.programedAt, timeZone)}
        </span>
        <span className="text-sm font-medium text-white/70">hasta las {horaDelNegocio(finDeCita(cita), timeZone)}</span>
      </div>
      <p className="mt-2.5 text-[17px] font-bold leading-snug tracking-[-0.01em]">{nombreDeCita(cita)}</p>
      {detalle ? <p className="mt-1 text-sm leading-6 text-white/70">{detalle}</p> : null}
      <div className="mt-4 flex gap-2">
        {cita.clientPhone ? (
          <a
            href={enlaceTel(cita.clientPhone)}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[10px] bg-white text-[15px] font-bold text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
          >
            <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
            Llamar
          </a>
        ) : null}
        <button
          type="button"
          onClick={onAbrir}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-[10px] border border-white/35 text-[15px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
        >
          Ver cita
        </button>
      </div>
    </section>
  );
}

/**
 * Guía de configuración plegada a una fila con el siguiente paso; abierta,
 * los pendientes y lo hecho. Comparte datos y criterio con la de
 * escritorio (onboarding-checklist.tsx).
 */
export function GuiaDeConfiguracion({ estado }: { estado: OnboardingState }) {
  const queryClient = useQueryClient();
  const [abierta, setAbierta] = useState(false);
  const ocultar = useMutation({
    mutationFn: dismissOnboarding,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
  });

  if (!estado.isActive) return null;

  const pasos = AGENT_CONFIGURATION_STEPS;
  const hechos = pasos.filter((paso) => estado.steps[paso.key]);
  const pendientes = pasos.filter((paso) => !estado.steps[paso.key]);
  const esperandoNumero = estado.forwarding?.status === "waiting_number";
  const bloqueado = (clave: string) => clave === "forwarding" && esperandoNumero;
  const siguiente = pendientes.find((paso) => !bloqueado(paso.key)) ?? pendientes[0] ?? null;
  const circunferencia = 2 * Math.PI * 18;
  const movilSinWhatsapp = estado.whatsapp?.status === "sin_whatsapp";
  const descripcion = (clave: string, texto: string) =>
    clave === "whatsapp" && movilSinWhatsapp ? "El móvil que pusiste no tiene WhatsApp. Cambia el número en Teléfono." : texto;

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#ddd6fe] bg-[#f3eeff]">
      <button
        type="button"
        onClick={() => setAbierta((actual) => !actual)}
        aria-expanded={abierta}
        className="flex min-h-[72px] w-full items-center gap-3 py-3.5 pl-4 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
      >
        <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="#fff" stroke="#ddd6fe" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${((circunferencia * hechos.length) / pasos.length).toFixed(1)} ${circunferencia.toFixed(1)}`}
          />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug text-[#0a0a0a]">Termina de configurar tu recepcionista</span>
          <span className="mt-0.5 block text-[13px] text-muted">
            {hechos.length} de {pasos.length} pasos hechos
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#6d28d9] transition-transform duration-200 ${abierta ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {!abierta && siguiente ? (
        bloqueado(siguiente.key) ? (
          <p className="px-4 pb-3.5 text-[13px] leading-6 text-muted">
            {siguiente.title}: disponible en cuanto tu número esté activo.
          </p>
        ) : (
          <Link
            href={siguiente.hrefMovil}
            className="mx-3 mb-3 flex min-h-14 items-center gap-3 rounded-[14px] border border-[#ddd6fe] bg-white px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            <AzulejoIcono icono={siguiente.icon} tamaño="sm" />
            <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-[#0a0a0a]">{siguiente.title}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#6d28d9]">
              {siguiente.key === "forwarding" || siguiente.key === "whatsapp" ? "Activar" : "Configurar"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        )
      ) : null}

      {abierta ? (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {pendientes.map((paso) =>
            bloqueado(paso.key) ? (
              <div key={paso.key} className="flex min-h-[60px] items-center gap-3 rounded-[14px] border border-[#ddd6fe] bg-white/60 px-3 py-2.5">
                <AzulejoIcono icono={paso.icon} tamaño="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#0a0a0a]">{paso.title}</span>
                  <span className="block text-xs leading-[1.45] text-muted">Disponible en cuanto tu número esté activo.</span>
                </span>
              </div>
            ) : (
              <Link
                key={paso.key}
                href={paso.hrefMovil}
                className="flex min-h-[60px] items-center gap-3 rounded-[14px] border border-[#ddd6fe] bg-white px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
              >
                <AzulejoIcono icono={paso.icon} tamaño="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#0a0a0a]">{paso.title}</span>
                  <span className="mt-px block text-xs leading-[1.45] text-muted">{descripcion(paso.key, paso.description)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#6d28d9]" aria-hidden="true" />
              </Link>
            )
          )}
          {hechos.length > 0 ? (
            <ul className="mt-0.5 flex flex-wrap gap-1.5">
              {hechos.map((paso) => (
                <li key={paso.key} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-[5px] text-xs font-semibold text-[#52525b]">
                  <Check className="h-3.5 w-3.5 text-[#2c7334]" aria-hidden="true" />
                  {paso.title}
                </li>
              ))}
            </ul>
          ) : null}
          {ocultar.isError ? (
            <p className="text-sm text-[#c53030]" role="alert">
              No hemos podido ocultar la guía. Inténtalo de nuevo.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => ocultar.mutate()}
            disabled={ocultar.isPending}
            className="min-h-11 text-sm font-semibold text-[#6d28d9] underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:opacity-60"
          >
            Ocultar la guía
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Los mismos datos y el mismo criterio que el resumen de escritorio
 * (weekly-summary.tsx): diferencia absoluta, nunca porcentaje. */
export function UltimosSieteDias({ semana, className = "mt-7" }: { semana: WeeklyStats; className?: string }) {
  const conversaciones = semana.calls + semana.chats;
  const conversion = conversaciones > 0 ? Math.round((semana.conversationsWithBooking / conversaciones) * 100) : null;
  const delta = semana.bookings - semana.previous.bookings;
  const comparacion =
    semana.previous.bookings === 0 && semana.bookings === 0
      ? { texto: "Sin actividad estos días.", tono: "text-muted", icono: null }
      : semana.previous.bookings === 0
        ? { texto: `Es tu primera semana con ${semana.bookings === 1 ? "una cita" : "citas"}.`, tono: "text-muted", icono: null }
        : delta === 0
          ? { texto: "Igual que la semana pasada.", tono: "text-muted", icono: null }
          : {
              texto: `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "cita" : "citas"} ${delta > 0 ? "más" : "menos"} que la semana pasada`,
              tono: delta > 0 ? "font-semibold text-[#2c7334]" : "font-semibold text-[#806012]",
              icono: delta > 0 ? ArrowUpRight : ArrowDownRight,
            };
  const detalleConversaciones = [
    `${semana.calls} ${semana.calls === 1 ? "llamada" : "llamadas"}`,
    semana.chats > 0 ? `${semana.chats} ${semana.chats === 1 ? "chat" : "chats"} de WhatsApp` : null,
  ]
    .filter(Boolean)
    .join(" y ");

  return (
    <section className={className}>
      <h2 className="mb-2 text-lg font-bold tracking-[-0.01em] text-[#0a0a0a]">Últimos 7 días</h2>
      <div className="panel px-4 py-[18px]">
        <p className="text-5xl font-extrabold leading-none tracking-[-0.035em] tabular-nums text-[#0a0a0a]">{semana.bookings}</p>
        <p className="mt-1 text-[15px] font-semibold text-[#0a0a0a]">{semana.bookings === 1 ? "cita reservada" : "citas reservadas"}</p>
        <p className={`mt-2 flex items-center gap-1 text-sm ${comparacion.tono}`}>
          {comparacion.icono ? <comparacion.icono className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
          {comparacion.texto}
        </p>
        <div className="mt-4 grid grid-cols-2 border-t border-[#e5e5e5]">
          <div className="border-r border-[#e5e5e5] pr-3 pt-3.5">
            <p className="text-[28px] font-bold tracking-[-0.02em] tabular-nums text-[#0a0a0a]">{conversaciones}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#0a0a0a]">{conversaciones === 1 ? "conversación" : "conversaciones"}</p>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">
              {conversion !== null ? `${detalleConversaciones} · ${conversion} % terminaron en cita.` : "Aún no ha entrado ninguna llamada."}
            </p>
          </div>
          <div className="pl-4 pt-3.5">
            {semana.revenueCents !== null ? (
              <>
                <p className="text-[28px] font-bold tracking-[-0.02em] tabular-nums text-[#0a0a0a]">{formatPrice(semana.revenueCents)}</p>
                <p className="mt-0.5 text-sm font-semibold text-[#0a0a0a]">en citas reservadas</p>
                <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">
                  {semana.revenueIsPartial ? "Estimación a la baja: solo suma los servicios con precio." : "Según el precio de los servicios."}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[#0a0a0a]">¿Cuánto has recuperado?</p>
                <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">Pon precio a tus servicios y lo verás aquí.</p>
                <Link
                  href="/agente/servicios"
                  className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#6d28d9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
                >
                  Añadir precios
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

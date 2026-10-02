"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowUpRight, Check, CircleCheckBig } from "lucide-react";
import { SiApple, SiGooglecalendar } from "@icons-pack/react-simple-icons";
import { getCalendarList, getGoogleCalendarAuthUrl, getMicrosoftCalendarAuthUrl, selectCalendar } from "@/lib/api";
import { getCalendarState, providerFromReconnectCode } from "@/lib/calendar-state";
import type { Business, CalendarProviderId } from "@/lib/types";
import { AppleCalendarConnect } from "@/components/apple-calendar-connect";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { BetaPill } from "@/components/beta-pill";
import { MicrosoftLogo } from "@/components/brand-icons";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

type Mensaje = { type: "success" | "error"; message: string } | null;

/**
 * Calendario en el móvil: el estado de la conexión arriba y, debajo, cada
 * acción por separado (cambiar de cuenta, de calendario). Sin conectar, los
 * tres proveedores en tarjetas. La lógica es la de escritorio: OAuth para
 * Google y Outlook, Apple ID y contraseña de aplicación para Apple.
 */
export function CalendarioMovil({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const estado = getCalendarState(business);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [reconectar, setReconectar] = useState(false);
  const [autorizando, setAutorizando] = useState<"google" | "outlook" | null>(null);
  const [selector, setSelector] = useState(false);
  const [formularioApple, setFormularioApple] = useState(false);
  const conectado = estado.connected && !reconectar;

  const calendarios = useQuery({
    queryKey: ["calendar-list"],
    queryFn: getCalendarList,
    enabled: selector,
    retry: false,
  });

  useEffect(() => {
    const error = calendarios.error;
    if (!error || !axios.isAxiosError(error)) return;
    const codigo = error.response?.data?.code;
    if (typeof codigo === "string" && codigo.endsWith("_CALENDAR_RECONNECT_REQUIRED")) {
      const proveedor: CalendarProviderId = providerFromReconnectCode(codigo);
      setReconectar(true);
      setSelector(false);
      setMensaje({
        type: "error",
        message:
          proveedor === "caldav"
            ? "Apple ha dejado de aceptar la contraseña de aplicación (¿la anulaste?). Genera una nueva y vuelve a conectar el calendario."
            : `La conexión con ${proveedor === "outlook" ? "Outlook Calendar" : "Google Calendar"} ha caducado. Vuelve a conectarla para continuar.`,
      });
    }
  }, [calendarios.error]);

  const elegir = useMutation({
    mutationFn: selectCalendar,
    onSuccess: async (negocio) => {
      queryClient.setQueryData(["my-business"], negocio);
      await queryClient.invalidateQueries({ queryKey: ["calendar-list"] });
      setSelector(false);
      avisar("Calendario actualizado.");
    },
    onError: () => avisar("No se pudo cambiar de calendario.", "error"),
  });

  const autorizar = async (proveedor: "google" | "outlook") => {
    setAutorizando(proveedor);
    setMensaje(null);
    try {
      const url = proveedor === "google" ? await getGoogleCalendarAuthUrl() : await getMicrosoftCalendarAuthUrl();
      if (url) window.location.href = url;
    } catch {
      setMensaje({ type: "error", message: "No se pudo obtener la URL de conexión." });
      setAutorizando(null);
    }
  };

  const alConectarApple = async (negocio: Business) => {
    queryClient.setQueryData(["my-business"], negocio);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar-list"] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
    ]);
    setFormularioApple(false);
    setReconectar(false);
    setMensaje({ type: "success", message: "El calendario de Apple está conectado correctamente." });
  };

  return (
    <PantallaDeAjuste
      titulo="Calendario"
      subtitulo="Tu agenda real: de ahí sale la disponibilidad y ahí se guardan las citas."
    >
      <div className="flex flex-col gap-3">
        {mensaje ? (
          <p
            role="status"
            className={`rounded-[14px] border px-4 py-3 text-sm font-medium ${
              mensaje.type === "success" ? "border-[#d8efd7] bg-[#ecf7ec] text-[#2c7334]" : "border-[#f5d3d3] bg-[#fff1f1] text-[#c53030]"
            }`}
          >
            {mensaje.message}
          </p>
        ) : null}

        {conectado ? (
          <>
            <div className="flex items-center gap-3 rounded-[20px] border border-[#d8efd7] bg-[#ecf7ec] px-4 py-3.5">
              <CircleCheckBig className="h-6 w-6 shrink-0 text-[#2c7334]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-[#2c7334]">{estado.label} conectado</p>
                <p className="truncate text-[13px] text-[#2c7334]">{estado.accountEmail ?? `Cuenta de ${estado.shortLabel}`}</p>
              </div>
            </div>
            {estado.provider === "caldav" ? (
              <button type="button" onClick={() => setFormularioApple((actual) => !actual)} className="btn-secondary w-full">
                {formularioApple ? "Cerrar" : "Cambiar de cuenta"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void autorizar(estado.provider as "google" | "outlook")}
                disabled={autorizando !== null}
                className="btn-secondary w-full"
              >
                {autorizando ? "Conectando…" : "Cambiar de cuenta"}
              </button>
            )}
            {formularioApple ? <AppleCalendarConnect onCancel={() => setFormularioApple(false)} onConnected={alConectarApple} /> : null}
            <button
              type="button"
              onClick={() => setSelector((actual) => !actual)}
              aria-expanded={selector}
              className="btn-secondary w-full"
            >
              {selector ? "Cerrar el selector" : "Cambiar de calendario"}
            </button>
            {selector ? (
              <div className="flex flex-col gap-2">
                {calendarios.isLoading ? <p className="px-1 text-sm text-muted">Cargando calendarios…</p> : null}
                {calendarios.isError && !reconectar ? (
                  <p className="px-1 text-sm text-[#c53030]">No se pudo obtener la lista de calendarios. Inténtalo de nuevo en unos segundos.</p>
                ) : null}
                {calendarios.data?.calendars.length === 0 ? (
                  <p className="px-1 text-sm text-muted">No hay calendarios disponibles en esta cuenta.</p>
                ) : null}
                {calendarios.data?.calendars.map((calendario) => {
                  const elegido = calendario.id === calendarios.data?.selectedCalendarId;
                  return (
                    <button
                      key={calendario.id}
                      type="button"
                      aria-pressed={elegido}
                      disabled={elegir.isPending}
                      onClick={() => elegir.mutate(calendario.id)}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:opacity-60 ${
                        elegido ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-[#0a0a0a]">{calendario.name}</span>
                        {calendario.primary ? <span className="block text-[13px] text-muted">Calendario principal</span> : null}
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${elegido ? "bg-[#8b5cf6] text-white" : "bg-[#f4f4f5] text-transparent"}`}
                        aria-hidden="true"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <TarjetaDeProveedor
              icono={<SiGooglecalendar className="h-[18px] w-[18px] shrink-0" color="#4285F4" />}
              titulo="Conecta Google Calendar"
              texto="Reservas automáticas, disponibilidad real y la agenda en el panel."
              accion={autorizando === "google" ? "Conectando…" : "Conectar"}
              beta
              disabled={autorizando !== null}
              onClick={() => void autorizar("google")}
            />
            <TarjetaDeProveedor
              icono={<MicrosoftLogo className="h-[18px] w-[18px] shrink-0" />}
              titulo="Conecta Outlook"
              texto="Usa Outlook Calendar para sincronizar la agenda del negocio."
              accion={autorizando === "outlook" ? "Conectando…" : "Conectar"}
              disabled={autorizando !== null}
              onClick={() => void autorizar("outlook")}
            />
            <TarjetaDeProveedor
              icono={<SiApple className="h-[18px] w-[18px] shrink-0" color="#0a0a0a" />}
              titulo="Conecta el calendario de Apple"
              texto="Si llevas la agenda en el iPhone o en iCloud, conéctala con tu Apple ID y una contraseña de aplicación."
              accion={formularioApple ? "Cerrar" : "Conectar"}
              beta
              expandida={formularioApple}
              disabled={autorizando !== null}
              onClick={() => {
                setMensaje(null);
                setFormularioApple((actual) => !actual);
              }}
            />
            {formularioApple ? <AppleCalendarConnect onCancel={() => setFormularioApple(false)} onConnected={alConectarApple} /> : null}
          </>
        )}
      </div>
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

function TarjetaDeProveedor({
  icono,
  titulo,
  texto,
  accion,
  beta = false,
  expandida,
  disabled,
  onClick,
}: {
  icono: React.ReactNode;
  titulo: string;
  texto: string;
  accion: string;
  beta?: boolean;
  expandida?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expandida}
      className="relative mt-1.5 flex min-h-24 w-full flex-col gap-1.5 rounded-2xl border border-[#ddd6fe] bg-[#f3eeff] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {/* Beta: la app de Google sigue en revisión y Apple es nuevo. */}
      {beta ? <BetaPill /> : null}
      <span className="flex items-center gap-2 text-base font-bold text-[#0a0a0a]">
        {icono}
        {titulo}
      </span>
      <span className="text-sm leading-6 text-muted">{texto}</span>
      <span className="inline-flex items-center gap-1 text-sm font-bold text-[#6d28d9]">
        {accion}
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

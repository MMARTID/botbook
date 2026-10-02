"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy, LoaderCircle, Mic, Phone } from "lucide-react";
import { getCall } from "@/lib/api";
import { esChatDeWhatsapp, formatCanalYDuracion, formatPhoneLocal, statusLabel } from "@/lib/format";
import { claveDeDia, etiquetaDeDia, horaDelNegocio } from "@/lib/fechas-negocio";
import { enlaceTel, resultadoDeLlamada, telefonoParaDevolver } from "@/lib/llamadas";
import { SectionErrorState } from "@/components/section-card";
import { Insignia } from "@/components/movil/piezas";
import {
  Reproductor,
  Resumen,
  Transcripcion,
  copiarAlPortapapeles,
  useMarcarRecado,
} from "@/components/movil/hoja-llamada";
import { PanelDeDetalle } from "@/components/escritorio/piezas";

/**
 * La conversación a la derecha de la tabla (wireframe 1h): sustituye al
 * modal. Llamar, copiar y dar el recado por devuelto arriba; la grabación,
 * el resumen con su reserva y la transcripción entera debajo, sin pestañas:
 * en escritorio cabe.
 */
export function DetalleDeLlamada({
  callId,
  timeZone,
  onCerrar,
  avisar,
}: {
  callId: string;
  timeZone: string;
  onCerrar: () => void;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  const consulta = useQuery({ queryKey: ["call-detail", callId], queryFn: () => getCall(callId) });
  const call = consulta.data;
  const recado = useMarcarRecado(callId, avisar);
  const hoy = claveDeDia(new Date(), timeZone);

  if (!call) {
    return (
      <PanelDeDetalle titulo="Detalle de la llamada" onCerrar={onCerrar} ancho={460}>
        {consulta.isError ? (
          <SectionErrorState message="No se pudo cargar el detalle de esta llamada." onRetry={() => void consulta.refetch()} />
        ) : (
          <p className="flex items-center gap-2 py-10 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cargando llamada…
          </p>
        )}
      </PanelDeDetalle>
    );
  }

  const telefono = telefonoParaDevolver(call);
  const resultado = resultadoDeLlamada(call);
  const pendiente = Boolean(call.recado && !call.recado.atendidoAt);
  const devuelta = Boolean(call.recado?.atendidoAt);
  const grabacion = call.recording?.storageUrl ?? call.recording?.externalUrl ?? null;
  const tono = { morado: "morado", aviso: "aviso", exito: "exito", neutro: "neutro" } as const;

  return (
    <PanelDeDetalle
      antetitulo={`${etiquetaDeDia(claveDeDia(call.startedAt, timeZone), hoy)}, ${horaDelNegocio(call.startedAt, timeZone)} · ${formatCanalYDuracion(call)} · ${statusLabel(call.status)}`}
      titulo={<span className="tabular-nums">{formatPhoneLocal(call.fromNumber) ?? "Número oculto"}</span>}
      insignia={
        <Insignia tono={tono[resultado.tono]} icono={resultado.icono}>
          {resultado.texto}
        </Insignia>
      }
      onCerrar={onCerrar}
      ancho={460}
    >
      <div className="space-y-2">
        {telefono ? (
          <div className="flex gap-2">
            <a href={enlaceTel(telefono)} className="btn-primary h-10 flex-1 px-4">
              <Phone className="h-4 w-4" aria-hidden="true" />
              Llamar
            </a>
            <button
              type="button"
              onClick={() => copiarAlPortapapeles(formatPhoneLocal(telefono) ?? telefono, avisar)}
              className="btn-secondary h-10 flex-none px-4"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar número
            </button>
          </div>
        ) : null}
        {pendiente ? (
          <button
            type="button"
            onClick={() => recado.mutate(true)}
            disabled={recado.isPending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-aviso-borde bg-aviso-fondo text-sm font-bold text-aviso transition hover:bg-aviso-fondo-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {recado.isPending ? "Guardando…" : "Marcar como devuelta"}
          </button>
        ) : null}
        {devuelta ? (
          <div className="flex h-10 items-center justify-between gap-2 rounded-[10px] bg-exito-fondo px-3.5 text-sm font-bold text-exito ring-1 ring-inset ring-exito-borde">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" aria-hidden="true" />
              Llamada devuelta
            </span>
            <button
              type="button"
              onClick={() => recado.mutate(false)}
              disabled={recado.isPending}
              className="px-1 text-[13px] font-semibold underline underline-offset-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado disabled:opacity-60"
            >
              Deshacer
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-linea bg-relleno px-3 py-2.5">
        {grabacion && !esChatDeWhatsapp(call) ? (
          <Reproductor key={call.id} src={grabacion} duracion={call.durationSecs ?? 0} semilla={call.id} activo />
        ) : (
          <p className="flex min-h-10 items-center gap-2 text-sm text-muted">
            <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
            {esChatDeWhatsapp(call) ? "Chat de WhatsApp: no hay grabación." : "Todavía no hay grabación disponible."}
          </p>
        )}
      </div>

      <div className="mt-4">
        <Resumen call={call} timeZone={timeZone} onCerrar={() => undefined} />
      </div>
      <div className="mt-4">
        <Transcripcion call={call} timeZone={timeZone} />
      </div>
    </PanelDeDetalle>
  );
}

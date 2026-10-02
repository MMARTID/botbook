"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, ScissorsLineDashed, Trash2 } from "lucide-react";
import { createBookingService, deleteBookingService, getBookingSettings, updateBookingService } from "@/lib/api";
import { centsToEuroInput, euroInputToCents, formatPrice } from "@/lib/format";
import type { BookingService } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { CLASES_BOTON_REDONDO } from "@/components/movil/cabecera-movil";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { Interruptor, VacioMovil } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

const ATAJOS_DE_DURACION = [15, 30, 45, 60, 90, 120];

type Borrador = { id: string | null; nombre: string; duracion: string; precio: string; activo: boolean };

/** Servicios: una lista legible y una hoja para añadir o editar cada uno. */
export function ServiciosMovil() {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });
  const servicios = ajustes.data?.services ?? [];
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const abrir = (servicio: BookingService | null) =>
    setBorrador(
      servicio
        ? {
            id: servicio.id,
            nombre: servicio.name,
            duracion: String(servicio.durationMinutes),
            precio: centsToEuroInput(servicio.priceCents),
            activo: servicio.active,
          }
        : { id: null, nombre: "", duracion: "30", precio: "", activo: true }
    );

  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
      queryClient.invalidateQueries({ queryKey: ["my-business"] }),
    ]);

  return (
    <PantallaDeAjuste
      titulo="Servicios"
      subtitulo="La duración siempre sale de aquí. El precio es opcional: si lo pones, verás cuánto valen las citas que entran solas."
      accion={
        <button type="button" onClick={() => abrir(null)} aria-label="Añadir servicio" className={CLASES_BOTON_REDONDO}>
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      }
    >
      {ajustes.isLoading ? (
        <div className="h-48 rounded-3xl bg-[#f4f4f5] motion-safe:animate-pulse" aria-hidden="true" />
      ) : ajustes.isError ? (
        <SectionErrorState message="No se pudieron cargar los servicios." onRetry={() => void ajustes.refetch()} />
      ) : servicios.length === 0 ? (
        <VacioMovil icono={ScissorsLineDashed} titulo="Todavía no hay servicios">
          Empieza por crear lo que el agente podrá ofrecer por teléfono.
        </VacioMovil>
      ) : (
        <ul className="panel overflow-hidden">
          {servicios.map((servicio, indice) => (
            <li key={servicio.id} className={indice > 0 ? "border-t border-[#f4f4f5]" : ""}>
              <button
                type="button"
                onClick={() => abrir(servicio)}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b5cf6]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-snug text-[#0a0a0a]">{servicio.name}</span>
                  <span className="mt-0.5 block text-sm tabular-nums text-muted">
                    {servicio.durationMinutes} min · {formatPrice(servicio.priceCents) ?? "Sin precio"}
                    {servicio.active ? "" : " · Inactivo"}
                  </span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#a1a1aa]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => abrir(null)} className="btn-secondary mt-3.5 w-full">
        <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
        Añadir servicio
      </button>

      <HojaServicio
        borrador={borrador}
        onCambiar={setBorrador}
        onCerrar={() => setBorrador(null)}
        onHecho={async (mensaje) => {
          await refrescar();
          setBorrador(null);
          avisar(mensaje);
        }}
        onError={(mensaje) => avisar(mensaje, "error")}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

function HojaServicio({
  borrador,
  onCambiar,
  onCerrar,
  onHecho,
  onError,
}: {
  borrador: Borrador | null;
  onCambiar: (borrador: Borrador) => void;
  onCerrar: () => void;
  onHecho: (mensaje: string) => Promise<void>;
  onError: (mensaje: string) => void;
}) {
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [ultimo, setUltimo] = useState<Borrador | null>(borrador);
  if (borrador && borrador !== ultimo) setUltimo(borrador);
  const visible = borrador ?? ultimo;

  const guardar = useMutation({
    mutationFn: async (datos: Borrador) => {
      const cuerpo = {
        name: datos.nombre.trim(),
        durationMinutes: Number(datos.duracion),
        priceCents: euroInputToCents(datos.precio),
      };
      return datos.id ? updateBookingService(datos.id, { ...cuerpo, active: datos.activo }) : createBookingService(cuerpo);
    },
    onSuccess: (_, datos) => onHecho(datos.id ? "Servicio actualizado." : "Servicio creado."),
    onError: (_, datos) => onError(datos.id ? "No se pudieron guardar los cambios." : "No se pudo crear el servicio."),
  });
  const borrar = useMutation({
    mutationFn: (id: string) => deleteBookingService(id),
    onSuccess: () => {
      setConfirmandoBorrado(false);
      return onHecho(visible?.nombre ? `Servicio ${visible.nombre} eliminado.` : "Servicio eliminado.");
    },
    onError: () => onError("No se pudo eliminar el servicio."),
  });

  if (!visible) return null;
  const duracion = Number(visible.duracion);
  const valido = visible.nombre.trim().length > 0 && Number.isInteger(duracion) && duracion >= 5 && duracion <= 480;
  const cambiar = (cambio: Partial<Borrador>) => borrador && onCambiar({ ...borrador, ...cambio });

  return (
    <HojaInferior
      abierta={Boolean(borrador)}
      onCerrar={() => {
        setConfirmandoBorrado(false);
        onCerrar();
      }}
      titulo={visible.id ? "Editar servicio" : "Nuevo servicio"}
    >
      <CuerpoDeHoja className="flex flex-col gap-4">
        <label className="block text-sm font-semibold text-[#27272a]">
          Nombre del servicio
          <input
            value={visible.nombre}
            onChange={(evento) => cambiar({ nombre: evento.target.value })}
            placeholder="Ej. Corte + peinado"
            className="field mt-2 block w-full text-base font-normal"
          />
        </label>
        <div>
          <label className="block text-sm font-semibold text-[#27272a]">
            Duración (minutos)
            <input
              inputMode="numeric"
              value={visible.duracion}
              onChange={(evento) => cambiar({ duracion: evento.target.value.replace(/\D/g, "") })}
              aria-invalid={visible.duracion !== "" && !(duracion >= 5 && duracion <= 480)}
              className="field mt-2 block w-full text-base font-normal tabular-nums"
            />
          </label>
          <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="Duraciones habituales">
            {ATAJOS_DE_DURACION.map((minutos) => {
              const elegido = duracion === minutos;
              return (
                <button
                  key={minutos}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => cambiar({ duracion: String(minutos) })}
                  className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                    elegido ? "border-[#ddd6fe] bg-[#f3eeff] text-[#6d28d9]" : "border-[#e5e5e5] bg-white text-[#27272a]"
                  }`}
                >
                  {minutos} min
                </button>
              );
            })}
          </div>
        </div>
        <label className="block text-sm font-semibold text-[#27272a]">
          Precio en euros (opcional)
          <input
            inputMode="decimal"
            value={visible.precio}
            onChange={(evento) => cambiar({ precio: evento.target.value.replace(/[^\d,.]/g, "") })}
            placeholder="Ej. 18"
            className="field mt-2 block w-full text-base font-normal tabular-nums"
          />
        </label>
        {visible.id ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-[#27272a]">Activo</span>
              <span className="block text-[13px] text-muted">Si lo desactivas, el agente deja de ofrecerlo.</span>
            </span>
            <Interruptor activo={visible.activo} etiqueta="Servicio activo" onCambiar={(activo) => cambiar({ activo })} />
          </div>
        ) : null}

        {confirmandoBorrado && visible.id ? (
          <div className="rounded-[14px] border border-[#f5d3d3] bg-[#fff1f1] p-3">
            <p className="mb-2.5 text-sm font-semibold leading-6 text-[#c53030]">
              Se retirará de las nuevas reservas y de todos los profesionales. Las citas ya reservadas no se tocan.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmandoBorrado(false)} disabled={borrar.isPending} className="btn-secondary h-11 flex-1">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => borrar.mutate(visible.id!)}
                disabled={borrar.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-[10px] bg-[#c53030] text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {borrar.isPending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex gap-2">
            {visible.id ? (
              <button
                type="button"
                onClick={() => setConfirmandoBorrado(true)}
                aria-label="Eliminar servicio"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-[#f5d3d3] bg-white text-[#c53030] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c53030]"
              >
                <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" onClick={() => guardar.mutate(visible)} disabled={!valido || guardar.isPending} className="btn-primary flex-1">
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </CuerpoDeHoja>
    </HojaInferior>
  );
}

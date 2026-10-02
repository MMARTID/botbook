"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Trash2, UserRoundCheck } from "lucide-react";
import {
  createBookingProfessional,
  deleteBookingProfessional,
  getBookingSettings,
  updateBookingProfessional,
} from "@/lib/api";
import { getPlanLimitInfo, planLimitUpgradeMessage } from "@/lib/plan-limit";
import type { BookingProfessional } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import {
  describeServiceLevels,
  ProfessionalServiceLevels,
  type ServiceLevelMap,
} from "@/components/professional-service-levels";
import { SectionErrorState } from "@/components/section-card";
import { CLASES_BOTON_REDONDO } from "@/components/movil/cabecera-movil";
import { CuerpoDeHoja, HojaInferior } from "@/components/movil/hoja-inferior";
import { Interruptor, VacioMovil } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

type Borrador = { id: string | null; nombre: string; activo: boolean; niveles: ServiceLevelMap };

/**
 * Profesionales: la lista del equipo y una hoja por persona con su nivel en
 * cada servicio (especialista, lo hace, no sugerir), como en escritorio.
 */
export function ProfesionalesMovil() {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });
  const profesionales = ajustes.data?.professionals ?? [];
  const servicios = ajustes.data?.services ?? [];
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const abrir = (profesional: BookingProfessional | null) =>
    setBorrador(
      profesional
        ? { id: profesional.id, nombre: profesional.name, activo: profesional.active, niveles: profesional.serviceLevels ?? {} }
        : { id: null, nombre: "", activo: true, niveles: {} }
    );

  return (
    <PantallaDeAjuste
      titulo="Profesionales"
      subtitulo="Quién hace qué. El agente recomienda al especialista una vez y reserva igualmente si el cliente insiste."
      accion={
        <button type="button" onClick={() => abrir(null)} aria-label="Añadir profesional" className={CLASES_BOTON_REDONDO}>
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      }
    >
      {ajustes.isLoading ? (
        <div className="h-48 rounded-3xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
      ) : ajustes.isError ? (
        <SectionErrorState message="No se pudo cargar el equipo." onRetry={() => void ajustes.refetch()} />
      ) : profesionales.length === 0 ? (
        <VacioMovil icono={UserRoundCheck} titulo="Todavía no hay profesionales">
          Añade al equipo para que las citas se repartan bien.
        </VacioMovil>
      ) : (
        <ul className="panel overflow-hidden">
          {profesionales.map((profesional, indice) => (
            <li key={profesional.id} className={indice > 0 ? "border-t border-linea-suave" : ""}>
              <button
                type="button"
                onClick={() => abrir(profesional)}
                className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-morado"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lavado text-base font-bold text-morado-tinta"
                  aria-hidden="true"
                >
                  {profesional.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold leading-snug text-tinta">{profesional.name}</span>
                  <span className="mt-0.5 block truncate text-sm leading-snug text-muted">
                    {[profesional.active ? null : "Inactivo", describeServiceLevels(profesional.serviceLevels ?? {}, servicios)]
                      .filter(Boolean)
                      .join(" · ") || "Sin servicios todavía"}
                  </span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-tenue" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => abrir(null)} className="btn-secondary mt-3.5 w-full">
        <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
        Añadir profesional
      </button>

      <HojaProfesional
        borrador={borrador}
        servicios={servicios}
        onCambiar={setBorrador}
        onCerrar={() => setBorrador(null)}
        onHecho={async (mensaje) => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
            queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
            queryClient.invalidateQueries({ queryKey: ["billing-summary"] }),
          ]);
          setBorrador(null);
          avisar(mensaje);
        }}
        onError={(mensaje) => avisar(mensaje, "error")}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

function HojaProfesional({
  borrador,
  servicios,
  onCambiar,
  onCerrar,
  onHecho,
  onError,
}: {
  borrador: Borrador | null;
  servicios: Array<{ id: string; name: string }>;
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
    mutationFn: (datos: Borrador) => {
      const cuerpo = { name: datos.nombre.trim(), serviceLevels: datos.niveles };
      return datos.id ? updateBookingProfessional(datos.id, { ...cuerpo, active: datos.activo }) : createBookingProfessional(cuerpo);
    },
    onSuccess: (_, datos) => onHecho(datos.id ? "Profesional actualizado." : "Profesional creado."),
    onError: (error, datos) => {
      const limite = getPlanLimitInfo(error);
      onError(
        limite
          ? `${planLimitUpgradeMessage(limite)} Puedes cambiar de plan en Cuenta → Plan y facturación.`
          : datos.id
            ? "No se pudieron guardar los cambios."
            : "No se pudo crear el profesional."
      );
    },
  });
  const borrar = useMutation({
    mutationFn: (id: string) => deleteBookingProfessional(id),
    onSuccess: () => {
      setConfirmandoBorrado(false);
      return onHecho(visible?.nombre ? `Profesional ${visible.nombre} eliminado.` : "Profesional eliminado.");
    },
    onError: () => onError("No se pudo eliminar el profesional."),
  });

  if (!visible) return null;
  const cambiar = (cambio: Partial<Borrador>) => borrador && onCambiar({ ...borrador, ...cambio });

  return (
    <HojaInferior
      abierta={Boolean(borrador)}
      onCerrar={() => {
        setConfirmandoBorrado(false);
        onCerrar();
      }}
      titulo={visible.id ? "Editar profesional" : "Nuevo profesional"}
    >
      <CuerpoDeHoja className="flex flex-col gap-4">
        <label className="block text-sm font-semibold text-tinta-2">
          Nombre del profesional
          <input
            value={visible.nombre}
            onChange={(evento) => cambiar({ nombre: evento.target.value })}
            placeholder="Ej. Lucía"
            className="field mt-2 block w-full text-base font-normal"
          />
        </label>
        {visible.id ? (
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold text-tinta-2">Activo</span>
              <span className="block text-[13px] text-muted">Si lo desactivas, no recibe citas nuevas.</span>
            </span>
            <Interruptor activo={visible.activo} etiqueta="Profesional activo" onCambiar={(activo) => cambiar({ activo })} />
          </div>
        ) : null}
        {/* `min-w-0`: el navegador da a <fieldset> min-width: min-content y el
            segmentado desbordaría la hoja. */}
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-semibold text-tinta-2">Servicios que hace</legend>
          <ProfessionalServiceLevels
            services={servicios}
            value={visible.niveles}
            onChange={(niveles) => cambiar({ niveles })}
            idPrefix={`movil-${visible.id ?? "nuevo"}`}
          />
        </fieldset>

        {confirmandoBorrado && visible.id ? (
          <div className="rounded-[14px] border border-linea bg-relleno p-3">
            <p className="mb-2.5 text-sm font-semibold leading-6 text-tinta-2">
              Ya no recibirá nuevas citas. Sus citas anteriores seguirán en el historial.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmandoBorrado(false)} disabled={borrar.isPending} className="btn-secondary h-11 flex-1">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => borrar.mutate(visible.id!)}
                disabled={borrar.isPending}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-[10px] bg-peligro text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 disabled:opacity-60"
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
                aria-label="Eliminar profesional"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border border-error-borde bg-superficie text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
              >
                <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => guardar.mutate(visible)}
              disabled={!visible.nombre.trim() || guardar.isPending}
              className="btn-primary flex-1"
            >
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}
      </CuerpoDeHoja>
    </HojaInferior>
  );
}

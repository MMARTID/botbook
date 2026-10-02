"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2, UserRoundCheck } from "lucide-react";
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
  ProfessionalServiceLevels,
  resolveServiceLevel,
  type ServiceLevelMap,
} from "@/components/professional-service-levels";
import { SectionErrorState } from "@/components/section-card";
import { BarraGuardar, Insignia, Interruptor, VacioMovil } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";
import { Dialogo } from "@/components/escritorio/dialogo";
import { CAMPO_EN_FILA } from "@/components/escritorio/agente/campo-en-fila";

type Borrador = { nombre: string; activo: boolean; niveles: ServiceLevelMap };

function borradorDe(profesional: BookingProfessional): Borrador {
  return { nombre: profesional.name, activo: profesional.active, niveles: profesional.serviceLevels ?? {} };
}

function mismoBorrador(a: Borrador, b: Borrador) {
  const claves = new Set([...Object.keys(a.niveles), ...Object.keys(b.niveles)]);
  return (
    a.nombre === b.nombre &&
    a.activo === b.activo &&
    Array.from(claves).every((clave) => (a.niveles[clave] ?? "normal") === (b.niveles[clave] ?? "normal"))
  );
}

/**
 * Profesionales en escritorio: el equipo en una lista que se edita en la
 * fila (nombre y si está activo) y, al abrir a cada persona, su nivel en
 * cada servicio (wireframe 1l). Se guarda todo desde la barra del pie.
 */
export function ProfesionalesEscritorio() {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });
  const profesionales = ajustes.data?.professionals ?? [];
  const servicios = ajustes.data?.services ?? [];

  const [borradores, setBorradores] = useState<Record<string, Borrador>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<BookingProfessional | null>(null);

  const actual = (profesional: BookingProfessional) => borradores[profesional.id] ?? borradorDe(profesional);
  const cambiar = (profesional: BookingProfessional, cambio: Partial<Borrador>) => {
    const siguiente = { ...actual(profesional), ...cambio };
    setBorradores((actuales) => {
      const resto = { ...actuales };
      if (mismoBorrador(siguiente, borradorDe(profesional))) delete resto[profesional.id];
      else resto[profesional.id] = siguiente;
      return resto;
    });
  };

  const cambiados = Object.keys(borradores).length;
  const sinNombre = Object.values(borradores).some((borrador) => !borrador.nombre.trim());

  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
      queryClient.invalidateQueries({ queryKey: ["my-business"] }),
    ]);

  const guardar = useMutation({
    mutationFn: () =>
      Promise.all(
        Object.entries(borradores).map(([id, borrador]) =>
          updateBookingProfessional(id, { name: borrador.nombre.trim(), active: borrador.activo, serviceLevels: borrador.niveles })
        )
      ),
    onSuccess: async () => {
      await refrescar();
      setBorradores({});
      avisar("Cambios guardados.");
    },
    onError: async (error) => {
      await refrescar();
      const limite = getPlanLimitInfo(error);
      avisar(limite ? planLimitUpgradeMessage(limite) : "No se pudieron guardar todos los cambios. Revisa lo que queda pendiente.", "error");
    },
  });

  const crear = useMutation({
    mutationFn: (nombre: string) => createBookingProfessional({ name: nombre.trim(), serviceLevels: {} }),
    onSuccess: async (profesional) => {
      await refrescar();
      setNuevo(null);
      setAbierto(profesional.id);
      avisar(`${profesional.name} añadido al equipo. Marca qué servicios hace.`);
    },
    onError: (error) => {
      const limite = getPlanLimitInfo(error);
      avisar(limite ? `${planLimitUpgradeMessage(limite)} Puedes cambiar de plan en Facturación.` : "No se pudo añadir al profesional.", "error");
    },
  });

  const borrar = useMutation({
    mutationFn: (profesional: BookingProfessional) => deleteBookingProfessional(profesional.id),
    onSuccess: async (_, profesional) => {
      setBorradores((actuales) => {
        const resto = { ...actuales };
        delete resto[profesional.id];
        return resto;
      });
      await refrescar();
      setBorrando(null);
      avisar(`${profesional.name} ya no está en el equipo.`);
    },
    onError: () => avisar("No se pudo eliminar al profesional.", "error"),
  });

  return (
    <PantallaDeAjuste
      titulo="Profesionales"
      subtitulo="Quién hace qué. El agente recomienda al especialista una vez y reserva igualmente si el cliente insiste."
      accion={
        <button type="button" onClick={() => setNuevo((actual) => actual ?? "")} className="btn-secondary h-10 px-4">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Añadir profesional
        </button>
      }
    >
      {ajustes.isLoading ? (
        <div className="h-48 rounded-3xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
      ) : ajustes.isError ? (
        <SectionErrorState message="No se pudo cargar el equipo." onRetry={() => void ajustes.refetch()} />
      ) : (
        <>
          {nuevo !== null ? (
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                if (nuevo.trim()) crear.mutate(nuevo);
              }}
              className="mb-3 flex items-center gap-2 rounded-2xl border border-linea bg-relleno p-3"
            >
              <input
                autoFocus
                value={nuevo}
                onChange={(evento) => setNuevo(evento.target.value)}
                onKeyDown={(evento) => evento.key === "Escape" && setNuevo(null)}
                placeholder="Nombre del profesional"
                aria-label="Nombre del profesional nuevo"
                className="field h-10 min-w-0 flex-1 text-sm"
              />
              <button type="button" onClick={() => setNuevo(null)} disabled={crear.isPending} className="btn-secondary h-10 px-3">
                Cancelar
              </button>
              <button type="submit" disabled={!nuevo.trim() || crear.isPending} className="btn-primary h-10 px-4">
                {crear.isPending ? "Añadiendo…" : "Añadir"}
              </button>
            </form>
          ) : null}

          {profesionales.length === 0 ? (
            nuevo === null ? (
              <VacioMovil icono={UserRoundCheck} titulo="Todavía no hay profesionales">
                Añade al equipo para que la agenda no asigne más trabajo del que podéis absorber.
              </VacioMovil>
            ) : null
          ) : (
            <ul className="panel overflow-hidden p-0">
              {profesionales.map((profesional, indice) => {
                const borrador = actual(profesional);
                const especialista = servicios.filter((servicio) => resolveServiceLevel(borrador.niveles, servicio.id) === "especialista").length;
                const loHace = servicios.filter((servicio) => resolveServiceLevel(borrador.niveles, servicio.id) === "normal").length;
                const estaAbierto = abierto === profesional.id;
                const nombre = borrador.nombre.trim() || profesional.name;
                return (
                  <li
                    key={profesional.id}
                    className={`${indice > 0 ? "border-t border-linea-suave" : ""} ${borradores[profesional.id] ? "bg-lavado-3" : ""}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavado text-sm font-bold text-morado-tinta"
                      >
                        {nombre.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <input
                          value={borrador.nombre}
                          onChange={(evento) => cambiar(profesional, { nombre: evento.target.value })}
                          aria-label={`Nombre de ${profesional.name}`}
                          aria-invalid={!borrador.nombre.trim()}
                          className={`${CAMPO_EN_FILA} max-w-xs font-semibold`}
                        />
                        <span className="mt-0.5 flex flex-wrap gap-1.5 px-2">
                          {servicios.length === 0 ? null : (
                            <>
                              {especialista > 0 ? <Insignia tono="morado">{especialista} especialista</Insignia> : null}
                              {loHace > 0 ? <Insignia tono="neutro">{loHace} lo hace</Insignia> : null}
                              {especialista + loHace === 0 ? <Insignia tono="aviso">sin servicios</Insignia> : null}
                            </>
                          )}
                          {borrador.activo ? null : <Insignia tono="neutro">Inactivo</Insignia>}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAbierto(estaAbierto ? null : profesional.id)}
                        aria-expanded={estaAbierto}
                        aria-controls={`niveles-${profesional.id}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-tinta-2 transition hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                      >
                        Servicios que hace
                        <ChevronDown className={`h-4 w-4 transition ${estaAbierto ? "rotate-180" : ""}`} aria-hidden="true" />
                      </button>
                      <Interruptor activo={borrador.activo} etiqueta={`${nombre} activo`} onCambiar={(activo) => cambiar(profesional, { activo })} />
                      <button
                        type="button"
                        onClick={() => setBorrando(profesional)}
                        aria-label={`Eliminar a ${nombre}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted transition hover:bg-error-fondo hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {estaAbierto ? (
                      <div id={`niveles-${profesional.id}`} className="border-t border-linea-suave bg-relleno px-4 py-4">
                        <ProfessionalServiceLevels
                          services={servicios}
                          value={borrador.niveles}
                          onChange={(niveles) => cambiar(profesional, { niveles })}
                          idPrefix={`profesional-${profesional.id}`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <BarraGuardar
        visible={cambiados > 0}
        resumen={cambiados === 1 ? "1 profesional con cambios" : `${cambiados} profesionales con cambios`}
        detalle={sinNombre ? "falta un nombre" : undefined}
        etiqueta="Guardar cambios"
        guardando={guardar.isPending}
        deshabilitado={sinNombre}
        onGuardar={() => guardar.mutate()}
        onDescartar={() => setBorradores({})}
      />

      <Dialogo
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo={`¿Quitar a ${borrando?.name ?? "este profesional"} del equipo?`}
        descripcion="Ya no recibirá citas nuevas. Sus citas anteriores siguen en el historial."
        pie={
          <>
            <button type="button" onClick={() => setBorrando(null)} disabled={borrar.isPending} className="btn-secondary h-10 px-4">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => borrando && borrar.mutate(borrando)}
              disabled={borrar.isPending}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-peligro px-4 text-sm font-bold text-white transition hover:bg-peligro-hondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {borrar.isPending ? "Quitando…" : "Quitar del equipo"}
            </button>
          </>
        }
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

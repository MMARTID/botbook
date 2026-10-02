"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, ScissorsLineDashed, Trash2 } from "lucide-react";
import {
  createBookingService,
  deleteBookingService,
  getBookingSettings,
  updateBookingProfessional,
  updateBookingService,
} from "@/lib/api";
import { centsToEuroInput, euroInputToCents } from "@/lib/format";
import type { BookingService, ProfessionalServiceLevel } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import {
  resolveServiceLevel,
  SERVICE_LEVEL_INTERNAL_NOTE,
  SERVICE_LEVEL_OPTIONS,
  setServiceLevel,
  type ServiceLevelMap,
} from "@/components/professional-service-levels";
import { SectionErrorState } from "@/components/section-card";
import { BarraGuardar, VacioMovil } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";
import { Dialogo } from "@/components/escritorio/dialogo";
import { CAMPO_EN_FILA } from "@/components/escritorio/agente/campo-en-fila";

type Fila = { nombre: string; duracion: string; precio: string; activo: boolean };

const TONO_DEL_NIVEL: Record<ProfessionalServiceLevel, string> = {
  especialista: "border-lavado-borde bg-lavado text-morado-tinta",
  normal: "border-exito-borde bg-exito-fondo text-exito",
  no_sugerir: "border-linea bg-superficie text-apagado",
};

function filaDe(servicio: BookingService): Fila {
  return {
    nombre: servicio.name,
    duracion: String(servicio.durationMinutes),
    precio: centsToEuroInput(servicio.priceCents),
    activo: servicio.active,
  };
}

function mismaFila(a: Fila, b: Fila) {
  return a.nombre === b.nombre && a.duracion === b.duracion && a.precio === b.precio && a.activo === b.activo;
}

function mismosNiveles(a: ServiceLevelMap, b: ServiceLevelMap) {
  const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
  return Array.from(claves).every((clave) => (a[clave] ?? "normal") === (b[clave] ?? "normal"));
}

function duracionValida(texto: string) {
  const minutos = Number(texto);
  return Number.isInteger(minutos) && minutos >= 5 && minutos <= 480;
}

function precioValido(texto: string) {
  return texto.trim() === "" || euroInputToCents(texto) !== null;
}

/**
 * Servicios en escritorio (wireframe 1k): una tabla que se edita en la propia
 * fila —nombre, duración, precio y si está activo— con una columna por
 * profesional para su nivel en cada servicio. Antes cada servicio se abría
 * por separado. Todo se guarda de una vez desde la barra del pie.
 */
export function ServiciosEscritorio() {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });
  const servicios = ajustes.data?.services ?? [];
  const profesionales = (ajustes.data?.professionals ?? []).filter((profesional) => profesional.active);

  // Solo lo cambiado: si una fila vuelve a su valor guardado, deja de contar.
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [niveles, setNiveles] = useState<Record<string, ServiceLevelMap>>({});
  const [nuevo, setNuevo] = useState<Fila | null>(null);
  const [borrando, setBorrando] = useState<BookingService | null>(null);

  const filaActual = (servicio: BookingService) => filas[servicio.id] ?? filaDe(servicio);
  const nivelesActuales = (profesionalId: string) =>
    niveles[profesionalId] ?? profesionales.find((profesional) => profesional.id === profesionalId)?.serviceLevels ?? {};

  const cambiarFila = (servicio: BookingService, cambio: Partial<Fila>) => {
    const siguiente = { ...filaActual(servicio), ...cambio };
    setFilas((actuales) => {
      const resto = { ...actuales };
      if (mismaFila(siguiente, filaDe(servicio))) delete resto[servicio.id];
      else resto[servicio.id] = siguiente;
      return resto;
    });
  };

  const cambiarNivel = (profesionalId: string, servicioId: string, nivel: ProfessionalServiceLevel) => {
    const guardados = profesionales.find((profesional) => profesional.id === profesionalId)?.serviceLevels ?? {};
    const siguiente = setServiceLevel(nivelesActuales(profesionalId), servicioId, nivel);
    setNiveles((actuales) => {
      const resto = { ...actuales };
      if (mismosNiveles(siguiente, guardados)) delete resto[profesionalId];
      else resto[profesionalId] = siguiente;
      return resto;
    });
  };

  const celdasCambiadas = Object.entries(niveles).reduce((total, [profesionalId, mapa]) => {
    const guardados = profesionales.find((profesional) => profesional.id === profesionalId)?.serviceLevels ?? {};
    return total + servicios.filter((servicio) => resolveServiceLevel(mapa, servicio.id) !== resolveServiceLevel(guardados, servicio.id)).length;
  }, 0);
  const cambios = Object.keys(filas).length + celdasCambiadas;
  const invalidas = Object.values(filas).filter((fila) => !fila.nombre.trim() || !duracionValida(fila.duracion) || !precioValido(fila.precio));
  const sinPrecio = servicios.filter((servicio) => filaActual(servicio).precio.trim() === "").length;

  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["booking-settings"] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding-state"] }),
      queryClient.invalidateQueries({ queryKey: ["my-business"] }),
    ]);

  const guardar = useMutation({
    mutationFn: () =>
      Promise.all([
        ...Object.entries(filas).map(([id, fila]) =>
          updateBookingService(id, {
            name: fila.nombre.trim(),
            durationMinutes: Number(fila.duracion),
            priceCents: euroInputToCents(fila.precio),
            active: fila.activo,
          })
        ),
        ...Object.entries(niveles).map(([id, mapa]) => updateBookingProfessional(id, { serviceLevels: mapa })),
      ]),
    onSuccess: async () => {
      await refrescar();
      setFilas({});
      setNiveles({});
      avisar("Cambios guardados.");
    },
    // Lo que sí se guardó coincide ya con lo guardado y deja de contar como
    // cambio; queda a la vista solo lo que falló.
    onError: async () => {
      await refrescar();
      avisar("No se pudieron guardar todos los cambios. Revisa lo que queda pendiente.", "error");
    },
  });

  const crear = useMutation({
    mutationFn: (fila: Fila) =>
      createBookingService({
        name: fila.nombre.trim(),
        durationMinutes: Number(fila.duracion),
        priceCents: euroInputToCents(fila.precio),
      }),
    onSuccess: async (servicio) => {
      await refrescar();
      setNuevo(null);
      avisar(`Servicio ${servicio.name} creado.`);
    },
    onError: () => avisar("No se pudo crear el servicio.", "error"),
  });

  const borrar = useMutation({
    mutationFn: (servicio: BookingService) => deleteBookingService(servicio.id),
    onSuccess: async (_, servicio) => {
      setFilas((actuales) => {
        const resto = { ...actuales };
        delete resto[servicio.id];
        return resto;
      });
      await refrescar();
      setBorrando(null);
      avisar(`Servicio ${servicio.name} eliminado.`);
    },
    onError: () => avisar("No se pudo eliminar el servicio.", "error"),
  });

  const nuevoValido = nuevo ? nuevo.nombre.trim() !== "" && duracionValida(nuevo.duracion) && precioValido(nuevo.precio) : false;

  return (
    <PantallaDeAjuste
      titulo="Servicios"
      subtitulo="Lo que puede ofrecer y reservar por teléfono. La duración siempre sale de aquí; el precio es opcional."
      accion={
        <button
          type="button"
          onClick={() => setNuevo((actual) => actual ?? { nombre: "", duracion: "30", precio: "", activo: true })}
          className="btn-secondary h-10 px-4"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Añadir servicio
        </button>
      }
    >
      {ajustes.isLoading ? (
        <div className="h-64 rounded-3xl bg-relleno-fuerte motion-safe:animate-pulse" aria-hidden="true" />
      ) : ajustes.isError ? (
        <SectionErrorState message="No se pudieron cargar los servicios." onRetry={() => void ajustes.refetch()} />
      ) : (
        <>
          {servicios.length === 0 && !nuevo ? (
            <VacioMovil icono={ScissorsLineDashed} titulo="Todavía no hay servicios">
              Empieza por crear lo que el agente podrá ofrecer por teléfono.
            </VacioMovil>
          ) : (
            <div className="panel overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-linea bg-relleno text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="px-4 py-3">
                      Servicio
                    </th>
                    <th scope="col" className="w-[96px] px-2 py-3">
                      Duración
                    </th>
                    <th scope="col" className="w-[96px] px-2 py-3">
                      Precio
                    </th>
                    <th scope="col" className="w-16 px-2 py-3 text-center">
                      Activo
                    </th>
                    {profesionales.map((profesional) => (
                      <th key={profesional.id} scope="col" className="w-[128px] px-2 py-3 normal-case tracking-normal">
                        <span className="block truncate text-[13px] font-semibold text-tinta-2">{profesional.name}</span>
                      </th>
                    ))}
                    <th scope="col" className="w-12 px-2 py-3">
                      <span className="sr-only">Eliminar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((servicio) => {
                    const fila = filaActual(servicio);
                    const nombre = fila.nombre.trim() || servicio.name;
                    return (
                      <tr key={servicio.id} className={`border-b border-linea-suave last:border-b-0 ${filas[servicio.id] ? "bg-lavado-3" : ""}`}>
                        <td className="px-3 py-2">
                          <input
                            value={fila.nombre}
                            onChange={(evento) => cambiarFila(servicio, { nombre: evento.target.value })}
                            aria-label={`Nombre de ${servicio.name}`}
                            aria-invalid={!fila.nombre.trim()}
                            className={`${CAMPO_EN_FILA} min-w-[200px] font-semibold`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <CampoConUnidad
                            unidad="min"
                            valor={fila.duracion}
                            onCambiar={(duracion) => cambiarFila(servicio, { duracion: duracion.replace(/\D/g, "") })}
                            etiqueta={`Duración de ${nombre} en minutos`}
                            invalido={!duracionValida(fila.duracion)}
                            modo="numeric"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <CampoConUnidad
                            unidad="€"
                            valor={fila.precio}
                            onCambiar={(precio) => cambiarFila(servicio, { precio: precio.replace(/[^\d,.]/g, "") })}
                            etiqueta={`Precio de ${nombre} en euros`}
                            invalido={!precioValido(fila.precio)}
                            modo="decimal"
                            marcador="—"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={fila.activo}
                            onChange={() => cambiarFila(servicio, { activo: !fila.activo })}
                            aria-label={`${nombre} activo`}
                            className="h-4 w-4 accent-morado"
                          />
                        </td>
                        {profesionales.map((profesional) => (
                          <td key={profesional.id} className="px-2 py-2">
                            <SelectorDeNivel
                              nivel={resolveServiceLevel(nivelesActuales(profesional.id), servicio.id)}
                              onCambiar={(nivel) => cambiarNivel(profesional.id, servicio.id, nivel)}
                              etiqueta={`${profesional.name} en ${nombre}`}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => setBorrando(servicio)}
                            aria-label={`Eliminar ${nombre}`}
                            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition hover:bg-error-fondo hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {nuevo ? (
                  <tfoot>
                    <tr className="border-t border-linea bg-relleno">
                      <td className="px-3 py-2.5">
                        <input
                          autoFocus
                          value={nuevo.nombre}
                          onChange={(evento) => setNuevo({ ...nuevo, nombre: evento.target.value })}
                          onKeyDown={(evento) => {
                            if (evento.key === "Enter" && nuevoValido) crear.mutate(nuevo);
                            if (evento.key === "Escape") setNuevo(null);
                          }}
                          placeholder="Nuevo servicio, p. ej. Corte + peinado"
                          aria-label="Nombre del servicio nuevo"
                          className="field h-9 w-full min-w-[160px] text-sm"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <CampoConUnidad
                          unidad="min"
                          valor={nuevo.duracion}
                          onCambiar={(duracion) => setNuevo({ ...nuevo, duracion: duracion.replace(/\D/g, "") })}
                          etiqueta="Duración del servicio nuevo en minutos"
                          invalido={!duracionValida(nuevo.duracion)}
                          modo="numeric"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <CampoConUnidad
                          unidad="€"
                          valor={nuevo.precio}
                          onCambiar={(precio) => setNuevo({ ...nuevo, precio: precio.replace(/[^\d,.]/g, "") })}
                          etiqueta="Precio del servicio nuevo en euros"
                          invalido={!precioValido(nuevo.precio)}
                          modo="decimal"
                          marcador="—"
                        />
                      </td>
                      <td colSpan={profesionales.length + 2} className="px-2 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setNuevo(null)} disabled={crear.isPending} className="btn-secondary h-9 px-3">
                            Cancelar
                          </button>
                          <button type="button" onClick={() => crear.mutate(nuevo)} disabled={!nuevoValido || crear.isPending} className="btn-primary h-9 px-4">
                            {crear.isPending ? "Añadiendo…" : "Añadir"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}

          {servicios.length > 0 && profesionales.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-muted">
              Cuando añadas a tu equipo en{" "}
              <Link href="/agente?ajuste=profesionales" className="font-semibold text-morado-tinta underline underline-offset-2">
                Profesionales
              </Link>
              , aquí verás una columna por persona para decir quién hace cada servicio.
            </p>
          ) : profesionales.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              {SERVICE_LEVEL_OPTIONS.map((opcion) => (
                <span key={opcion.value}>
                  <strong className="font-semibold text-tinta-2">{opcion.label}</strong>: {opcion.detail}{" "}
                </span>
              ))}
              {SERVICE_LEVEL_INTERNAL_NOTE}
            </p>
          ) : null}
        </>
      )}

      <BarraGuardar
        visible={cambios > 0}
        resumen={cambios === 1 ? "1 cambio sin guardar" : `${cambios} cambios sin guardar`}
        detalle={
          invalidas.length > 0
            ? invalidas.length === 1
              ? "revisa la fila marcada en rojo"
              : `revisa las ${invalidas.length} filas marcadas en rojo`
            : sinPrecio > 0
              ? sinPrecio === 1
                ? "1 servicio sin precio"
                : `${sinPrecio} servicios sin precio`
              : undefined
        }
        etiqueta="Guardar cambios"
        guardando={guardar.isPending}
        deshabilitado={invalidas.length > 0}
        onGuardar={() => guardar.mutate()}
        onDescartar={() => {
          setFilas({});
          setNiveles({});
        }}
      />

      <Dialogo
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo={`¿Eliminar ${borrando?.name ?? "el servicio"}?`}
        descripcion="Se retirará de las nuevas reservas y de todos los profesionales. Las citas ya reservadas no se tocan."
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
              {borrar.isPending ? "Eliminando…" : "Eliminar servicio"}
            </button>
          </>
        }
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

function CampoConUnidad({
  unidad,
  valor,
  onCambiar,
  etiqueta,
  invalido,
  modo,
  marcador,
}: {
  unidad: string;
  valor: string;
  onCambiar: (valor: string) => void;
  etiqueta: string;
  invalido: boolean;
  modo: "numeric" | "decimal";
  marcador?: string;
}) {
  return (
    <span className="relative block">
      <input
        inputMode={modo}
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value)}
        aria-label={etiqueta}
        aria-invalid={invalido}
        placeholder={marcador}
        className={`${CAMPO_EN_FILA} pr-9 tabular-nums`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted" aria-hidden="true">
        {unidad}
      </span>
    </span>
  );
}

/** El nivel de un profesional en un servicio, como pastilla con su color. */
function SelectorDeNivel({
  nivel,
  onCambiar,
  etiqueta,
}: {
  nivel: ProfessionalServiceLevel;
  onCambiar: (nivel: ProfessionalServiceLevel) => void;
  etiqueta: string;
}) {
  return (
    <span className="relative inline-block w-[116px]">
      <select
        value={nivel}
        onChange={(evento) => onCambiar(evento.target.value as ProfessionalServiceLevel)}
        aria-label={etiqueta}
        className={`h-8 w-full cursor-pointer appearance-none rounded-full border pl-3 pr-7 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${TONO_DEL_NIVEL[nivel]}`}
      >
        {SERVICE_LEVEL_OPTIONS.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-70" aria-hidden="true" />
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";
import { getBookingSettings, updateBookingCapacity } from "@/lib/api";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { SectionErrorState } from "@/components/section-card";
import { BarraGuardar } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";
import { plural } from "@/components/movil/agente-movil";

const MINIMO = 1;
const MAXIMO = 50;

const CLASES_PASO =
  "inline-flex h-14 w-14 items-center justify-center rounded-full border border-tinta bg-superficie text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2 disabled:opacity-35";

/** Capacidad con un contador de botones grandes: sin teclado numérico. */
export function CapacidadMovil() {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });
  const guardada = ajustes.data?.bookingCapacity ?? 1;
  const [valor, setValor] = useState(guardada);
  useEffect(() => setValor(guardada), [guardada]);

  const guardar = useMutation({
    mutationFn: updateBookingCapacity,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["booking-settings"] });
      avisar("Capacidad actualizada.");
    },
    onError: () => avisar("No se pudo actualizar la capacidad.", "error"),
  });

  return (
    <PantallaDeAjuste
      titulo="Capacidad de reservas"
      subtitulo="Cuántas citas puede atender el negocio a la vez dentro de su horario."
    >
      {ajustes.isError ? (
        <SectionErrorState message="No se pudo cargar la capacidad." onRetry={() => void ajustes.refetch()} />
      ) : (
        <>
          <section className="panel flex flex-col items-center gap-4 px-4 py-7">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => setValor((actual) => Math.max(MINIMO, actual - 1))}
                disabled={ajustes.isLoading || valor <= MINIMO}
                aria-label="Menos plazas"
                className={CLASES_PASO}
              >
                <Minus className="h-6 w-6" aria-hidden="true" />
              </button>
              <output
                aria-live="polite"
                className="min-w-[76px] text-center text-[64px] font-extrabold leading-none tracking-[-0.04em] tabular-nums text-tinta"
              >
                {ajustes.isLoading ? "–" : valor}
              </output>
              <button
                type="button"
                onClick={() => setValor((actual) => Math.min(MAXIMO, actual + 1))}
                disabled={ajustes.isLoading || valor >= MAXIMO}
                aria-label="Más plazas"
                className={CLASES_PASO}
              >
                <Plus className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <p className="text-[15px] font-semibold text-tinta">{plural(valor, "cita simultánea", "citas simultáneas")}</p>
          </section>
          <p className="mx-1 mt-3.5 text-sm leading-[1.6] text-muted">
            Es independiente del número de profesionales. Entre {MINIMO} y {MAXIMO} citas a la vez.
          </p>
        </>
      )}
      <BarraGuardar
        visible={!ajustes.isLoading && valor !== guardada}
        etiqueta="Guardar capacidad"
        guardando={guardar.isPending}
        onGuardar={() => guardar.mutate(valor)}
        onDescartar={() => setValor(guardada)}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

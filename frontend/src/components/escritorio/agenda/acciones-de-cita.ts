"use client";

import axios from "axios";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { avisarClienteDeCita, cancelarCita, moverCita } from "@/lib/api";
import type { ResultadoDeCita } from "@/lib/types";

/** Los mensajes de estas rutas están escritos para el dueño (también los de
 * error): se enseñan tal cual. Sin mensaje propio, el de reserva. */
export function mensajeDeLaRespuesta(error: unknown, alternativa: string) {
  if (axios.isAxiosError(error)) {
    const mensaje = (error.response?.data as { error?: unknown } | undefined)?.error;
    if (typeof mensaje === "string" && mensaje.trim()) return mensaje;
  }
  return alternativa;
}

export type AvisoPendiente = {
  citaId: string;
  tipo: "cambio" | "cancelacion";
  telefono: string;
  cliente: string | null;
};

/** Todo lo que pinta una cita: tras moverla o cancelarla, la agenda, el
 * Panel y el resumen se vuelven a pedir. */
function invalidarAgenda(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["agenda-escritorio"] }),
    queryClient.invalidateQueries({ queryKey: ["agenda-panel"] }),
    queryClient.invalidateQueries({ queryKey: ["agenda-semana"] }),
    queryClient.invalidateQueries({ queryKey: ["agenda-inicio"] }),
    queryClient.invalidateQueries({ queryKey: ["stats"] }),
  ]);
}

/**
 * Mover, cancelar y avisar al cliente desde la agenda. Tras mover o
 * cancelar, si se le puede escribir por WhatsApp, queda un aviso pendiente
 * para preguntar «¿le avisamos?» (como el Gestor tras su «Hecho»).
 */
export function useAccionesDeCita(avisar: (mensaje: string, tipo?: "success" | "error") => void) {
  const queryClient = useQueryClient();
  const [avisoPendiente, setAvisoPendiente] = useState<AvisoPendiente | null>(null);

  const alTerminar = (citaId: string, tipo: AvisoPendiente["tipo"], resultado: ResultadoDeCita) => {
    avisar(resultado.mensaje);
    if (resultado.avisoAlCliente) setAvisoPendiente({ citaId, tipo, ...resultado.avisoAlCliente });
  };

  const mover = useMutation({
    mutationFn: (datos: { id: string; fechaHora: string; profesionalId?: string }) =>
      moverCita(datos.id, { fechaHora: datos.fechaHora, profesionalId: datos.profesionalId }) as Promise<ResultadoDeCita>,
    onSuccess: async (resultado, datos) => {
      await invalidarAgenda(queryClient);
      alTerminar(datos.id, "cambio", resultado);
    },
    onError: (error) => avisar(mensajeDeLaRespuesta(error, "No se ha podido mover la cita. Inténtalo en un rato."), "error"),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => cancelarCita(id),
    onSuccess: async (resultado, id) => {
      await invalidarAgenda(queryClient);
      alTerminar(id, "cancelacion", resultado);
    },
    onError: (error) => avisar(mensajeDeLaRespuesta(error, "No se ha podido cancelar la cita. Inténtalo en un rato."), "error"),
  });

  const avisarAlCliente = useMutation({
    mutationFn: (aviso: AvisoPendiente) => avisarClienteDeCita(aviso.citaId, aviso.tipo),
    onSuccess: (respuesta) => {
      setAvisoPendiente(null);
      avisar(respuesta.mensaje);
    },
    onError: (error) => {
      setAvisoPendiente(null);
      avisar(mensajeDeLaRespuesta(error, "No se ha podido mandar el aviso por WhatsApp. Llámale tú."), "error");
    },
  });

  return { mover, cancelar, avisarAlCliente, avisoPendiente, descartarAviso: () => setAvisoPendiente(null) };
}

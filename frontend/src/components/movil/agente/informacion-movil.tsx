"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMyBusiness } from "@/lib/api";
import type { Business } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { BarraGuardar } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

/** Información para responder: el campo a lo ancho, con su contador. */
export function InformacionMovil({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const guardada = business.businessDetails ?? "";
  const [texto, setTexto] = useState(guardada);
  useEffect(() => setTexto(guardada), [guardada]);

  const guardar = useMutation({
    mutationFn: () => updateMyBusiness({ businessDetails: texto }),
    onSuccess: (negocio) => {
      queryClient.setQueryData(["my-business"], negocio);
      avisar("Información para el agente actualizada.");
    },
    onError: () => avisar("No se pudo guardar la información para el agente.", "error"),
  });

  return (
    <PantallaDeAjuste titulo="Información para responder" subtitulo="Datos que el agente puede usar al responder a tus clientes.">
      <label className="block text-sm font-semibold text-[#27272a]">
        Dirección, contacto y políticas útiles
        <textarea
          rows={9}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Dirección, cómo llegar, política de cancelación, métodos de pago o indicaciones importantes."
          className="field mt-2 block h-auto min-h-[220px] w-full resize-none px-4 py-3 text-[15px] font-normal leading-[1.6]"
        />
      </label>
      <p className="mx-1 mt-2 text-right text-[13px] tabular-nums text-muted">
        {texto.length} {texto.length === 1 ? "carácter" : "caracteres"}
      </p>
      <p className="mx-1 mt-2.5 text-sm leading-[1.6] text-muted">
        Los servicios, horarios y profesionales se configuran en sus propias pantallas.
      </p>
      <BarraGuardar
        visible={texto !== guardada}
        etiqueta="Guardar información"
        guardando={guardar.isPending}
        onGuardar={() => guardar.mutate()}
        onDescartar={() => setTexto(guardada)}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

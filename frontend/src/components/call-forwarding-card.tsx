"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Loader2, PhoneForwarded, Clock3 } from "lucide-react";
import { confirmForwarding } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import type { OnboardingForwarding } from "@/lib/types";

/**
 * Códigos MMI del estándar GSM (3GPP TS 22.030): son los mismos en Movistar,
 * Vodafone, Orange, Yoigo y MásMóvil, no dependen de la operadora. Se marcan
 * en el teléfono como una llamada normal.
 *
 * El primero es el que corresponde a la promesa del producto — «solo las
 * llamadas que no contestas» — así que va primero y es el recomendado.
 */
const CODIGOS_MOVIL = [
  {
    id: "no-contesta",
    titulo: "Cuando no contestas",
    descripcion: "Suena en tu teléfono; si no lo coges, atiende tu recepcionista. Es el recomendado.",
    activar: (numero: string) => `**61*${numero}#`,
    desactivar: "##61#",
    recomendado: true,
  },
  {
    id: "comunicando",
    titulo: "Cuando estás comunicando",
    descripcion: "Para no perder al cliente que llama mientras hablas con otro.",
    activar: (numero: string) => `**67*${numero}#`,
    desactivar: "##67#",
    recomendado: false,
  },
  {
    id: "apagado",
    titulo: "Cuando estás sin cobertura o apagado",
    descripcion: "Cubre las horas en las que tienes el teléfono apagado o sin línea.",
    activar: (numero: string) => `**62*${numero}#`,
    desactivar: "##62#",
    recomendado: false,
  },
  {
    id: "todas",
    titulo: "Todas las llamadas",
    descripcion: "Tu teléfono no suena: todas van directas a la recepcionista.",
    activar: (numero: string) => `**21*${numero}#`,
    desactivar: "##21#",
    recomendado: false,
  },
];

type CallForwardingCardProps = {
  forwarding: OnboardingForwarding;
};

export function CallForwardingCard({ forwarding }: CallForwardingCardProps) {
  const queryClient = useQueryClient();
  const [copiado, setCopiado] = useState<string | null>(null);

  const confirmMutation = useMutation({
    mutationFn: confirmForwarding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    },
  });

  const copiar = async (valor: string, id: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(id);
      window.setTimeout(() => setCopiado((actual) => (actual === id ? null : actual)), 2000);
    } catch {
      // Portapapeles bloqueado (permisos del navegador): el código está a la
      // vista, así que se puede copiar a mano; no hace falta alarmar.
      setCopiado(null);
    }
  };

  if (forwarding.status === "waiting_number") {
    return (
      <section id="desvio" className="panel scroll-mt-32 border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
              Estamos activando tu número
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Tu número español tarda unos minutos en quedar aprobado. En cuanto lo esté, aquí mismo te
              diremos cómo desviar tu línea de siempre para empezar a recibir llamadas. Mientras tanto,
              completa la configuración: es lo que tu recepcionista necesita para poder reservar citas.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const numero = forwarding.phoneNumber;
  if (!numero) return null;

  const recomendado = CODIGOS_MOVIL[0];
  const otrosCodigos = CODIGOS_MOVIL.slice(1);

  return (
    <section
      id="desvio"
      className="panel scroll-mt-32 border-[#ddd6fe] bg-[#f3eeff] p-4 sm:p-5"
      aria-labelledby="desvio-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
          <PhoneForwarded className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="desvio-title" className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
            Activa el desvío para empezar a recibir llamadas
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Tus clientes siguen llamando a tu número de siempre. El desvío es lo que hace que las
            llamadas que no puedes coger lleguen a tu recepcionista, sin cambiar de número ni avisar a
            nadie.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">Tu número de Alhabla</p>
          <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#0a0a0a]">
            {formatPhone(numero)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => copiar(numero, "numero")}
          className="btn-secondary h-11 shrink-0 px-4"
        >
          {copiado === "numero" ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar número
            </>
          )}
        </button>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-[#0a0a0a]">Desde un móvil</h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        Marca el código en tu teléfono como si fuera una llamada normal. Funciona igual en Movistar,
        Vodafone, Orange, Yoigo y MásMóvil.
      </p>

      {/* Solo el recomendado a la vista: elegir entre cuatro modos de desvío
          es una decisión que este usuario no tiene por qué tomar para empezar. */}
      <div className="mt-3">
        <CodigoFila
          codigo={recomendado}
          numero={numero}
          copiado={copiado}
          onCopiar={copiar}
        />
      </div>

      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-1 py-2 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
          Otras formas de desviar
          <ChevronDown className="h-4 w-4 transition duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-2 space-y-2">
          {otrosCodigos.map((codigo) => (
            <li key={codigo.id}>
              <CodigoFila codigo={codigo} numero={numero} copiado={copiado} onCopiar={copiar} />
            </li>
          ))}
        </ul>
      </details>

      <h3 className="mt-5 text-sm font-semibold text-[#0a0a0a]">Desde un fijo</h3>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
        En las líneas fijas el código sí cambia según la compañía. Lo habitual es marcar{" "}
        <span className="font-mono text-[#27272a]">*21*{numero}#</span> para desviar todas las llamadas,
        pero si no funciona, tu operadora puede activarlo por ti en un minuto llamando a su atención al
        cliente.
      </p>

      <div className="mt-5 flex flex-col gap-3 border-t border-[#ddd6fe] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          En cuanto entre la primera llamada lo damos por hecho automáticamente.
        </p>
        <button
          type="button"
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending}
          className="btn-primary h-11 shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirmMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          Ya lo he activado
        </button>
      </div>

      {confirmMutation.isError ? (
        <p className="mt-3 text-sm font-medium text-[#c53030]">
          No se pudo guardar la confirmación. Inténtalo otra vez en unos segundos.
        </p>
      ) : null}
    </section>
  );
}

function CodigoFila({
  codigo,
  numero,
  copiado,
  onCopiar,
}: {
  codigo: (typeof CODIGOS_MOVIL)[number];
  numero: string;
  copiado: string | null;
  onCopiar: (valor: string, id: string) => void;
}) {
  const valor = codigo.activar(numero);

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
            {codigo.titulo}
            {codigo.recomendado ? <span className="badge-soft">Recomendado</span> : null}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{codigo.descripcion}</p>
        </div>
        <button
          type="button"
          onClick={() => onCopiar(valor, codigo.id)}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-4 font-mono text-sm text-[#0a0a0a] transition duration-200 hover:border-[#8b5cf6] hover:bg-[#f3eeff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          aria-label={`Copiar el código ${valor}`}
        >
          {copiado === codigo.id ? (
            <Check className="h-4 w-4 shrink-0 text-[#2c7334]" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-[#52525b]" aria-hidden="true" />
          )}
          {valor}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Para anularlo más adelante, marca{" "}
        <span className="font-mono text-[#27272a]">{codigo.desactivar}</span>
      </p>
    </div>
  );
}

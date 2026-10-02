"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import { getBillingSummary, updateMyBusiness } from "@/lib/api";
import type { AgentLanguage, AgentSettings, Business, VoiceLanguage } from "@/lib/types";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { DEFAULT_AGENT_SETTINGS } from "@/components/agent-settings-editor";
import { BarraGuardar } from "@/components/movil/piezas";
import { PantallaDeAjuste } from "@/components/movil/agente/pantalla-de-ajuste";

type CampoDeOpciones = "tone" | "primaryGoal" | "responseStyle" | "escalation";

const CAMPOS: Array<{ clave: CampoDeOpciones; titulo: string; texto: string; opciones: Array<[string, string, string]> }> = [
  {
    clave: "tone",
    titulo: "Tono de voz",
    texto: "Cómo debe sonar durante la llamada.",
    opciones: [
      ["warm", "Cercano", "Natural y empático"],
      ["professional", "Profesional", "Formal y seguro"],
      ["direct", "Ágil", "Práctico y directo"],
    ],
  },
  {
    clave: "primaryGoal",
    titulo: "Objetivo principal",
    texto: "Qué debe priorizar el agente.",
    opciones: [
      ["bookings", "Conseguir reservas", "Guiar la llamada hacia una cita"],
      ["customer_service", "Atender consultas", "Resolver y reservar si procede"],
      ["lead_capture", "Captar oportunidades", "Recoger datos para seguimiento"],
    ],
  },
  {
    clave: "responseStyle",
    titulo: "Estilo de respuesta",
    texto: "Cuánto debe extenderse al responder.",
    opciones: [
      ["concise", "Breve", "Una o dos frases"],
      ["balanced", "Equilibrado", "Algo más de contexto"],
    ],
  },
  {
    clave: "escalation",
    titulo: "Cuando no pueda resolverlo",
    texto: "Protocolo seguro ante información desconocida.",
    opciones: [
      ["take_message", "Tomar un recado", "Nombre, teléfono y motivo"],
      ["request_callback", "Solicitar devolución", "Pedir datos para llamar después"],
    ],
  },
];

const IDIOMAS: Array<{ valor: AgentLanguage; nombre: string }> = [
  { valor: "es-ES", nombre: "Español" },
  { valor: "en-GB", nombre: "Inglés" },
  { valor: "fr-FR", nombre: "Francés" },
  { valor: "ca-ES", nombre: "Catalán" },
];
// Catalán no: no tiene voz curada (telnyxEligibility.ts), aunque sí pueda
// atenderse en catalán.
const IDIOMAS_DE_VOZ: Array<{ valor: VoiceLanguage; nombre: string }> = [
  { valor: "es-ES", nombre: "Español" },
  { valor: "en-GB", nombre: "Inglés" },
  { valor: "fr-FR", nombre: "Francés" },
];

function Opcion({
  elegida,
  titulo,
  detalle,
  disabled,
  onClick,
  forma = "radio",
}: {
  elegida: boolean;
  titulo: string;
  detalle?: string;
  disabled?: boolean;
  onClick: () => void;
  forma?: "radio" | "check";
}) {
  return (
    <button
      type="button"
      role={forma === "radio" ? "radio" : "checkbox"}
      aria-checked={elegida}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-60 ${
        elegida ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-[#0a0a0a]">{titulo}</span>
        {detalle ? <span className="mt-px block text-[13px] text-muted">{detalle}</span> : null}
      </span>
      {forma === "radio" ? (
        <span
          aria-hidden="true"
          className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${elegida ? "border-[#8b5cf6] bg-[#8b5cf6] shadow-[inset_0_0_0_4px_#fff]" : "border-[#d4d4d8] bg-white"}`}
        />
      ) : (
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${elegida ? "bg-[#8b5cf6] text-white" : "bg-[#f4f4f5] text-transparent"}`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

/**
 * Cómo atiende: cada opción es una fila que se elige con un toque y lleva
 * su explicación. El idioma y la voz se bloquean, con su aviso, en los
 * planes que no los incluyen (lo valida también el backend).
 */
export function ComportamientoMovil({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const { aviso, avisar, cerrar } = useAviso();
  const resumen = useQuery({ queryKey: ["billing-summary"], queryFn: getBillingSummary });
  const bloqueado = resumen.data !== undefined && !resumen.data.planFeatures?.includes("voz_idioma");

  // Por contenido: un refresco del negocio al volver a la app no debe
  // borrar lo que se estaba eligiendo.
  const firmaGuardada = JSON.stringify({ ...DEFAULT_AGENT_SETTINGS, ...business.agentSettings });
  const guardado = useMemo(() => JSON.parse(firmaGuardada) as AgentSettings, [firmaGuardada]);
  const [ajustes, setAjustes] = useState(guardado);
  useEffect(() => setAjustes(guardado), [guardado]);

  const guardar = useMutation({
    mutationFn: () => updateMyBusiness({ agentSettings: ajustes }),
    onSuccess: (negocio) => {
      queryClient.setQueryData(["my-business"], negocio);
      avisar("Comportamiento del agente actualizado.");
    },
    onError: () => avisar("No se pudo guardar el comportamiento del agente.", "error"),
  });

  const alternarIdioma = (idioma: AgentLanguage) => {
    if (idioma === "es-ES") return;
    const activos = ajustes.languages.includes(idioma)
      ? ajustes.languages.filter((actual) => actual !== idioma)
      : [...ajustes.languages, idioma];
    const ordenados = IDIOMAS.map((opcion) => opcion.valor).filter((valor) => activos.includes(valor));
    // Si se quita el idioma de la voz, vuelve a español: nunca puede quedar
    // apuntando a un idioma que ya no se atiende.
    const voz = ordenados.includes(ajustes.voiceLanguage) ? ajustes.voiceLanguage : "es-ES";
    setAjustes({ ...ajustes, languages: ordenados, voiceLanguage: voz });
  };

  return (
    <PantallaDeAjuste titulo="Cómo atiende" subtitulo="El tono, el objetivo y el modo en que gestiona cada conversación.">
      <div className="flex flex-col gap-[22px]">
        {CAMPOS.map((campo) => (
          <fieldset key={campo.clave} className="min-w-0">
            <legend className="text-base font-bold text-[#0a0a0a]">{campo.titulo}</legend>
            <p className="mb-2.5 mt-0.5 text-sm text-muted">{campo.texto}</p>
            <div role="radiogroup" aria-label={campo.titulo} className="flex flex-col gap-2">
              {campo.opciones.map(([valor, titulo, detalle]) => (
                <Opcion
                  key={valor}
                  elegida={ajustes[campo.clave] === valor}
                  titulo={titulo}
                  detalle={detalle}
                  onClick={() => setAjustes({ ...ajustes, [campo.clave]: valor })}
                />
              ))}
            </div>
          </fieldset>
        ))}

        <fieldset className="min-w-0">
          <legend className="text-base font-bold text-[#0a0a0a]">Idioma y voz</legend>
          <p className="mb-2.5 mt-0.5 text-sm text-muted">
            Empieza en español y sigue en el idioma de quien llama.
          </p>
          {bloqueado ? (
            <div className="mb-3 flex items-start gap-2.5 rounded-[14px] border border-[#ddd6fe] bg-[#f3eeff] px-3.5 py-3 text-[#6d28d9]">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-[13px] leading-[1.55]">
                Elegir la voz y los idiomas está disponible en los planes Pro y Scale.{" "}
                <Link href="/ajustes/facturacion" className="font-bold underline underline-offset-[3px]">
                  Ampliar plan
                </Link>
              </p>
            </div>
          ) : null}
          {bloqueado ? (
            // Sin la función en el plan no hay nada que elegir: lo activo en
            // pastillas y la voz en una línea, en vez de once controles
            // apagados.
            <>
              <div className="flex flex-wrap gap-2">
                {IDIOMAS.map((idioma) => {
                  const activo = ajustes.languages.includes(idioma.valor);
                  return (
                    <span
                      key={idioma.valor}
                      className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold ${
                        activo ? "border-[#ddd6fe] bg-[#f3eeff] text-[#6d28d9]" : "border-[#e5e5e5] bg-[#fafafa] text-[#52525b] opacity-80"
                      }`}
                    >
                      {idioma.nombre}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-muted">
                Voz {ajustes.voiceGender === "masculina" ? "masculina" : "femenina"} ·{" "}
                {IDIOMAS_DE_VOZ.find((idioma) => idioma.valor === ajustes.voiceLanguage)?.nombre ?? "Español"}
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {IDIOMAS.map((idioma) => (
                  <Opcion
                    key={idioma.valor}
                    forma="check"
                    elegida={ajustes.languages.includes(idioma.valor)}
                    titulo={idioma.nombre}
                    detalle={idioma.valor === "es-ES" ? "Siempre activo" : undefined}
                    disabled={idioma.valor === "es-ES"}
                    onClick={() => alternarIdioma(idioma.valor)}
                  />
                ))}
              </div>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Voz</p>
              <div role="radiogroup" aria-label="Voz del agente" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["femenina", "Femenina"],
                    ["masculina", "Masculina"],
                  ] as const
                ).map(([valor, titulo]) => (
                  <Opcion
                    key={valor}
                    elegida={ajustes.voiceGender === valor}
                    titulo={titulo}
                    onClick={() => setAjustes({ ...ajustes, voiceGender: valor })}
                  />
                ))}
              </div>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Idioma de la voz</p>
              <div role="radiogroup" aria-label="Idioma de la voz" className="flex flex-col gap-2">
                {IDIOMAS_DE_VOZ.map((idioma) => (
                  <Opcion
                    key={idioma.valor}
                    elegida={ajustes.voiceLanguage === idioma.valor}
                    titulo={idioma.nombre}
                    disabled={!ajustes.languages.includes(idioma.valor)}
                    onClick={() => setAjustes({ ...ajustes, voiceLanguage: idioma.valor })}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">Solo puedes elegir un idioma que esté activo arriba.</p>
            </>
          )}
        </fieldset>
      </div>
      <BarraGuardar
        visible={JSON.stringify(ajustes) !== firmaGuardada}
        etiqueta="Guardar comportamiento"
        guardando={guardar.isPending}
        onGuardar={() => guardar.mutate()}
        onDescartar={() => setAjustes(guardado)}
      />
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </PantallaDeAjuste>
  );
}

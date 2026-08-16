"use client";

import { Bot, Check, Save } from "lucide-react";
import type { AgentSettings } from "@/lib/types";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
};

const fields = [
  {
    key: "tone" as const,
    label: "Tono de voz",
    description: "Cómo debe sonar durante la llamada.",
    options: [
      { value: "warm", label: "Cercano", detail: "Natural y empático" },
      { value: "professional", label: "Profesional", detail: "Formal y seguro" },
      { value: "direct", label: "Ágil", detail: "Práctico y directo" },
    ],
  },
  {
    key: "primaryGoal" as const,
    label: "Objetivo principal",
    description: "Qué debe priorizar el agente.",
    options: [
      { value: "bookings", label: "Conseguir reservas", detail: "Guiar la llamada hacia una cita" },
      { value: "customer_service", label: "Atender consultas", detail: "Resolver y reservar si procede" },
      { value: "lead_capture", label: "Captar oportunidades", detail: "Recoger datos para seguimiento" },
    ],
  },
  {
    key: "responseStyle" as const,
    label: "Estilo de respuesta",
    description: "Cuánto debe extenderse al responder.",
    options: [
      { value: "concise", label: "Breve", detail: "Una o dos frases" },
      { value: "balanced", label: "Equilibrado", detail: "Algo más de contexto" },
    ],
  },
  {
    key: "escalation" as const,
    label: "Cuando no pueda resolverlo",
    description: "Protocolo seguro ante información desconocida.",
    options: [
      { value: "take_message", label: "Tomar un recado", detail: "Nombre, teléfono y motivo" },
      { value: "request_callback", label: "Solicitar devolución", detail: "Pedir datos para llamar después" },
    ],
  },
] as const;

export function AgentSettingsEditor({
  value,
  isSaving,
  onChange,
  onSave,
}: {
  value: AgentSettings;
  isSaving: boolean;
  onChange: (settings: AgentSettings) => void;
  onSave: () => void;
}) {
  return (
    <article className="panel overflow-hidden p-0">
      <div className="border-b border-[#dce6d4] bg-[linear-gradient(90deg,#eef6dc,#f8faf5)] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-[#405115]">
          <Bot className="h-5 w-5" />
          <h2 className="text-xl font-semibold text-[#1e2b22]">Comportamiento del agente</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#687267]">
          Elige cómo debe atender. AsistAI genera y protege las instrucciones internas para evitar configuraciones inseguras o contradictorias.
        </p>
      </div>

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-2">
        {fields.map((field) => (
          <fieldset key={field.key} className="rounded-3xl border border-[#dce7d2] bg-[#fbfcf8] p-4 sm:p-5">
            <legend className="px-1 text-sm font-semibold text-[#1e2b22]">{field.label}</legend>
            <p className="mb-3 mt-1 text-sm text-[#687267]">{field.description}</p>
            <div className="grid gap-2">
              {field.options.map((option) => {
                const selected = value[field.key] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange({ ...value, [field.key]: option.value })}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${selected ? "border-[#b9d489] bg-[#f1f8e3] shadow-sm" : "border-[#e1e8da] bg-white hover:border-[#cfddc4]"}`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[#344038]">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-[#687267]">{option.detail}</span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${selected ? "bg-[#b8d96e] text-[#30430f]" : "bg-[#eef0ec] text-transparent"}`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex justify-end border-t border-[#e4e8df] bg-white px-4 py-4 sm:px-6">
        <button type="button" onClick={onSave} disabled={isSaving} className="btn-primary px-5">
          <Save className="h-4 w-4" /> {isSaving ? "Guardando..." : "Guardar comportamiento"}
        </button>
      </div>
    </article>
  );
}

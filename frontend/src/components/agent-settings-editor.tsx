"use client";

import { Bot, Check, Languages, Save } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import type { AgentLanguage, AgentSettings } from "@/lib/types";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
  languages: ["es-ES"],
};

const languageOptions: Array<{
  value: AgentLanguage;
  label: string;
  detail: string;
  required?: boolean;
}> = [
  { value: "es-ES", label: "Español", detail: "Siempre activo", required: true },
  { value: "en-GB", label: "Inglés", detail: "Inglés británico" },
  { value: "fr-FR", label: "Francés", detail: "Francés de Francia" },
  { value: "ca-ES", label: "Catalán", detail: "Catalán" },
];

function normalizeLanguages(languages: AgentLanguage[]): AgentLanguage[] {
  return languageOptions
    .map((option) => option.value)
    .filter((language) => languages.includes(language));
}

const fields = [
  {
    key: "voiceGender" as const,
    label: "Voz del agente",
    description: "Con qué voz atiende las llamadas.",
    options: [
      { value: "femenina", label: "Femenina", detail: "Voz por defecto" },
      { value: "masculina", label: "Masculina", detail: "Alternativa disponible" },
    ],
  },
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
  open,
  onToggle,
}: {
  value: AgentSettings;
  isSaving: boolean;
  onChange: (settings: AgentSettings) => void;
  onSave: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  const languageSummary = normalizeLanguages(value.languages)
    .map((language) => languageOptions.find((option) => option.value === language)?.label)
    .filter(Boolean)
    .join(" · ");
  const summary = [
    languageSummary,
    ...fields
    .map((field) => field.options.find((option) => option.value === value[field.key])?.label)
    .filter(Boolean),
  ].filter(Boolean).join(" · ");

  const toggleLanguage = (language: AgentLanguage) => {
    if (language === "es-ES") return;
    const next = value.languages.includes(language)
      ? value.languages.filter((current) => current !== language)
      : [...value.languages, language];
    onChange({ ...value, languages: normalizeLanguages(next) });
  };

  return (
    <SettingsSection
      id="agent-settings"
      icon={Bot}
      title="Comportamiento del agente"
      summary={summary}
      open={open}
      onToggle={onToggle}
    >
      <p className="max-w-3xl px-4 pt-4 text-sm leading-6 text-muted sm:px-6">
        Elige cómo debe atender. Alhabla genera y protege las instrucciones internas para evitar configuraciones inseguras o contradictorias.
      </p>

      <div className="grid gap-5 p-4 sm:p-6 xl:grid-cols-2">
        <fieldset className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:col-span-2 sm:p-5">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-[#0a0a0a]">
            <Languages className="h-4 w-4 text-[#8b5cf6]" />
            Idiomas de atención
          </legend>
          <p className="mb-3 mt-1 text-sm text-muted">
            La recepcionista empieza en español y continúa en el idioma de quien llama.
          </p>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {languageOptions.map((option) => {
              const selected = value.languages.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${selected ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"} ${option.required ? "cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={option.required}
                    onChange={() => toggleLanguage(option.value)}
                    className="peer sr-only"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#27272a]">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{option.detail}</span>
                  </span>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b5cf6] peer-focus-visible:ring-offset-2 ${selected ? "bg-[#8b5cf6] text-[#ffffff]" : "bg-[#f4f4f5] text-transparent"}`}>
                    <Check className="h-3.5 w-3.5" />
                  </span>
                </label>
              );
            })}
          </div>
          {value.languages.length > 1 ? (
            <p className="mt-3 rounded-lg border border-[#ddd6fe] bg-white px-3 py-2 text-xs leading-5 text-muted">
              Activa solo los idiomas que atiendes habitualmente: cuantos menos haya activos, más precisa será la detección.
            </p>
          ) : null}
        </fieldset>
        {fields.map((field) => (
          <fieldset key={field.key} className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
            <legend className="px-1 text-sm font-semibold text-[#0a0a0a]">{field.label}</legend>
            <p className="mb-3 mt-1 text-sm text-muted">{field.description}</p>
            <div className="grid gap-2">
              {field.options.map((option) => {
                const selected = value[field.key] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange({ ...value, [field.key]: option.value })}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${selected ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"}`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[#27272a]">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{option.detail}</span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${selected ? "bg-[#8b5cf6] text-[#ffffff]" : "bg-[#f4f4f5] text-transparent"}`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex justify-end border-t border-[#e5e5e5] bg-white px-4 py-4 sm:px-6">
        <button type="button" onClick={onSave} disabled={isSaving} className="btn-primary px-5">
          <Save className="h-4 w-4" /> {isSaving ? "Guardando..." : "Guardar comportamiento"}
        </button>
      </div>
    </SettingsSection>
  );
}

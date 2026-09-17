"use client";

import Link from "next/link";
import { Bot, Check, Languages, Lock, Mic, Save } from "lucide-react";
import { SettingsSection } from "@/components/settings-section";
import type { AgentLanguage, AgentSettings, VoiceLanguage } from "@/lib/types";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  version: 1,
  tone: "warm",
  primaryGoal: "bookings",
  responseStyle: "concise",
  escalation: "take_message",
  voiceGender: "femenina",
  languages: ["es-ES"],
  voiceLanguage: "es-ES",
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

// Solo estos tres tienen voz Telnyx Ultra curada (telnyxEligibility.ts) —
// catalán no entra aquí aunque sí pueda activarse como idioma de atención.
const voiceLanguageOptions: Array<{ value: VoiceLanguage; label: string }> = [
  { value: "es-ES", label: "Español" },
  { value: "en-GB", label: "Inglés" },
  { value: "fr-FR", label: "Francés" },
];

function VoiceUpgradeNotice() {
  return (
    <p className="mb-3 flex items-start gap-2 rounded-xl border border-[#ddd6fe] bg-[#f3eeff] px-3 py-2 text-xs leading-5 text-[#6d28d9]">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Elegir la voz y los idiomas está disponible en los planes Pro y Scale.{" "}
        <Link href="/ajustes/facturacion" className="font-semibold underline underline-offset-2">
          Ampliar plan
        </Link>
      </span>
    </p>
  );
}

function normalizeLanguages(languages: AgentLanguage[]): AgentLanguage[] {
  return languageOptions
    .map((option) => option.value)
    .filter((language) => languages.includes(language));
}

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
  open,
  onToggle,
  voiceLocked = false,
}: {
  value: AgentSettings;
  isSaving: boolean;
  onChange: (settings: AgentSettings) => void;
  onSave: () => void;
  open: boolean;
  onToggle: () => void;
  /** true cuando el plan (Inicio) no incluye elegir voz e idiomas. */
  voiceLocked?: boolean;
}) {
  const languageSummary = normalizeLanguages(value.languages)
    .map((language) => languageOptions.find((option) => option.value === language)?.label)
    .filter(Boolean)
    .join(" · ");
  const voiceGenderLabel = value.voiceGender === "masculina" ? "Masculina" : "Femenina";
  const voiceLanguageLabel = voiceLanguageOptions.find(
    (option) => option.value === value.voiceLanguage
  )?.label;
  const summary = [
    languageSummary,
    [voiceGenderLabel, voiceLanguageLabel].filter(Boolean).join(" "),
    ...fields
    .map((field) => field.options.find((option) => option.value === value[field.key])?.label)
    .filter(Boolean),
  ].filter(Boolean).join(" · ");

  const toggleLanguage = (language: AgentLanguage) => {
    if (language === "es-ES") return;
    const next = value.languages.includes(language)
      ? value.languages.filter((current) => current !== language)
      : [...value.languages, language];
    const normalized = normalizeLanguages(next);
    // Si se desactiva el idioma que hoy usa la voz, vuelve a español — nunca
    // se puede dejar voiceLanguage apuntando a un idioma ya no atendido.
    const voiceLanguage = normalized.includes(value.voiceLanguage)
      ? value.voiceLanguage
      : "es-ES";
    onChange({ ...value, languages: normalized, voiceLanguage });
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
          {voiceLocked ? <VoiceUpgradeNotice /> : null}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {languageOptions.map((option) => {
              const selected = value.languages.includes(option.value);
              const disabled = option.required || voiceLocked;
              return (
                <label
                  key={option.value}
                  className={`relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${selected ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"} ${disabled ? "cursor-not-allowed" : ""} ${voiceLocked && !selected ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
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
            <p className="mt-3 rounded-xl border border-[#ddd6fe] bg-white px-3 py-2 text-xs leading-5 text-muted">
              Activa solo los idiomas que atiendes habitualmente: cuantos menos haya activos, más precisa será la detección.
            </p>
          ) : null}
        </fieldset>
        <fieldset className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:col-span-2 sm:p-5">
          <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-[#0a0a0a]">
            <Mic className="h-4 w-4 text-[#8b5cf6]" />
            Voz del agente
          </legend>
          <p className="mb-3 mt-1 text-sm text-muted">
            Con qué voz atiende las llamadas.
          </p>
          {voiceLocked ? <VoiceUpgradeNotice /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              {[
                { value: "femenina" as const, label: "Femenina", detail: "Voz por defecto" },
                { value: "masculina" as const, label: "Masculina", detail: "Alternativa disponible" },
              ].map((option) => {
                const selected = value.voiceGender === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={voiceLocked}
                    onClick={() => onChange({ ...value, voiceGender: option.value })}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 ${selected ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"} ${voiceLocked ? "cursor-not-allowed" : ""} ${voiceLocked && !selected ? "opacity-60" : ""}`}
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
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Idioma de la voz
              </p>
              <div className="grid gap-2">
                {voiceLanguageOptions.map((option) => {
                  const available = value.languages.includes(option.value) && !voiceLocked;
                  const selected = value.voiceLanguage === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!available}
                      onClick={() => onChange({ ...value, voiceLanguage: option.value })}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 ${
                        !available
                          ? "cursor-not-allowed border-[#e5e5e5] bg-[#f4f4f5] opacity-60"
                          : selected
                          ? "border-[#8b5cf6] bg-[#f3eeff]"
                          : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"
                      }`}
                    >
                      <span className="text-sm font-semibold text-[#27272a]">{option.label}</span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${selected ? "bg-[#8b5cf6] text-[#ffffff]" : "bg-[#f4f4f5] text-transparent"}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">
                Solo puedes elegir un idioma que esté activo en &quot;Idiomas de atención&quot;.
              </p>
            </div>
          </div>
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
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 ${selected ? "border-[#8b5cf6] bg-[#f3eeff]" : "border-[#e5e5e5] bg-white hover:border-[#ddd6fe]"}`}
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

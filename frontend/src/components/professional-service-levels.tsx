"use client";

import type { BookingService, ProfessionalServiceLevel } from "@/lib/types";

/** Lo mínimo que necesita el control de cada servicio: id y nombre. */
export type ServiceLevelService = Pick<BookingService, "id" | "name">;

/**
 * Mapa servicio → nivel tal y como lo maneja el panel. Solo guarda niveles
 * explícitos: un servicio ausente es `normal` («Lo hace»). Coincide con lo
 * que devuelve y espera la API (`serviceLevels`).
 */
export type ServiceLevelMap = Record<string, ProfessionalServiceLevel>;

/**
 * Las tres opciones, en orden de prioridad para la recepcionista. `detail`
 * es la explicación que ve el negocio; ningún nivel se expresa en negativo
 * hacia el profesional.
 */
export const SERVICE_LEVEL_OPTIONS: ReadonlyArray<{
  value: ProfessionalServiceLevel;
  label: string;
  detail: string;
}> = [
  {
    value: "especialista",
    label: "Especialista",
    detail: "Se le asigna primero cuando el cliente no pide a nadie.",
  },
  {
    value: "normal",
    label: "Lo hace",
    detail: "Se le asigna cuando no hay especialista libre; si lo piden por su nombre, se reserva sin más.",
  },
  {
    value: "no_sugerir",
    label: "No sugerir",
    detail:
      "Solo si el cliente lo pide por su nombre; la recepcionista propone antes al más indicado.",
  },
];

/** Aviso que acompaña siempre a las tres opciones: «No sugerir» es interno. */
export const SERVICE_LEVEL_INTERNAL_NOTE =
  "«No sugerir» es una nota interna del panel: la recepcionista nunca se lo dice al cliente.";

const DEFAULT_LEVEL: ProfessionalServiceLevel = "normal";

export function resolveServiceLevel(
  value: ServiceLevelMap,
  serviceId: string
): ProfessionalServiceLevel {
  return value[serviceId] ?? DEFAULT_LEVEL;
}

/**
 * Devuelve un mapa nuevo con el nivel cambiado. `normal` se guarda como
 * ausencia (se borra la clave) para que el mapa emitido sea idéntico al que
 * devuelve la API y no arrastre entradas redundantes.
 */
export function setServiceLevel(
  value: ServiceLevelMap,
  serviceId: string,
  level: ProfessionalServiceLevel
): ServiceLevelMap {
  const next: ServiceLevelMap = {};
  for (const [id, current] of Object.entries(value)) {
    if (id !== serviceId && current !== DEFAULT_LEVEL) {
      next[id] = current;
    }
  }
  if (level !== DEFAULT_LEVEL) {
    next[serviceId] = level;
  }
  return next;
}

/** «Corte», «Corte y Color», «Corte, Color y Mechas», «Corte, Color y 3 más». */
function joinServiceNames(names: string[], max = 3): string {
  if (names.length <= max) {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  }
  const shown = names.slice(0, max - 1);
  return `${shown.join(", ")} y ${names.length - shown.length} más`;
}

/**
 * Resumen corto para la tarjeta cerrada de un profesional. Solo cuenta los
 * servicios que existen (`services`), así un id huérfano no distorsiona la
 * cifra. Devuelve `null` si el negocio aún no tiene servicios: entonces no
 * hay nada que resumir.
 */
export function describeServiceLevels(
  value: ServiceLevelMap,
  services: ServiceLevelService[]
): string | null {
  if (services.length === 0) return null;
  const specialistNames = services
    .filter((service) => value[service.id] === "especialista")
    .map((service) => service.name);
  const notSuggested = services.filter(
    (service) => value[service.id] === "no_sugerir"
  ).length;

  const parts: string[] = [];
  if (specialistNames.length > 0) {
    parts.push(`Especialista en ${joinServiceNames(specialistNames)}`);
  }
  if (notSuggested > 0) {
    parts.push(`${notSuggested} sin sugerir`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Lo hace todo";
}

/**
 * Una fila por servicio con un control segmentado de tres niveles. Radios
 * nativos (`peer sr-only`) para que el teclado funcione como en cualquier
 * grupo de radios: Tab entra al grupo y las flechas cambian el nivel.
 *
 * `value` solo lleva niveles explícitos; para cada servicio, ausente =
 * `normal`. `onChange` recibe el mapa completo ya normalizado (sin claves
 * `normal`), listo para mandarlo tal cual en `serviceLevels`.
 */
export function ProfessionalServiceLevels({
  services,
  value,
  onChange,
  idPrefix,
}: {
  services: ServiceLevelService[];
  value: ServiceLevelMap;
  onChange: (next: ServiceLevelMap) => void;
  idPrefix: string;
}) {
  if (services.length === 0) {
    return (
      <p className="text-sm text-muted">
        Todavía no hay servicios. Añádelos en la sección «Servicios» y
        aparecerán aquí para asignarlos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-[#e5e5e5] rounded-xl border border-[#e5e5e5] bg-white">
        {services.map((service) => {
          const current = resolveServiceLevel(value, service.id);
          const groupName = `${idPrefix}-nivel-${service.id}`;
          return (
            <div
              key={service.id}
              className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-3"
            >
              <span className="min-w-0 truncate text-sm font-medium text-[#27272a]">
                {service.name}
              </span>
              <div
                role="radiogroup"
                aria-label={`Nivel de ${service.name}`}
                className="flex w-full shrink-0 gap-1 rounded-full border border-[#e5e5e5] bg-[#fafafa] p-1 sm:w-auto"
              >
                {SERVICE_LEVEL_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex-auto cursor-pointer sm:flex-none"
                  >
                    <input
                      type="radio"
                      name={groupName}
                      value={option.value}
                      className="peer sr-only"
                      checked={current === option.value}
                      onChange={() =>
                        onChange(setServiceLevel(value, service.id, option.value))
                      }
                    />
                    {/* Por debajo de `sm` las tres etiquetas tienen que caber
                        en una sola línea en 360 px: texto de 12 px y relleno
                        corto. A partir de `sm` recupera el tamaño del
                        segmentado de agenda. */}
                    <span className="flex min-h-11 items-center justify-center rounded-full px-1.5 text-center text-xs font-semibold leading-tight text-muted transition duration-200 hover:text-[#0a0a0a] peer-checked:bg-[#f3eeff] peer-checked:text-[#6d28d9] peer-focus-visible:ring-2 peer-focus-visible:ring-[#8b5cf6] sm:px-3 sm:text-sm sm:leading-normal">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted">
        {SERVICE_LEVEL_OPTIONS.map((option) => (
          <span key={option.value}>
            <strong className="font-semibold text-[#27272a]">
              {option.label}
            </strong>
            : {option.detail}{" "}
          </span>
        ))}
        {SERVICE_LEVEL_INTERNAL_NOTE}
      </p>
    </div>
  );
}

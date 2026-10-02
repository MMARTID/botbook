"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Bot, CalendarClock, CalendarDays, Layers, ScissorsLineDashed, UserRoundCheck } from "lucide-react";
import { getBookingSettings } from "@/lib/api";
import { ajustePorSeccion } from "@/lib/agent-configuration";
import { getCalendarState } from "@/lib/calendar-state";
import { resumenDeHorario } from "@/lib/horario";
import type { AgentSettings, Business } from "@/lib/types";
import { DEFAULT_AGENT_SETTINGS } from "@/components/agent-settings-editor";
import { isBusinessSchedule } from "@/components/business-hours-editor";
import { SectionErrorState } from "@/components/section-card";
import { CabeceraMovil } from "@/components/movil/cabecera-movil";
import { FilaDeAjuste, GrupoDeFilas, RotuloDeGrupo } from "@/components/movil/piezas";

const TONOS: Record<AgentSettings["tone"], string> = { warm: "Cercano", professional: "Profesional", direct: "Ágil" };
const OBJETIVOS: Record<AgentSettings["primaryGoal"], string> = {
  bookings: "Conseguir reservas",
  customer_service: "Atender consultas",
  lead_capture: "Captar oportunidades",
};
const IDIOMAS: Record<string, string> = {
  "es-ES": "Español",
  "en-GB": "Inglés",
  "fr-FR": "Francés",
  "ca-ES": "Catalán",
  "eu-ES": "Euskera",
  "gl-ES": "Gallego",
};

export function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Índice del Agente en el móvil: siete ajustes, cada uno con su estado en
 * una línea (lo que falta, en ámbar) y su propia pantalla. Sustituye a los
 * doce bloques plegables de escritorio, donde abrir uno empujaba a los demás.
 */
export function AgenteMovil({ business }: { business: Business }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const ajustes = useQuery({ queryKey: ["booking-settings"], queryFn: getBookingSettings });

  // Los enlaces de siempre (`/agente?section=services`) abren la pantalla
  // de ese ajuste.
  const pedido = ajustePorSeccion(parametros.get("section"));
  useEffect(() => {
    if (pedido) router.replace(`/agente/${pedido}`);
  }, [pedido, router]);

  const calendario = getCalendarState(business);
  const comportamiento = { ...DEFAULT_AGENT_SETTINGS, ...business.agentSettings };
  const servicios = ajustes.data?.services.length ?? 0;
  const profesionales = ajustes.data?.professionals.length ?? 0;
  const capacidad = ajustes.data?.bookingCapacity ?? business.bookingCapacity ?? 1;
  const cargando = ajustes.isLoading;

  return (
    <div>
      <CabeceraMovil titulo="Tu agente" subtitulo="Configura cómo atiende, qué puede reservar y qué información usa." />
      {ajustes.isError ? (
        <SectionErrorState
          message="No se pudo cargar la configuración de tu agente."
          onRetry={() => void ajustes.refetch()}
        />
      ) : null}

      <RotuloDeGrupo className="mt-[18px]">Disponibilidad</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href="/agente/horario"
          icono={CalendarClock}
          titulo="Horario del negocio"
          resumen={isBusinessSchedule(business.schedule) ? resumenDeHorario(business.schedule) : "Sin configurar"}
          pendiente={!isBusinessSchedule(business.schedule)}
        />
        <FilaDeAjuste
          href="/agente/capacidad"
          icono={Layers}
          titulo="Capacidad de reservas"
          resumen={plural(capacidad, "plaza simultánea", "plazas simultáneas")}
        />
      </GrupoDeFilas>

      <RotuloDeGrupo className="mt-[18px]">Catálogo y equipo</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href="/agente/servicios"
          icono={ScissorsLineDashed}
          titulo="Servicios"
          resumen={cargando ? "…" : servicios ? plural(servicios, "servicio", "servicios") : "Sin servicios configurados"}
          pendiente={!cargando && servicios === 0}
        />
        <FilaDeAjuste
          href="/agente/profesionales"
          icono={UserRoundCheck}
          titulo="Profesionales"
          resumen={
            cargando ? "…" : profesionales ? plural(profesionales, "profesional", "profesionales") : "Sin profesionales configurados"
          }
          pendiente={!cargando && profesionales === 0}
        />
      </GrupoDeFilas>

      <RotuloDeGrupo className="mt-[18px]">Agenda y conocimiento</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href="/agente/calendario"
          icono={CalendarDays}
          titulo="Calendario"
          resumen={
            calendario.connected
              ? `${calendario.label}${calendario.accountEmail ? ` · ${calendario.accountEmail}` : ""}`
              : calendario.expired
                ? "Conexión caducada"
                : "Sin conectar"
          }
          pendiente={!calendario.connected}
        />
        <FilaDeAjuste
          href="/agente/informacion"
          icono={BookOpenText}
          titulo="Información para responder"
          resumen={business.businessDetails?.trim() ? "Información añadida" : "Sin información adicional"}
        />
      </GrupoDeFilas>

      <RotuloDeGrupo className="mt-[18px]">Cómo atiende</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href="/agente/comportamiento"
          icono={Bot}
          titulo="Cómo atiende"
          resumen={[
            comportamiento.languages.map((idioma) => IDIOMAS[idioma]).filter(Boolean).join(", "),
            TONOS[comportamiento.tone],
            OBJETIVOS[comportamiento.primaryGoal],
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </GrupoDeFilas>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText, Bot, CalendarClock, CalendarDays, Layers, ScissorsLineDashed, UserRoundCheck } from "lucide-react";
import { getBookingSettings, getCatalogoDeIdiomas } from "@/lib/api";
import { ajustePorSeccion } from "@/lib/agent-configuration";
import { getCalendarState } from "@/lib/calendar-state";
import { resumenDeHorario } from "@/lib/horario";
import type { Business } from "@/lib/types";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-settings";
import { isBusinessSchedule } from "@/components/business-hours-editor";
import { SectionErrorState } from "@/components/section-card";
import { CabeceraMovil } from "@/components/movil/cabecera-movil";
import { FilaDeAjuste, GrupoDeFilas, RotuloDeGrupo } from "@/components/movil/piezas";

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
  // Etiquetas de los idiomas del catálogo del backend (las mismas que la
  // pantalla de Cómo atiende): el panel no guarda su propia lista.
  const idiomas = useQuery({ queryKey: ["idiomas-catalogo"], queryFn: getCatalogoDeIdiomas, staleTime: Infinity });

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
  // «Español · habla 7 idiomas · Blanca»: el principal, cuántos idiomas
  // habla con él (los del catálogo; sin él, los `languages` del negocio,
  // que pueden ser de antes si la caché viene de una respuesta sin
  // normalizar) y la voz que atiende, la elegida o, sin ella, la primera de
  // su género, que es la de por defecto.
  const principal = idiomas.data?.principales.find((opcion) => opcion.codigo === comportamiento.voiceLanguage);
  const cuantosHabla = principal?.idiomas?.length ?? comportamiento.languages.length;
  const vozDelResumen =
    principal?.voces.find((voz) => voz.id === comportamiento.voz) ??
    principal?.voces.find((voz) => voz.genero === comportamiento.voiceGender);
  const resumenDeIdiomaYVoz = [
    idiomas.data?.etiquetas[comportamiento.voiceLanguage] ?? comportamiento.voiceLanguage,
    `habla ${plural(cuantosHabla, "idioma", "idiomas")}`,
    vozDelResumen?.nombre,
  ]
    .filter(Boolean)
    .join(" · ");

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
          resumen={resumenDeIdiomaYVoz}
        />
      </GrupoDeFilas>
    </div>
  );
}

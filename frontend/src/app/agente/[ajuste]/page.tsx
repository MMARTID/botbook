"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { esAjusteDelAgente, type AjusteDelAgente } from "@/lib/agent-configuration";
import type { Business } from "@/lib/types";
import { useEsMovil } from "@/hooks/use-es-movil";
import { useBusiness } from "@/components/providers";
import { AppPageSkeleton } from "@/components/app-page-header";
import { SectionErrorState } from "@/components/section-card";
import { CalendarioMovil } from "@/components/movil/agente/calendario-movil";
import { CapacidadMovil } from "@/components/movil/agente/capacidad-movil";
import { ComportamientoMovil } from "@/components/movil/agente/comportamiento-movil";
import { HorarioMovil } from "@/components/movil/agente/horario-movil";
import { InformacionMovil } from "@/components/movil/agente/informacion-movil";
import { ProfesionalesMovil } from "@/components/movil/agente/profesionales-movil";
import { ServiciosMovil } from "@/components/movil/agente/servicios-movil";

const PANTALLAS: Record<AjusteDelAgente, (props: { business: Business }) => React.ReactNode> = {
  horario: HorarioMovil,
  capacidad: CapacidadMovil,
  servicios: ServiciosMovil,
  profesionales: ProfesionalesMovil,
  calendario: CalendarioMovil,
  informacion: InformacionMovil,
  comportamiento: ComportamientoMovil,
};

/**
 * Un ajuste del agente en su propia pantalla (app móvil). En escritorio no
 * hay pantallas sueltas: se vuelve a `/agente` con ese ajuste abierto.
 */
export default function AjusteDelAgentePage({ params }: { params: { ajuste: string } }) {
  const router = useRouter();
  const esMovil = useEsMovil();
  const { business, hasToken, isLoadingBusiness, isError } = useBusiness();
  const ajuste = esAjusteDelAgente(params.ajuste) ? params.ajuste : null;

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
    else if (!ajuste) router.replace("/agente");
    else if (esMovil === false) router.replace(`/agente?ajuste=${ajuste}`);
  }, [ajuste, esMovil, hasToken, router]);

  if (!ajuste || esMovil !== true || isLoadingBusiness) return <AppPageSkeleton label="Cargando el ajuste…" />;
  if (!business) {
    return isError ? (
      <SectionErrorState
        message="No se pudo cargar la configuración de tu negocio. Comprueba tu conexión y vuelve a intentarlo."
        onRetry={() => window.location.reload()}
      />
    ) : null;
  }

  const Pantalla = PANTALLAS[ajuste];
  return <Pantalla business={business} />;
}

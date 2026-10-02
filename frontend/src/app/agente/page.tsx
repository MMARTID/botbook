"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/components/providers";
import { AppPageSkeleton } from "@/components/app-page-header";
import { AgenteMovil } from "@/components/movil/agente-movil";
import { AgenteEscritorio } from "@/components/escritorio/agente/agente-escritorio";
import { useEsMovil } from "@/hooks/use-es-movil";

// Pantalla de borde a borde en escritorio: <main> no le pone margen.
const ESQUELETO_ANCHO = "lg:px-8 lg:py-6";

/** Estado de error a página completa, si no se pudo cargar el negocio. */
function FullPageError({
  title,
  message,
  detail,
  onRetry,
}: {
  title: string;
  message: string;
  /** Texto técnico del fallo: solo se enseña en desarrollo. */
  detail?: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center lg:mt-10">
      <h1 className="text-2xl font-semibold text-tinta">{title}</h1>
      <p className="text-sm leading-6 text-muted">{message}</p>
      {/* El detalle técnico solo tiene sentido para quien puede hacer algo
          con él: en producción no se enseña. */}
      {process.env.NODE_ENV === "development" && detail ? (
        <p className="font-mono text-xs leading-5 text-muted">{detail}</p>
      ) : null}
      <button type="button" onClick={onRetry} className="btn-primary mx-auto">
        Reintentar
      </button>
    </div>
  );
}

/**
 * Tu agente. En el móvil, el índice de siete ajustes, cada uno con su
 * pantalla (`/agente/[ajuste]`); en escritorio, índice, ajuste abierto y
 * estado de la recepción en la misma pantalla.
 */
export default function AgentePage() {
  const router = useRouter();
  const esMovil = useEsMovil();
  const { business, hasToken, isLoadingBusiness, isError, errorMessage } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness || esMovil === null) return <AppPageSkeleton label="Cargando el agente…" className={ESQUELETO_ANCHO} />;
  // El `&& !business` evita que un refresco fallido al volver a la pestaña se
  // lleve por delante la pantalla: React Query marca error pero conserva los
  // datos en caché, y esta pantalla solo debe aparecer si no hay nada que pintar.
  if (isError && !business) {
    return (
      <FullPageError
        title="No se pudo cargar la configuración de tu negocio"
        message="Puede haber sido un corte momentáneo de conexión. Vuelve a intentarlo; si sigue sin cargar, escríbenos y lo miramos."
        detail={errorMessage}
        onRetry={() => window.location.reload()}
      />
    );
  }
  if (!business) return null;

  return (
    <Suspense fallback={<AppPageSkeleton label="Cargando el agente…" className={esMovil ? "" : ESQUELETO_ANCHO} />}>
      {esMovil ? <AgenteMovil business={business} /> : <AgenteEscritorio business={business} />}
    </Suspense>
  );
}

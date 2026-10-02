"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBusiness } from "@/components/providers";
import { AppPageSkeleton } from "@/components/app-page-header";
import { InicioMovil } from "@/components/movil/inicio-movil";
import { PanelEscritorio } from "@/components/escritorio/panel-escritorio";
import { useEsMovil } from "@/hooks/use-es-movil";

// Pantalla de borde a borde en escritorio: <main> no le pone margen.
const ESQUELETO_ANCHO = "lg:px-8 lg:py-6";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business, isLoadingBusiness, hasToken, isError: isBusinessError, errorMessage } = useBusiness();
  const esMovil = useEsMovil();

  const [calendarStatus, setCalendarStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (hasToken === false) {
      router.replace("/login");
      return;
    }

    if (searchParams.get("calendar_error")) {
      setCalendarStatus({ type: "error", message: "Hubo un error al conectar Google Calendar." });
      router.replace("/");
    }

    if (searchParams.get("calendar_success")) {
      setCalendarStatus({ type: "success", message: "Google Calendar está conectado correctamente." });
      router.replace("/");
    }

    if (searchParams.get("outlook_error")) {
      setCalendarStatus({ type: "error", message: "Hubo un error al conectar Outlook Calendar." });
      router.replace("/");
    }

    if (searchParams.get("outlook_success")) {
      setCalendarStatus({ type: "success", message: "Outlook Calendar está conectado correctamente." });
      router.replace("/");
    }
  }, [hasToken, router, searchParams]);

  if (isLoadingBusiness || esMovil === null) {
    return <AppPageSkeleton label="Cargando tu panel…" className={ESQUELETO_ANCHO} />;
  }

  // El `&& !business` evita tirar abajo el panel ya pintado cuando lo que falla
  // es el refresco al volver a la pestaña: React Query marca error pero mantiene
  // los datos en caché, y sin esta condición un microcorte de red se llevaba por
  // delante la pantalla entera.
  if (isBusinessError && !business) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center lg:mt-10">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">No se pudo cargar tu panel</h1>
        <p className="text-sm leading-6 text-muted">
          Puede haber sido un corte momentáneo de conexión. Vuelve a intentarlo; si sigue sin cargar,
          escríbenos y lo miramos.
        </p>
        {/* El detalle técnico solo tiene sentido para quien puede hacer algo
            con él: en producción no se enseña. */}
        {process.env.NODE_ENV === "development" && errorMessage ? (
          <p className="font-mono text-xs leading-5 text-muted">{errorMessage}</p>
        ) : null}
        <button type="button" onClick={() => window.location.reload()} className="btn-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (!business) {
    return null; // Will redirect to login via useEffect
  }

  if (esMovil) {
    return <InicioMovil business={business} avisoDeCalendario={calendarStatus} />;
  }

  return <PanelEscritorio business={business} avisoDeCalendario={calendarStatus} />;
}

export function PanelInicio() {
  return (
    <Suspense fallback={<AppPageSkeleton label="Cargando tu panel…" className={ESQUELETO_ANCHO} />}>
      <DashboardContent />
    </Suspense>
  );
}

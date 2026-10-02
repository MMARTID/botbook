"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/components/providers";
import { AppPageSkeleton } from "@/components/app-page-header";
import { AgendaMovil } from "@/components/movil/agenda-movil";
import { AgendaEscritorio } from "@/components/escritorio/agenda/agenda-escritorio";
import { useEsMovil } from "@/hooks/use-es-movil";

// Pantalla de borde a borde en escritorio: <main> no le pone margen.
const ESQUELETO_ANCHO = "lg:px-8 lg:py-6";

export default function AgendaPage() {
  const router = useRouter();
  const { business, hasToken, isLoadingBusiness, isError: isBusinessError, errorMessage } = useBusiness();
  const esMovil = useEsMovil();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness || esMovil === null) return <AppPageSkeleton label="Cargando agenda…" className={ESQUELETO_ANCHO} />;

  // Carga y error son cosas distintas: si /business/me falla, `isLoading` pasa
  // a false y `business` se queda vacío, así que sin esta rama el negocio se
  // quedaba mirando "Cargando agenda…" para siempre.
  //
  // El `&& !business` no sobra: esta query se refresca al volver a la pestaña y
  // React Query conserva los datos en caché cuando ese refresco falla (marca
  // error sin soltar `data`). Sin esa condición, un microcorte de red borraba
  // la agenda que el usuario estaba mirando y la cambiaba por esta pantalla.
  if (isBusinessError && !business) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center lg:mt-10">
        <h1 className="text-2xl font-semibold text-tinta">No se pudo cargar tu agenda</h1>
        <p className="text-sm leading-6 text-muted">
          Puede haber sido un corte momentáneo de conexión. Vuelve a intentarlo; si sigue sin cargar,
          escríbenos y lo miramos.
        </p>
        {process.env.NODE_ENV === "development" && errorMessage ? (
          <p className="font-mono text-xs leading-5 text-muted">{errorMessage}</p>
        ) : null}
        <button type="button" onClick={() => window.location.reload()} className="btn-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (!business) return null; // Sin sesión: el efecto de arriba redirige a /login.

  return (
    <Suspense fallback={<AppPageSkeleton label="Cargando agenda…" className={ESQUELETO_ANCHO} />}>
      {esMovil ? <AgendaMovil business={business} /> : <AgendaEscritorio business={business} />}
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { hasAuthToken } from "@/lib/billing-navigation";
import { destinoDeEleccion } from "@/lib/eleccion-de-plan";

/**
 * Llegada desde «Elegir plan» en alhabla.ai/planes. La web no puede saber si
 * hay sesión (el token vive en el localStorage de este origen), así que se
 * decide aquí: checkout con sesión, registro de la web sin ella. Si el token
 * guardado ya no vale, /checkout responde al 401 mandando al login con
 * `next`, y de ahí se vuelve al checkout.
 */
function ElegirPlanContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    window.location.replace(destinoDeEleccion(searchParams, hasAuthToken()));
  }, [searchParams]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 text-sm text-muted"
      role="status"
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#8b5cf6]" aria-hidden="true" />
      Preparando tu plan…
    </div>
  );
}

export default function ElegirPlanPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center px-4 text-sm text-muted"
          role="status"
        >
          Preparando tu plan…
        </div>
      }
    >
      <ElegirPlanContent />
    </Suspense>
  );
}

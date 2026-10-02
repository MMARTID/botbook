"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/components/providers";
import { AppPageSkeleton } from "@/components/app-page-header";
import { LlamadasMovil } from "@/components/movil/llamadas-movil";
import { LlamadasEscritorio } from "@/components/escritorio/llamadas/llamadas-escritorio";
import { useEsMovil } from "@/hooks/use-es-movil";

// Pantalla de borde a borde en escritorio: <main> no le pone margen.
const ESQUELETO_ANCHO = "lg:px-8 lg:py-6";

export default function CallsPage() {
  const router = useRouter();
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const esMovil = useEsMovil();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness || esMovil === null) return <AppPageSkeleton label="Cargando llamadas…" className={ESQUELETO_ANCHO} />;
  if (esMovil) return <LlamadasMovil />;
  if (!business) return null;

  return (
    <Suspense fallback={<AppPageSkeleton label="Cargando llamadas…" className={ESQUELETO_ANCHO} />}>
      <LlamadasEscritorio business={business} />
    </Suspense>
  );
}

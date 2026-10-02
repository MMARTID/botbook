"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppPageSkeleton } from "@/components/app-page-header";
import { GestorChat } from "@/components/gestor-chat";
import { GestorEscritorio } from "@/components/escritorio/gestor/gestor-escritorio";
import { useBusiness } from "@/components/providers";
import { useEsMovil } from "@/hooks/use-es-movil";

// Pantalla de borde a borde en escritorio: <main> no le pone margen.
const ESQUELETO_ANCHO = "lg:px-8 lg:py-6";

// En el móvil la cabecera («Tu gestor», Beta y si comparte conversación con
// el WhatsApp) va dentro del propio chat, que ocupa la pantalla entera. En
// escritorio la pone la franja de título y el contexto va a la derecha.
export default function GestorPage() {
  const router = useRouter();
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const esMovil = useEsMovil();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness || esMovil === null) return <AppPageSkeleton label="Cargando tu gestor…" className={ESQUELETO_ANCHO} />;
  if (esMovil || !business) return <GestorChat hasToken={hasToken} />;
  return <GestorEscritorio business={business} hasToken={hasToken} />;
}

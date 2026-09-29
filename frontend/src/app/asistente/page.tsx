"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppPageSkeleton } from "@/components/app-page-header";
import { GestorChat } from "@/components/gestor-chat";
import { useBusiness } from "@/components/providers";

// La cabecera («Tu gestor», Beta y si comparte conversación con el WhatsApp)
// va dentro del propio chat: el chat ocupa la pantalla entera.
export default function GestorPage() {
  const router = useRouter();
  const { hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness) return <AppPageSkeleton label="Cargando tu gestor…" />;

  return <GestorChat hasToken={hasToken} />;
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { AppPageHeader, AppPageSkeleton } from "@/components/app-page-header";
import { GestorChat } from "@/components/gestor-chat";
import { useBusiness } from "@/components/providers";

export default function AsistentePage() {
  const router = useRouter();
  const { hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness) return <AppPageSkeleton label="Cargando tu asistente…" />;

  return (
    <div className="space-y-6">
      <AppPageHeader
        icon={MessageSquareText}
        title="Tu asistente"
        description="Pregúntale por la agenda y pídele cambios: servicios, equipo, horario, citas. Es el mismo asistente que te atiende por WhatsApp y comparte la conversación."
      >
        <span className="badge-soft">Beta</span>
      </AppPageHeader>
      <GestorChat hasToken={hasToken} />
    </div>
  );
}

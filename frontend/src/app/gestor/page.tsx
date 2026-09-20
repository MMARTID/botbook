"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { AppPageHeader } from "@/components/app-page-header";
import { GestorChat } from "@/components/gestor-chat";
import { useBusiness } from "@/components/providers";

export default function GestorPage() {
  const router = useRouter();
  const { hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness)
    return <div className="p-8 text-center text-muted">Cargando…</div>;

  return (
    <div className="space-y-6">
      <AppPageHeader
        icon={MessageSquareText}
        title="Tu Gestor"
        description="Pregúntale por la agenda y pídele cambios: servicios, equipo, horario, citas. Es el mismo Gestor que te atiende por WhatsApp y comparte la conversación."
      >
        <span className="badge-soft">Beta</span>
      </AppPageHeader>
      <GestorChat hasToken={hasToken} />
    </div>
  );
}

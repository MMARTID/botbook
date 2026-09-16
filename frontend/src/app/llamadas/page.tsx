"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, PhoneCall } from "lucide-react";
import { CallsActivity } from "@/components/calls-activity";
import { useBusiness } from "@/components/providers";
import { AppPageHeader } from "@/components/app-page-header";

export default function CallsPage() {
  const router = useRouter();
  const { hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness) return <div className="p-8 text-center text-muted">Cargando llamadas…</div>;

  return (
    <div className="space-y-6">
      <AppPageHeader icon={PhoneCall} title="Llamadas" description="Todas las conversaciones atendidas por tu recepcionista, con sus resultados y reservas.">
        <Link href="/llamadas/analitica" className="btn-secondary px-4">
          <BarChart3 className="h-4 w-4" aria-hidden="true" /> Analítica avanzada
        </Link>
      </AppPageHeader>
      <CallsActivity />
    </div>
  );
}

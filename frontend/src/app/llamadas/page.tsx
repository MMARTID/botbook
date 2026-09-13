"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall } from "lucide-react";
import { CallsActivity } from "@/components/calls-activity";
import { useBusiness } from "@/components/providers";

export default function CallsPage() {
  const router = useRouter();
  const { hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  if (isLoadingBusiness) return <div className="p-8 text-center text-muted">Cargando llamadas…</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3 border-b border-[#e5e5e5] pb-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><PhoneCall className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-[#0a0a0a] sm:text-4xl">Llamadas</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Todas las conversaciones atendidas por tu recepcionista, con sus resultados y reservas.</p>
        </div>
      </header>
      <CallsActivity />
    </div>
  );
}

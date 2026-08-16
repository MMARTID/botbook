"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { getBillingSummary, reconcileCheckoutSession } from "@/lib/api";

export default function CheckoutResultPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id ?? null;
  const [hasPlaceSchedule, setHasPlaceSchedule] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const imported = window.localStorage.getItem("asistai_place_schedule_imported") === "true";
    setHasPlaceSchedule(imported);
    if (imported) {
      window.localStorage.removeItem("asistai_place_schedule_imported");
    }
  }, []);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => sessionId ? reconcileCheckoutSession(sessionId) : getBillingSummary(),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "ACTIVE" || status === "TRIALING" ? false : 2500;
    },
  });

  const confirmed = data?.status === "ACTIVE" || data?.status === "TRIALING";
  const ctaParams = new URLSearchParams();
  if (confirmed) {
    ctaParams.set("from", "checkout");
    if (hasPlaceSchedule) {
      ctaParams.set("hasPlaceSchedule", "true");
    }
  }
  const ctaHref = confirmed ? `/ajustes?${ctaParams.toString()}` : "/ajustes/facturacion";
  const ctaLabel = confirmed ? "Configurar mi negocio" : "Ver facturación";

  return (
    <section className="mx-auto max-w-2xl py-16 text-center">
      <div className="panel p-8 sm:p-12">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${confirmed ? "bg-[#eef6dc] text-[#2c7334]" : "bg-[#f3f1e8] text-[#8a6d22]"}`}>
          {confirmed ? <CheckCircle2 className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[#1e2b22]">
          {confirmed ? "Suscripción confirmada" : "Estamos confirmando tu suscripción"}
        </h1>
        <p className="mt-4 leading-7 text-[#687267]">
          {confirmed
            ? "Tu trial y los permisos del plan ya están sincronizados."
            : "Stripe ha recibido el proceso. Esperamos el webhook seguro antes de activar el plan."}
        </p>
        {isLoading ? <p className="mt-4 text-sm text-[#687267]">Consultando estado…</p> : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {confirmed ? null : (
            <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          )}
          <Link href={ctaHref} className="btn-primary">
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import { getBillingSummary, reconcileCheckoutSession } from "@/lib/api";

export default function CheckoutResultPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id ?? null;
  const [hasPlaceSchedule, setHasPlaceSchedule] = useState(false);
  // Si la confirmación tarda demasiado, la copia pasa a un segundo nivel con
  // contacto de soporte — sin esto, un usuario real puede quedarse mirando
  // "estamos confirmando" con sondeos cada 2,5s indefinidamente, sin ninguna
  // señal de que algo podría ir mal.
  const [isTakingLong, setIsTakingLong] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsTakingLong(true), 60_000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const imported = window.localStorage.getItem("alhabla_place_schedule_imported") === "true";
    setHasPlaceSchedule(imported);
    if (imported) {
      window.localStorage.removeItem("alhabla_place_schedule_imported");
    }
  }, []);

  const queryClient = useQueryClient();

  // Clave propia: ["billing-summary"] la monta AppShell con un GET, y esta
  // consulta hace un POST de reconciliación. Con la misma clave eran dos
  // observadores con funciones distintas pisándose la caché mutuamente.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["checkout-reconcile", sessionId],
    queryFn: () => sessionId ? reconcileCheckoutSession(sessionId) : getBillingSummary(),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "ACTIVE" || status === "TRIALING" ? false : 2500;
    },
  });

  const confirmed = data?.status === "ACTIVE" || data?.status === "TRIALING";

  useEffect(() => {
    if (!confirmed) return;
    // El resumen que enseña el resto de la app (aviso de minutos del menú)
    // se queda obsoleto en cuanto Stripe confirma el plan.
    void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
  }, [confirmed, queryClient]);

  // Si la reconciliación falla no hay nada que sondear: sin esta rama el
  // usuario veía "Estamos confirmando tu suscripción" y un sondeo inútil.
  const sinRespuesta = isError && !data;

  const ctaParams = new URLSearchParams();
  if (confirmed) {
    ctaParams.set("from", "checkout");
    if (hasPlaceSchedule) {
      ctaParams.set("hasPlaceSchedule", "true");
    }
  }
  const ctaHref = confirmed ? `/agente?${ctaParams.toString()}` : "/ajustes/facturacion";
  const ctaLabel = confirmed ? "Configurar mi negocio" : "Ver facturación";

  return (
    <section className="mx-auto max-w-2xl py-16 text-center">
      <div className="panel p-8 sm:p-12">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${confirmed ? "bg-[#ecf7ec] text-[#2c7334]" : sinRespuesta ? "bg-[#fff1f1] text-[#c53030]" : "bg-[#fef8e7] text-[#9f7a15]"}`}>
          {confirmed ? <CheckCircle2 className="h-8 w-8" /> : sinRespuesta ? <CircleAlert className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[#0a0a0a]">
          {confirmed
            ? "Suscripción confirmada"
            : sinRespuesta
              ? "No hemos podido comprobar tu suscripción"
              : "Estamos confirmando tu suscripción"}
        </h1>
        <p className="mt-4 leading-7 text-muted">
          {confirmed
            ? "Tu trial y los permisos del plan ya están sincronizados."
            : sinRespuesta
              ? "Tu pago puede haberse completado igualmente: lo que ha fallado es la comprobación. Vuelve a intentarlo con el botón de abajo."
              : "Stripe está procesando el pago. En unos segundos activamos tu plan automáticamente."}
        </p>
        {!confirmed && isTakingLong ? (
          <p className="mt-3 text-sm leading-6 text-[#9f7a15]">
            Esto está tardando más de lo normal. Si no se confirma en unos minutos, escríbenos a{" "}
            <a href="mailto:hola@alhabla.ai" className="font-semibold underline underline-offset-2">
              hola@alhabla.ai
            </a>{" "}
            y te ayudamos.
          </p>
        ) : null}
        {isLoading ? <p className="mt-4 text-sm text-muted">Consultando estado…</p> : null}
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

"use client";

import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, ExternalLink, Gauge, Phone, ReceiptText } from "lucide-react";
import { createBillingPortalSession, getBillingSummary } from "@/lib/api";
import { plans } from "@/lib/plans";

const statusLabels: Record<string, string> = {
  INCOMPLETE: "Configuración incompleta",
  INCOMPLETE_EXPIRED: "Configuración expirada",
  TRIALING: "Periodo de prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  CANCELED: "Cancelada",
  UNPAID: "Impagada",
  PAUSED: "Pausada",
};

export default function BillingSettingsPage() {
  const summary = useQuery({ queryKey: ["billing-summary"], queryFn: getBillingSummary });
  const portal = useMutation({
    mutationFn: createBillingPortalSession,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const plan = plans.find((candidate) => candidate.id === summary.data?.planId);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#0a0a0a]">Plan y pagos</h1>
        <p className="mt-2 text-muted">Consulta tu suscripción y gestiona pagos y facturas de forma segura en Stripe.</p>
      </div>

      {summary.isLoading ? <div className="panel p-8 text-muted">Cargando facturación…</div> : null}
      {summary.isError ? <div className="panel p-8 text-[#c53030]">No se pudo consultar la facturación.</div> : null}

      {summary.data ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <article className="panel p-6 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted">Plan actual</p>
                <h2 className="mt-1 text-3xl font-semibold text-[#0a0a0a]">{plan?.name ?? "Sin suscripción"}</h2>
                <p className="mt-2 text-sm text-[#52525b]">
                  {summary.data.status ? statusLabels[summary.data.status] ?? summary.data.status : "Aún no configurada"}
                </p>
              </div>
              {plan ? <span className="badge-soft">{plan.price} €/mes</span> : null}
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-[#fafafa] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#27272a]"><Gauge className="h-4 w-4" /> Minutos incluidos</div>
                <p className="mt-2 text-2xl font-semibold text-[#0a0a0a]">{summary.data.includedMinutes ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-[#fafafa] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#27272a]"><Phone className="h-4 w-4" /> Minutos consumidos</div>
                <p className="mt-2 text-2xl font-semibold text-[#0a0a0a]">{summary.data.consumedMinutes}</p>
                {typeof summary.data.includedMinutes === "number" ? (
                  <p className={`mt-1 text-xs font-medium ${summary.data.consumedMinutes > summary.data.includedMinutes ? "text-[#c53030]" : "text-[#52525b]"}`}>
                    {summary.data.consumedMinutes > summary.data.includedMinutes
                      ? `Has superado el límite en ${summary.data.consumedMinutes - summary.data.includedMinutes} min`
                      : `Te quedan ${summary.data.includedMinutes - summary.data.consumedMinutes} min`}
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl bg-[#fafafa] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#27272a]"><CreditCard className="h-4 w-4" /> Próximo periodo</div>
                <p className="mt-2 text-lg font-semibold text-[#0a0a0a]">
                  {summary.data.currentPeriodEnd
                    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(summary.data.currentPeriodEnd))
                    : "—"}
                </p>
              </div>
            </div>

            {summary.data.trialEnd ? (
              <p className="mt-5 text-sm text-[#52525b]">
                Trial hasta {new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(summary.data.trialEnd))}.
              </p>
            ) : null}
          </article>

          <article className="panel flex flex-col p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <ReceiptText className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-[#0a0a0a]">Portal de cliente</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">Actualiza el método de pago, consulta facturas o cancela la suscripción.</p>
            {summary.data.customerConfigured ? (
              <button onClick={() => portal.mutate()} disabled={portal.isPending} className="btn-primary mt-6 justify-center">
                <ExternalLink className="h-4 w-4" />
                {portal.isPending ? "Abriendo…" : "Gestionar en Stripe"}
              </button>
            ) : (
              <Link href="/planes?from=billing" className="btn-primary mt-6 justify-center">Elegir plan</Link>
            )}
            {portal.isError ? <p className="mt-3 text-sm text-[#c53030]">No se pudo abrir el portal.</p> : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}

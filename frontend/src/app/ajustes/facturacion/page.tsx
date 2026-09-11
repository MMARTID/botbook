"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, ReceiptText, X } from "lucide-react";
import { createBillingPortalSession, getBillingSummary } from "@/lib/api";
import { useBusiness } from "@/components/providers";
import { formatPrice } from "@/lib/format";
import { plans } from "@/lib/plans";
import type { SubscriptionStatus } from "@/lib/types";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  INCOMPLETE: "Configuración incompleta",
  INCOMPLETE_EXPIRED: "Configuración expirada",
  TRIALING: "Periodo de prueba",
  ACTIVE: "Al día",
  PAST_DUE: "Pago pendiente",
  CANCELED: "Cancelada",
  UNPAID: "Impagada",
  PAUSED: "Pausada",
};

/** Un estado de cobro no es solo una etiqueta: dice si el negocio tiene un
 * problema que atender hoy. */
const STATUS_TONE: Record<SubscriptionStatus, "ok" | "warning" | "error"> = {
  INCOMPLETE: "warning",
  INCOMPLETE_EXPIRED: "error",
  TRIALING: "ok",
  ACTIVE: "ok",
  PAST_DUE: "error",
  CANCELED: "error",
  UNPAID: "error",
  PAUSED: "warning",
};

const TONE_CLASSES = {
  ok: "bg-[#ecf7ec] text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]",
  warning: "bg-[#fef8e7] text-[#9f7a15] ring-1 ring-inset ring-[#f0dfa8]",
  error: "bg-[#fff1f1] text-[#c53030] ring-1 ring-inset ring-[#f5d3d3]",
} as const;

function formatFecha(value: string) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(value));
}

export default function BillingSettingsPage() {
  const [showCancellationNotice, setShowCancellationNotice] = useState(false);
  const { business } = useBusiness();
  const summary = useQuery({ queryKey: ["billing-summary"], queryFn: getBillingSummary });
  const portal = useMutation({
    mutationFn: createBillingPortalSession,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const data = summary.data;
  const plan = plans.find((candidate) => candidate.id === data?.planId);
  const status = data?.status ?? null;
  const suspendido = Boolean(business?.callsSuspendedAt);

  const incluidos = data?.includedMinutes ?? plan?.minutes ?? null;
  const consumidos = data?.consumedMinutes ?? 0;
  const excedente = incluidos !== null ? Math.max(0, consumidos - incluidos) : 0;
  const porcentaje =
    incluidos !== null && incluidos > 0
      ? Math.min(100, Math.round((consumidos / incluidos) * 100))
      : 0;
  const costeExtra =
    data?.extraMinuteCents != null ? excedente * data.extraMinuteCents : null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0a0a0a] sm:text-3xl">
          Plan y pagos
        </h1>
        <p className="mt-2 text-muted">
          Tu suscripción, el consumo de minutos y tus facturas.
        </p>
      </div>

      {summary.isLoading ? <div className="panel p-8 text-muted">Cargando facturación…</div> : null}
      {summary.isError ? (
        <div className="panel border-[#f5d3d3] bg-[#fff1f1] p-6 text-sm text-[#c53030]">
          No se pudo consultar tu facturación. Vuelve a intentarlo en unos minutos; si sigue igual,
          escríbenos antes de que afecte al servicio.
        </div>
      ) : null}

      {/* Lo más grave primero: sin llamadas, el producto no existe. */}
      {suspendido ? (
        <div className="panel border-[#f5d3d3] bg-[#fff1f1] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#c53030]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
                Tu recepcionista no está atendiendo llamadas
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#c53030]">
                Hemos suspendido el servicio por un pago pendiente. En cuanto lo regularices en
                Stripe, vuelve a atender sola: no hay que reconfigurar nada.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <article className="panel p-4 sm:p-6 lg:col-span-2">
            {plan ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">Tu plan</p>
                    <h2 className="mt-1 text-2xl font-semibold text-[#0a0a0a] sm:text-3xl">
                      {plan.name}
                      <span className="ml-2 text-base font-medium text-muted">{plan.price} €/mes</span>
                    </h2>
                  </div>
                  {status ? (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASSES[STATUS_TONE[status]]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  ) : null}
                </div>

                {data.trialEnd && status === "TRIALING" ? (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Tu prueba gratuita termina el {formatFecha(data.trialEnd)}; a partir de ahí se
                    cobra el plan.
                  </p>
                ) : null}

                {data.cancelAtPeriodEnd && data.currentPeriodEnd ? (
                  <p className="mt-3 rounded-xl bg-[#fef8e7] px-4 py-3 text-sm leading-6 text-[#9f7a15]">
                    Tu plan termina el {formatFecha(data.currentPeriodEnd)}. Acuérdate de quitar el
                    desvío de tu teléfono antes de esa fecha para que tus clientes no se queden sin
                    respuesta.
                  </p>
                ) : data.currentPeriodEnd ? (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Se renueva el {formatFecha(data.currentPeriodEnd)}.
                  </p>
                ) : null}

                <div className="mt-6 border-t border-[#e5e5e5] pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0a0a0a]">Minutos de este periodo</h3>
                    <p className="text-sm tabular-nums text-muted">
                      {incluidos !== null
                        ? `${consumidos} de ${incluidos} min`
                        : `${consumidos} min consumidos`}
                    </p>
                  </div>

                  {incluidos !== null ? (
                    <>
                      <div
                        className="mt-3 h-2 overflow-hidden rounded-full bg-[#f4f4f5]"
                        role="progressbar"
                        aria-label="Minutos consumidos del plan"
                        aria-valuenow={porcentaje}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-200 ${
                            excedente > 0 ? "bg-[#c53030]" : "bg-[#8b5cf6]"
                          }`}
                          style={{ width: `${Math.max(porcentaje, 2)}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {excedente > 0 ? (
                          <span className="font-medium text-[#c53030]">
                            Llevas {excedente} min de más
                            {costeExtra ? ` (${formatPrice(costeExtra)} extra)` : ""}.
                          </span>
                        ) : (
                          `Te quedan ${incluidos - consumidos} minutos incluidos.`
                        )}
                        {data.extraMinuteCents != null ? (
                          <>
                            {" "}
                            Cada minuto por encima cuesta {formatPrice(data.extraMinuteCents)}.
                          </>
                        ) : null}
                      </p>
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-start gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-[#0a0a0a] sm:text-2xl">
                    Todavía no tienes plan
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                    Sin plan activo no podemos asignarte un número ni atender llamadas. Llevas{" "}
                    <span className="font-medium tabular-nums text-[#27272a]">{consumidos} min</span>{" "}
                    de conversación registrados.
                  </p>
                </div>
                <Link href="/planes?from=billing" className="btn-primary h-11 px-5">
                  Ver los planes
                </Link>
              </div>
            )}
          </article>

          <article className="panel flex flex-col p-4 sm:p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <ReceiptText className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[#0a0a0a] sm:text-xl">Facturas y pago</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-muted">
              Descarga tus facturas, cambia la tarjeta o da de baja la suscripción desde el portal
              seguro de Stripe.
            </p>
            {data.customerConfigured ? (
              <button
                onClick={() => setShowCancellationNotice(true)}
                disabled={portal.isPending}
                className="btn-primary mt-6 h-11 justify-center px-5"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {portal.isPending ? "Abriendo…" : "Gestionar en Stripe"}
              </button>
            ) : (
              <Link href="/planes?from=billing" className="btn-primary mt-6 h-11 justify-center px-5">
                Elegir plan
              </Link>
            )}
            {portal.isError ? (
              <p className="mt-3 text-sm text-[#c53030]">
                No se pudo abrir el portal de Stripe. Inténtalo otra vez en unos segundos.
              </p>
            ) : null}
          </article>
        </div>
      ) : null}

      {showCancellationNotice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancellation-notice-title"
        >
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              onClick={() => setShowCancellationNotice(false)}
              className="absolute right-4 top-4 rounded-full p-2 text-[#52525b] transition duration-200 hover:bg-[#f4f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
              aria-label="Cerrar aviso"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <h2 id="cancellation-notice-title" className="pr-8 text-xl font-semibold text-[#0a0a0a]">
              Antes de cancelar
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#52525b]">
              Cuando termine tu suscripción, tu recepcionista dejará de atender llamadas. Antes de esa
              fecha, desactiva el desvío de tu línea habitual para que tus clientes no queden sin
              atención.
            </p>
            <p className="mt-3 text-sm leading-6 text-[#52525b]">
              También te enviaremos estas instrucciones por correo cuando programes la baja.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary h-11 justify-center px-5"
                onClick={() => setShowCancellationNotice(false)}
              >
                Volver
              </button>
              <button
                type="button"
                className="btn-primary h-11 justify-center px-5"
                onClick={() => {
                  setShowCancellationNotice(false);
                  portal.mutate();
                }}
              >
                Continuar a Stripe
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

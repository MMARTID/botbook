"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import { createCheckoutSession } from "@/lib/api";
import type { PlanId } from "@/lib/types";
import { webUrl } from "@/lib/web-url";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;
const VALID_PLANS: PlanId[] = ["inicio", "pro", "scale"];

export default function CheckoutPage({ searchParams }: { searchParams: { plan?: string } }) {
  const planId = VALID_PLANS.includes(searchParams.plan as PlanId)
    ? (searchParams.plan as PlanId)
    : null;

  // Se crea la sesión nosotros mismos, en vez de dejar que
  // EmbeddedCheckoutProvider llame a `fetchClientSecret` internamente: así,
  // si Stripe/el backend fallan, mostramos un panel de error de marca en
  // español en vez del error genérico en inglés de Stripe ("Something went
  // wrong") sin ningún botón de reintentar — visto en vivo contra un backend
  // caído durante la auditoría de esta página.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    setSessionError(false);
    setClientSecret(null);

    createCheckoutSession(planId)
      .then((session) => {
        if (!cancelled) setClientSecret(session.clientSecret);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Sin sesión (o caducada) el backend responde 401: al login, no al
        // panel de «no se pudo preparar el pago», que no es lo que pasa.
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401) {
          window.location.replace(`/login?next=${encodeURIComponent(`/checkout?plan=${planId}`)}`);
          return;
        }
        setSessionError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [planId, attempt]);

  const fetchClientSecret = useCallback(async () => {
    if (!clientSecret) {
      throw new Error("Plan no válido");
    }
    return clientSecret;
  }, [clientSecret]);

  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  if (!planId) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-3xl font-semibold text-[#0a0a0a]">Selecciona un plan válido</h1>
        <a href={webUrl("/planes")} className="btn-primary mt-6">Ver planes</a>
      </section>
    );
  }

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-3xl font-semibold text-[#0a0a0a]">Checkout sin configurar</h1>
        <p className="mt-4 text-muted">Falta la clave publicable de Stripe en el frontend.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl py-4 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <a href={webUrl("/planes")} className="btn-secondary px-4">
          <ArrowLeft className="h-4 w-4" />
          Planes
        </a>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted">
          <ShieldCheck className="h-4 w-4 text-[#2c7334]" />
          Pago protegido por Stripe · Cancela cuando quieras
        </span>
      </div>
      <div className="min-h-[480px] overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        {sessionError ? (
          <div className="flex min-h-[480px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fef8e7] text-[#9f7a15]">
              <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0a0a0a]">No hemos podido abrir el pago</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                Algo ha fallado al conectar con Stripe. No se te ha cobrado nada — puedes reintentarlo.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-primary">
                Reintentar
              </button>
              <a href={webUrl("/planes")} className="btn-secondary">
                Ver planes
              </a>
            </div>
          </div>
        ) : clientSecret ? (
          <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : (
          <div className="flex min-h-[480px] items-center justify-center">
            <p className="text-sm text-muted">Preparando el pago…</p>
          </div>
        )}
      </div>
    </section>
  );
}

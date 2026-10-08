"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { AlertTriangle, ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
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
        // 409: el negocio ya tiene una suscripción viva (activa o con un pago
        // pendiente). Otro checkout crearía una segunda que se cobraría
        // aparte; lo que toca es gestionarla en Facturación.
        if (status === 409) {
          window.location.replace("/ajustes/facturacion");
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
        <h1 className="text-3xl font-semibold text-tinta">Selecciona un plan válido</h1>
        <a href={webUrl("/planes")} className="btn-primary mt-6">Ver planes</a>
      </section>
    );
  }

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-3xl font-semibold text-tinta">El pago no está disponible ahora mismo</h1>
        <p className="mt-4 text-muted">
          Escríbenos a{" "}
          <a href="mailto:hola@alhabla.ai" className="font-semibold text-morado-tinta underline underline-offset-2">
            hola@alhabla.ai
          </a>{" "}
          y lo resolvemos.
        </p>
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
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="h-4 w-4 text-exito" />
          Pago protegido por Stripe · Cancela cuando quieras
        </span>
      </div>
      <div className="min-h-[480px] overflow-hidden rounded-2xl border border-linea bg-superficie">
        {sessionError ? (
          <div role="alert" className="flex min-h-[480px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-aviso-fondo text-aviso">
              <AlertTriangle className="h-8 w-8" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-tinta">No hemos podido abrir el pago</h2>
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
          <div role="status" className="flex min-h-[480px] items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin text-morado" aria-hidden="true" />
            Preparando el pago…
          </div>
        )}
      </div>
    </section>
  );
}

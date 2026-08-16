"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { createCheckoutSession } from "@/lib/api";
import type { PlanId } from "@/lib/types";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;
const VALID_PLANS: PlanId[] = ["inicio", "pro", "scale"];

export default function CheckoutPage({ searchParams }: { searchParams: { plan?: string } }) {
  const planId = VALID_PLANS.includes(searchParams.plan as PlanId)
    ? (searchParams.plan as PlanId)
    : null;

  const fetchClientSecret = useCallback(async () => {
    if (!planId) {
      throw new Error("Plan no válido");
    }
    const session = await createCheckoutSession(planId);
    return session.clientSecret;
  }, [planId]);

  const options = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  if (!planId) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-3xl font-semibold text-[#1e2b22]">Selecciona un plan válido</h1>
        <Link href="/planes" className="btn-primary mt-6">Ver planes</Link>
      </section>
    );
  }

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    return (
      <section className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-3xl font-semibold text-[#1e2b22]">Checkout sin configurar</h1>
        <p className="mt-4 text-[#687267]">Falta la clave publicable de Stripe en el frontend.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl py-4 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/planes" className="btn-secondary h-10 px-4">
          <ArrowLeft className="h-4 w-4" />
          Planes
        </Link>
        <span className="inline-flex items-center gap-2 text-sm font-medium text-[#54634b]">
          <ShieldCheck className="h-4 w-4 text-[#2c7334]" />
          Pago protegido por Stripe
        </span>
      </div>
      <div className="min-h-[480px] overflow-hidden rounded-2xl border border-[#e4e8df] bg-white shadow-[0_12px_40px_rgba(30,43,34,0.08)]">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </section>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { redeemPass } from "@/lib/api";
import { isPlanId, savePendingPlan } from "@/lib/billing-navigation";
import { normalizeBusinessType } from "@/lib/business-type";
import { webUrl } from "@/lib/web-url";

const REGISTRATION_NICHE_KEY = "alhabla_registration_niche";

/**
 * Llegada desde la web pública tras crear la cuenta (PLAN-APP-DOMINIO.md
 * § 3): canjea el pase de un solo uso por la sesión y sigue con el asistente
 * del negocio. El plan y el sector vienen en la query porque el
 * localStorage de alhabla.ai no se ve desde aquí; se guardan donde
 * /bienvenida los espera.
 */
function EntrarContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pase = searchParams.get("pase");
    if (!pase) {
      setError("Falta el pase de entrada.");
      return;
    }
    let cancelado = false;
    redeemPass(pase)
      .then((token) => {
        if (cancelado) return;
        window.localStorage.setItem("alhabla_token", token);
        const plan = searchParams.get("plan");
        if (isPlanId(plan)) savePendingPlan(plan);
        const sector = searchParams.get("sector");
        if (sector) window.localStorage.setItem(REGISTRATION_NICHE_KEY, normalizeBusinessType(sector));
        window.location.replace(isPlanId(plan) ? `/bienvenida?plan=${plan}` : "/bienvenida");
      })
      .catch(() => {
        if (!cancelado) setError("El pase ha caducado o ya se ha usado.");
      });
    return () => {
      cancelado = true;
    };
  }, [searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-2xl font-black tracking-tight text-[#0a0a0a]">No hemos podido abrir tu sesión</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {error} Tu cuenta está creada: entra con tu email y contraseña.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/login" className="btn-primary px-5">
              Entrar
            </a>
            <a href={webUrl("/register")} className="btn-secondary px-5">
              Volver al registro
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted" role="status">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Abriendo tu cuenta…
    </div>
  );
}

export default function EntrarPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Abriendo tu cuenta…</div>}>
      <EntrarContent />
    </Suspense>
  );
}

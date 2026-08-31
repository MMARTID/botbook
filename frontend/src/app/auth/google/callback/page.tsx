"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { consumeGoogleSession } from "@/lib/api";
import { consumePendingPlan } from "@/lib/billing-navigation";
import { BrandMark } from "@/components/brand-mark";

const GOOGLE_ERRORS: Record<string, string> = {
  access_denied: "Se canceló el acceso con Google.",
  invalid_state: "La solicitud de acceso ha caducado. Inténtalo de nuevo.",
  unverified_email: "Google no pudo confirmar tu dirección de correo.",
  authentication_failed: "No se pudo completar el acceso con Google.",
};

export default function GoogleCallbackPage() {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const providerError = new URLSearchParams(window.location.search).get("error");
    if (providerError) {
      setError(GOOGLE_ERRORS[providerError] ?? "No se pudo completar el acceso con Google.");
      return;
    }

    consumeGoogleSession()
      .then((token) => {
        window.localStorage.setItem("alhabla_token", token);
        const selectedPlan = consumePendingPlan();
        const planParam = selectedPlan ? `?plan=${selectedPlan}` : "";
        window.location.replace(`/register/business${planParam}`);
      })
      .catch(() => {
        setError("La sesión de Google ha caducado. Vuelve a intentarlo.");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="panel w-full max-w-md p-8 text-center">
        <BrandMark className="mx-auto h-14 w-14" />
        {error ? (
          <>
            <h1 className="mt-6 text-2xl font-black text-[#0a0a0a]">No pudimos iniciar sesión</h1>
            <p className="mt-3 text-sm leading-6 text-muted">{error}</p>
            <Link href="/login" className="btn-primary mt-6 w-full justify-center">
              Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto mt-7 h-7 w-7 animate-spin text-[#8b5cf6]" />
            <h1 className="mt-4 text-2xl font-black text-[#0a0a0a]">Completando el acceso</h1>
            <p className="mt-3 text-sm text-muted">Estamos preparando tu cuenta de Alhabla.</p>
          </>
        )}
      </div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, LoaderCircle } from "lucide-react";
import { consumeGoogleSession } from "@/lib/api";
import { consumePendingPlan } from "@/lib/billing-navigation";

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
        window.localStorage.setItem("asistai_token", token);
        const selectedPlan = consumePendingPlan();
        const planParam = selectedPlan ? `?plan=${selectedPlan}` : "";
        window.location.replace(`/register/business${planParam}`);
      })
      .catch(() => {
        setError("La sesión de Google ha caducado. Vuelve a intentarlo.");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8f4] px-4">
      <div className="w-full max-w-md rounded-[2rem] border border-[#e4e8df] bg-white p-8 text-center shadow-[0_20px_80px_rgba(16,24,20,0.08)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#1e2b22] text-[#b8d96e]">
          <Bot className="h-7 w-7" />
        </div>
        {error ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold text-[#1e2b22]">No pudimos iniciar sesión</h1>
            <p className="mt-3 text-sm leading-6 text-[#687267]">{error}</p>
            <Link href="/login" className="btn-primary mt-6 w-full justify-center">
              Volver a iniciar sesión
            </Link>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto mt-7 h-7 w-7 animate-spin text-[#405115]" />
            <h1 className="mt-4 text-2xl font-semibold text-[#1e2b22]">Completando el acceso</h1>
            <p className="mt-3 text-sm text-[#687267]">Estamos preparando tu cuenta de AsistAI.</p>
          </>
        )}
      </div>
    </div>
  );
}
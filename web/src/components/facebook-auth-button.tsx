"use client";

import { useState } from "react";
import { getFacebookAuthUrl } from "@/lib/api";
import { BetaPill } from "@/components/beta-pill";

type FacebookAuthButtonProps = {
  onError: (message: string) => void;
  beforeStart?: () => void;
  disabled?: boolean;
  acceptedTerms?: boolean;
  intent?: "login" | "register";
  // Si llega, el botón sigue activo pero al pulsarlo muestra este aviso en
  // vez de ir a Facebook (p. ej. falta aceptar los Términos en el registro).
  avisoAntesDeEmpezar?: string;
};

function FacebookIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07Z"
      />
    </svg>
  );
}

export function FacebookAuthButton({
  onError,
  beforeStart,
  disabled,
  acceptedTerms,
  intent = "login",
  avisoAntesDeEmpezar,
}: FacebookAuthButtonProps) {
  const [loading, setLoading] = useState(false);
  const startFacebookAuth = async () => {
    if (avisoAntesDeEmpezar) {
      onError(avisoAntesDeEmpezar);
      return;
    }
    setLoading(true);
    onError("");

    try {
      beforeStart?.();
      window.location.assign(await getFacebookAuthUrl(acceptedTerms, intent));
    } catch {
      setLoading(false);
      onError("No se pudo iniciar sesión con Facebook. Inténtalo de nuevo.");
    }
  };

  // Beta: la app de Facebook sigue pendiente de verificación/publicación y
  // solo entran cuentas de prueba; la pastilla avisa, el botón sigue
  // funcionando (mismo patrón que GoogleAuthButton).
  return (
    <div className="relative">
      <BetaPill />
      <button
        type="button"
        onClick={startFacebookAuth}
        disabled={loading || disabled}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-[10px] border border-linea bg-superficie px-4 text-sm font-semibold text-tinta transition hover:border-tinta hover:bg-relleno focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-morado/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <FacebookIcon />
        {loading ? "Conectando con Facebook..." : "Continuar con Facebook"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { getGoogleAuthUrl } from "@/lib/api";

type GoogleAuthButtonProps = {
  onError: (message: string) => void;
  beforeStart?: () => void;
  disabled?: boolean;
  acceptedTerms?: boolean;
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.87A6.02 6.02 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.61Z" />
      <path fill="#EA4335" d="M12 6c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.61C7.18 7.76 9.39 6 12 6Z" />
    </svg>
  );
}

export function GoogleAuthButton({ onError, beforeStart, disabled, acceptedTerms }: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const startGoogleAuth = async () => {
    setLoading(true);
    onError("");

    try {
      beforeStart?.();
      window.location.assign(await getGoogleAuthUrl(acceptedTerms));
    } catch {
      setLoading(false);
      onError("No se pudo iniciar sesión con Google. Inténtalo de nuevo.");
    }
  };

  return (
    <button
      type="button"
      onClick={startGoogleAuth}
      disabled={loading || disabled}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-full border border-[#e5e5e5] bg-white px-4 text-sm font-semibold text-[#0a0a0a] transition hover:border-[#0a0a0a] hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#8b5cf6]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? "Conectando con Google..." : "Continuar con Google"}
    </button>
  );
}
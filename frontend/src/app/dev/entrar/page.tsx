"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Atajo de desarrollo para entrar en una cuenta de prueba desde un enlace,
 * sin pasar por el formulario de login. Guarda el token que llega en la URL
 * igual que hace el callback de Google y va al panel.
 *
 * No es un agujero de seguridad: el enlace ya lleva un JWT válido, así que
 * quien lo tenga podría llamar a la API directamente de todos modos. Aun así
 * se bloquea en producción, para que no exista ni la apariencia de una vía
 * de acceso alternativa.
 */
function DevEntrarContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      setError("Este atajo solo existe en desarrollo.");
      return;
    }

    const token = searchParams.get("token");
    if (!token) {
      setError("Falta el parámetro token en la URL.");
      return;
    }

    window.localStorage.setItem("alhabla_token", token);
    window.location.replace("/");
  }, [searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="panel w-full max-w-md p-8 text-center">
        <p className="text-sm leading-6 text-muted">
          {error || "Entrando..."}
        </p>
      </div>
    </div>
  );
}

export default function DevEntrarPage() {
  return (
    <Suspense fallback={null}>
      <DevEntrarContent />
    </Suspense>
  );
}

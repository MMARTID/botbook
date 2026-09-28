"use client";

import { usePathname } from "next/navigation";
import { esRutaSinArmazon } from "@/components/app-shell";
import { GoogleAnalytics } from "@/components/google-analytics";
import { webUrl } from "@/lib/web-url";

// Llevan tokens en la URL (pase de entrada, vuelta de OAuth, restablecer la
// contraseña): el aviso de cookies puede salir, pero la visita no se mide.
// Constante de módulo para que la referencia no cambie en cada navegación.
const RUTAS_SIN_MEDICION = [
  "auth",
  "dev",
  "restablecer-contrasena",
  "settings",
] as const;

/**
 * La analítica compartida con la web, configurada para la app. Es cliente
 * porque la colocación depende de la ruta actual (con armazón del panel o sin
 * él): el layout es Server Component, no conoce la ruta y no puede pasarle
 * una función.
 */
export function AnaliticaDeLaApp() {
  const pathname = usePathname();
  return (
    <GoogleAnalytics
      enlaceDePrivacidad={webUrl("/legal/privacidad")}
      rutasSinMedicion={RUTAS_SIN_MEDICION}
      dentroDelPanel={!esRutaSinArmazon(pathname)}
    />
  );
}

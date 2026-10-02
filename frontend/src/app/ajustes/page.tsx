"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppPageSkeleton } from "@/components/app-page-header";
import { MarcoDeAjustes } from "@/components/ajustes/marco-de-ajustes";
import { SeccionCuenta } from "@/components/ajustes/seccion-cuenta";
import { CuentaMovil } from "@/components/movil/cuenta-movil";
import { SectionErrorState } from "@/components/section-card";
import { useBusiness } from "@/components/providers";
import { useEsMovil } from "@/hooks/use-es-movil";

/** En escritorio, Ajustes › Cuenta; en la app móvil, la pestaña Cuenta. */
export default function AjustesCuentaPage() {
  const esMovil = useEsMovil();
  if (esMovil === null) return <AppPageSkeleton label="Cargando tu cuenta…" />;
  if (esMovil) return <CuentaDelMovil />;
  return (
    <MarcoDeAjustes seccion="/ajustes">
      <SeccionCuenta />
    </MarcoDeAjustes>
  );
}

function CuentaDelMovil() {
  const router = useRouter();
  const { business, hasToken, isLoadingBusiness } = useBusiness();

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
    // Enlaces antiguos (`/ajustes#whatsapp`, `/ajustes#telefono`): la
    // sección de teléfono tiene su pantalla.
    const ancla = window.location.hash;
    if (ancla === "#whatsapp" || ancla === "#telefono") router.replace(`/ajustes/telefono${ancla}`);
  }, [hasToken, router]);

  if (isLoadingBusiness) return <AppPageSkeleton label="Cargando tu cuenta…" />;
  if (!business) {
    return hasToken ? (
      <SectionErrorState
        message="No se pudo cargar tu cuenta. Comprueba tu conexión y vuelve a intentarlo."
        onRetry={() => window.location.reload()}
      />
    ) : null;
  }
  return <CuentaMovil business={business} />;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

const ID_MEDICION = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-Z3RT28K0ZJ";
const NOMBRE_COOKIE = "alhabla_analitica";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function leerConsentimiento(): boolean | null {
  const valor = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${NOMBRE_COOKIE}=`))
    ?.split("=")[1];
  return valor === "aceptada" ? true : valor === "rechazada" ? false : null;
}

function guardarConsentimiento(aceptada: boolean) {
  const dominio = window.location.hostname.endsWith("alhabla.ai") ? "; Domain=.alhabla.ai" : "";
  document.cookie = `${NOMBRE_COOKIE}=${aceptada ? "aceptada" : "rechazada"}; Path=/; Max-Age=31536000; SameSite=Lax${dominio}`;
}

/** Carga GA4 solo tras consentimiento y registra los cambios de ruta de Next. */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consentimiento, setConsentimiento] = useState<boolean | null>(null);
  const [listo, setListo] = useState(false);
  const ruta = `${pathname}${searchParams.size ? `?${searchParams}` : ""}`;

  useEffect(() => setConsentimiento(leerConsentimiento()), []);

  useEffect(() => {
    if (!listo || !ID_MEDICION || !window.gtag) return;
    window.gtag("event", "page_view", { page_path: ruta });
  }, [listo, ruta]);

  if (!ID_MEDICION) return null;

  const decidir = (aceptada: boolean) => {
    guardarConsentimiento(aceptada);
    setConsentimiento(aceptada);
  };

  return (
    <>
      {consentimiento === true ? <><Script id="google-analytics-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${ID_MEDICION}',{send_page_view:false});` }} /><Script id="google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${ID_MEDICION}`} strategy="afterInteractive" onLoad={() => setListo(true)} /></> : null}
      {consentimiento === null ? (
        <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-2xl border border-[#ddd6fe] bg-white p-5 shadow-[0_16px_40px_rgba(0,0,0,0.16)]" aria-label="Preferencias de cookies">
          <p className="text-sm font-semibold text-[#0a0a0a]">¿Nos ayudas a mejorar Alhabla?</p>
          <p className="mt-1 text-sm leading-6 text-[#52525b]">Usamos Google Analytics solo con tu permiso para entender cómo se usa la web.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => decidir(true)} className="btn-primary px-4 py-2 text-sm">Aceptar analítica</button>
            <button type="button" onClick={() => decidir(false)} className="btn-secondary px-4 py-2 text-sm">Rechazar</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

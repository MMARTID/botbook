"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const ID_MEDICION = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-Z3RT28K0ZJ";
const NOMBRE_COOKIE = "alhabla_analitica";
const UN_ANO = 365 * 24 * 60 * 60;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    alhablaGtagConfigurado?: boolean;
  }
}

function leerConsentimiento(): boolean | null {
  const valor = document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${NOMBRE_COOKIE}=`))
    ?.slice(NOMBRE_COOKIE.length + 1);
  return valor === "aceptada" ? true : valor === "rechazada" ? false : null;
}

function dominioCompartido(): string {
  const host = window.location.hostname;
  return host === "alhabla.ai" || host.endsWith(".alhabla.ai") ? "; Domain=.alhabla.ai" : "";
}

function guardarConsentimiento(aceptada: boolean) {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NOMBRE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${NOMBRE_COOKIE}=${aceptada ? "aceptada" : "rechazada"}; Path=/; Max-Age=${UN_ANO}; SameSite=Lax${dominioCompartido()}${seguro}`;
}

function referenteSeguro(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : "";
  } catch {
    return "";
  }
}

function borrarCookiesDeGoogle() {
  const nombres = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter((nombre) => /^(_ga(?:_|$)|_gid$|_gat(?:_|$))/.test(nombre));
  for (const nombre of nombres) {
    document.cookie = `${nombre}=; Path=/; Max-Age=0; SameSite=Lax`;
    if (dominioCompartido()) {
      document.cookie = `${nombre}=; Path=/; Max-Age=0; SameSite=Lax; Domain=.alhabla.ai`;
    }
  }
}

function configurarGoogle() {
  Reflect.set(window, `ga-disable-${ID_MEDICION}`, false);
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => window.dataLayer?.push(args);
  if (!window.alhablaGtagConfigurado) {
    // Consentimiento básico: la etiqueta se carga únicamente tras aceptar.
    window.gtag("consent", "default", {
      analytics_storage: "denied", ad_storage: "denied",
      ad_user_data: "denied", ad_personalization: "denied",
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", ID_MEDICION, {
      send_page_view: false,
      page_location: `${window.location.origin}${window.location.pathname}`,
      page_referrer: referenteSeguro(),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    window.alhablaGtagConfigurado = true;
  } else {
    window.gtag("consent", "update", { analytics_storage: "granted" });
  }
}

function detenerGoogle() {
  Reflect.set(window, `ga-disable-${ID_MEDICION}`, true);
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  borrarCookiesDeGoogle();
}

/** Rutas internas del blog (editor, redirector y vistas previa): no se miden
 * y, directamente, no cargan nada — ni scripts ni aviso de cookies. */
function rutaMedible(ruta: string): boolean {
  return !/^\/(?:keystatic|vista-previa|preview|api)(?:\/|$)/.test(ruta);
}

function filtrarEventoDeVercel(evento: BeforeSendEvent): BeforeSendEvent | null {
  if (leerConsentimiento() !== true) return null;
  const url = new URL(evento.url, window.location.origin);
  if (!rutaMedible(url.pathname)) return null;
  return { ...evento, url: `${url.origin}${url.pathname}` };
}

/** Mide páginas sin parámetros y permite cambiar la elección en cualquier momento. */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const [consentimiento, setConsentimiento] = useState<boolean | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [puedeCargar, setPuedeCargar] = useState(false);
  const [listo, setListo] = useState(false);
  // El editor del blog y las vistas previa son internos: ni medición ni
  // banner de cookies, aunque la visita hubiera aceptado en otra página.
  const medible = rutaMedible(pathname);

  useEffect(() => {
    if (!medible) return;
    const sincronizar = () => {
      if (document.visibilityState === "hidden") return;
      setConsentimiento(leerConsentimiento());
      setHidratado(true);
    };
    sincronizar();
    window.addEventListener("focus", sincronizar);
    window.addEventListener("pageshow", sincronizar);
    document.addEventListener("visibilitychange", sincronizar);
    return () => {
      window.removeEventListener("focus", sincronizar);
      window.removeEventListener("pageshow", sincronizar);
      document.removeEventListener("visibilitychange", sincronizar);
    };
  }, [medible]);

  useEffect(() => {
    if (!medible || !hidratado || !/^G-[A-Z0-9]+$/.test(ID_MEDICION)) return;
    if (consentimiento === true) {
      configurarGoogle();
      setPuedeCargar(true);
    } else {
      detenerGoogle();
      setPuedeCargar(false);
      setListo(false);
    }
  }, [consentimiento, hidratado, medible]);

  useEffect(() => {
    if (!listo || consentimiento !== true || !rutaMedible(pathname)) return;
    // Nunca se envían query strings: contienen tokens de registro o campañas.
    window.gtag?.("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_referrer: referenteSeguro(),
      page_title: document.title,
    });
  }, [listo, consentimiento, pathname]);

  if (!medible) return null;
  if (!/^G-[A-Z0-9]+$/.test(ID_MEDICION)) return null;

  const decidir = (aceptada: boolean) => {
    guardarConsentimiento(aceptada);
    if (!aceptada) detenerGoogle();
    setConsentimiento(aceptada);
    setAbierto(false);
  };

  return (
    <>
      {puedeCargar && consentimiento === true ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ID_MEDICION}`} strategy="afterInteractive" onReady={() => setListo(true)} />
          <Analytics beforeSend={filtrarEventoDeVercel} />
        </>
      ) : null}
      {hidratado && (consentimiento === null || abierto) ? (
        <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-[#ddd6fe] bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)]" aria-labelledby="titulo-cookies">
          {/* Título real, no solo aria-label: un aside con contenido complejo
              (párrafo + enlace + 2 botones) se orienta mejor con un
              encabezado que un lector de pantalla puede saltar a buscar. Va
              sr-only porque el propio párrafo ya deja claro de qué trata —
              así no añade altura al banner en pantalla. */}
          <h2 id="titulo-cookies" className="sr-only">Preferencias de cookies</h2>
          <p className="text-sm leading-5 text-[#52525b]">
            Analítica opcional (Google Analytics, Vercel) — solo se activa si aceptas. <a href="/legal/privacidad" className="text-[#0a0a0a] underline underline-offset-2">Más información</a>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => decidir(true)} className="btn-secondary px-4 py-2 text-sm">Aceptar analítica</button>
            <button type="button" onClick={() => decidir(false)} className="btn-secondary px-4 py-2 text-sm">Rechazar analítica</button>
          </div>
        </aside>
      ) : hidratado ? (
        <button type="button" onClick={() => setAbierto(true)} className="fixed bottom-4 left-4 z-50 rounded-full border border-[#ddd6fe] bg-white px-3 py-2 text-xs font-semibold text-[#3f3f46] shadow-sm transition-opacity duration-200 hover:bg-[#f5f3ff] [html[data-relato]_&]:pointer-events-none [html[data-relato]_&]:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
          Configurar cookies
        </button>
      ) : null}
    </>
  );
}

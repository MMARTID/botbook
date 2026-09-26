"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { webUrl } from "@/lib/web-url";
import { esRutaSinArmazon } from "@/components/app-shell";

const ID_MEDICION = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-Z3RT28K0ZJ";
const NOMBRE_COOKIE = "alhabla_analitica";
const UN_ANO = 365 * 24 * 60 * 60;
const EVENTO_PREFERENCIAS = "alhabla:preferencias-cookies";

/** Reabre el aviso de cookies desde otro sitio (la hoja «Más» del panel). */
export function abrirPreferenciasDeCookies() {
  window.dispatchEvent(new Event(EVENTO_PREFERENCIAS));
}

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

function rutaMedible(ruta: string): boolean {
  return !/^\/(?:auth|dev|restablecer-contrasena|settings)(?:\/|$)/.test(ruta);
}

function filtrarEventoDeVercel(evento: BeforeSendEvent): BeforeSendEvent | null {
  if (leerConsentimiento() !== true) return null;
  const url = new URL(evento.url, window.location.origin);
  if (!rutaMedible(url.pathname)) return null;
  return { ...evento, url: `${url.origin}${url.pathname}` };
}

/** Comparte la elección con la web y mide solo rutas sin parámetros privados. */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const [consentimiento, setConsentimiento] = useState<boolean | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [puedeCargar, setPuedeCargar] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(EVENTO_PREFERENCIAS, abrir);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS, abrir);
  }, []);

  useEffect(() => {
    if (!hidratado || !/^G-[A-Z0-9]+$/.test(ID_MEDICION)) return;
    if (consentimiento === true) {
      configurarGoogle();
      setPuedeCargar(true);
    } else {
      detenerGoogle();
      setPuedeCargar(false);
      setListo(false);
    }
  }, [consentimiento, hidratado]);

  useEffect(() => {
    if (!listo || consentimiento !== true || !rutaMedible(pathname)) return;
    window.gtag?.("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_referrer: referenteSeguro(),
      page_title: document.title,
    });
  }, [listo, consentimiento, pathname]);

  if (!/^G-[A-Z0-9]+$/.test(ID_MEDICION)) return null;

  const decidir = (aceptada: boolean) => {
    guardarConsentimiento(aceptada);
    if (!aceptada) detenerGoogle();
    setConsentimiento(aceptada);
    setAbierto(false);
  };

  // Dentro del panel hay barra lateral (escritorio) y barra inferior (móvil):
  // el botón flotante no puede taparlas. En móvil la opción vive en la hoja
  // «Más»; en escritorio el botón pasa a la esquina derecha.
  const enPanel = !esRutaSinArmazon(pathname);

  return (
    <>
      {puedeCargar && consentimiento === true ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ID_MEDICION}`} strategy="afterInteractive" onReady={() => setListo(true)} />
          <Analytics beforeSend={filtrarEventoDeVercel} />
        </>
      ) : null}
      {hidratado && (consentimiento === null || abierto) ? (
        <aside className={`fixed inset-x-4 z-[65] mx-auto max-w-xl rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_16px_40px_rgba(0,0,0,0.16)] ${enPanel ? "bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] lg:bottom-4" : "bottom-4"}`} aria-labelledby="titulo-cookies">
          <h2 id="titulo-cookies" className="text-sm font-semibold text-[#0a0a0a]">Preferencias de cookies</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Google Analytics y Vercel Analytics nos ayudan a entender el uso de la aplicación. Solo se activan si aceptas. Puedes cambiar tu elección cuando quieras. <a href={webUrl("/legal/privacidad")} className="rounded font-medium text-[#27272a] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">Más información</a>.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => decidir(true)} className="btn-secondary h-11 px-4">Aceptar analítica</button>
            <button type="button" onClick={() => decidir(false)} className="btn-secondary h-11 px-4">Rechazar analítica</button>
          </div>
        </aside>
      ) : hidratado ? (
        <button type="button" onClick={() => setAbierto(true)} className={`fixed bottom-4 z-40 min-h-11 items-center rounded-full border border-[#e5e5e5] bg-white px-4 text-xs font-semibold text-[#27272a] shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition duration-200 hover:bg-[#fafafa] [html[data-relato]_&]:pointer-events-none [html[data-relato]_&]:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${enPanel ? "right-4 hidden lg:inline-flex" : "left-4 inline-flex"}`}>
          Configurar cookies
        </button>
      ) : null}
    </>
  );
}

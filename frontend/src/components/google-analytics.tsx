"use client";

// Copia compartida: este fichero es idéntico, byte a byte, en
// frontend/src/components/ (la app) y web/src/components/ (la web), y CI lo
// comprueba con scripts/comprobar-copias-compartidas.sh. Lo que cambia entre
// las dos llega por props (la web lo monta en su layout.tsx; la app, a través
// de analitica-de-la-app.tsx), así que un cambio aquí se copia tal cual a la
// otra.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { Cookie } from "lucide-react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const ID_MEDICION = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-Z3RT28K0ZJ";
const NOMBRE_COOKIE = "alhabla_analitica";
const UN_ANO = 365 * 24 * 60 * 60;
const EVENTO_PREFERENCIAS = "alhabla:preferencias-cookies";
// Valor por defecto fuera del componente: un `[]` en la firma sería un array
// nuevo en cada render y los useMemo de abajo se recalcularían siempre.
const SIN_RUTAS: readonly string[] = [];

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
  return host === "alhabla.ai" || host.endsWith(".alhabla.ai")
    ? "; Domain=.alhabla.ai"
    : "";
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

function configurarGoogle(grupoDeContenido: string | undefined) {
  Reflect.set(window, `ga-disable-${ID_MEDICION}`, false);
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => window.dataLayer?.push(args);
  if (!window.alhablaGtagConfigurado) {
    // Consentimiento básico: la etiqueta se carga únicamente tras aceptar.
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", ID_MEDICION, {
      send_page_view: false,
      page_location: `${window.location.origin}${window.location.pathname}`,
      page_referrer: referenteSeguro(),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      // Va en la configuración para que también lo lleven los eventos
      // automáticos de Google, no solo el `page_view` que se envía a mano.
      ...(grupoDeContenido ? { content_group: grupoDeContenido } : {}),
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

/** Primer segmento de la ruta: «/auth/entrar» → «auth»; «/» → «». */
function primerSegmento(ruta: string): string {
  return ruta.split("/")[1] ?? "";
}

function rutaMedible(ruta: string, rutasSinMedir: readonly string[]): boolean {
  return !rutasSinMedir.includes(primerSegmento(ruta));
}

function crearFiltroDeVercel(rutasSinMedir: readonly string[]) {
  return (evento: BeforeSendEvent): BeforeSendEvent | null => {
    if (leerConsentimiento() !== true) return null;
    const url = new URL(evento.url, window.location.origin);
    if (!rutaMedible(url.pathname, rutasSinMedir)) return null;
    return { ...evento, url: `${url.origin}${url.pathname}` };
  };
}

// Solo props serializables: la web lo monta directamente en su layout.tsx, que
// es un Server Component y no puede pasarle funciones.
type PropiedadesDeAnalitica = {
  /** Destino de «Más información»: la política de privacidad vive en la web. */
  enlaceDePrivacidad: string;
  /** Primer segmento de ruta, sin barra («auth» cubre /auth y /auth/…), donde
   * no se envía `page_view` ni evento de Vercel (la URL lleva tokens), aunque
   * el aviso de cookies sí puede salir. */
  rutasSinMedicion?: readonly string[];
  /** Primer segmento de ruta, sin barra, donde no se carga nada: ni scripts
   * ni aviso. */
  rutasSinAnalitica?: readonly string[];
  /** Hay armazón del panel (barra lateral en escritorio, barra inferior en
   * móvil) y el aviso y el botón no pueden taparlo. */
  dentroDelPanel?: boolean;
  /** El aviso de la primera visita espera al primer scroll: en la web tapaba
   * las señales de confianza del hero en el primer viewport (revisión de
   * diseño del 24-09, P1). Nada se mide mientras tanto: Google y Vercel solo
   * se cargan tras aceptar. */
  aplazarAvisoHastaScroll?: boolean;
  /** «web» o «app»: viaja como `content_group` en cada evento de Google para
   * que las visitas de captación y el uso del panel se puedan ver por
   * separado aunque compartan ID de medición. La separación completa (un
   * flujo de datos por dominio) se hace con NEXT_PUBLIC_GA_MEASUREMENT_ID
   * en cada proyecto de Vercel. */
  grupoDeContenido?: string;
};

/** Comparte la elección entre la app y la web, mide solo páginas sin
 * parámetros y permite cambiar la elección en cualquier momento. */
export function GoogleAnalytics({
  enlaceDePrivacidad,
  rutasSinMedicion = SIN_RUTAS,
  rutasSinAnalitica = SIN_RUTAS,
  dentroDelPanel = false,
  aplazarAvisoHastaScroll = false,
  grupoDeContenido,
}: PropiedadesDeAnalitica) {
  const pathname = usePathname();
  const [consentimiento, setConsentimiento] = useState<boolean | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [puedeCargar, setPuedeCargar] = useState(false);
  const [listo, setListo] = useState(false);
  const [huboScroll, setHuboScroll] = useState(false);
  // Las rutas internas (en la web, el editor del blog y las vistas previa):
  // ni medición ni aviso de cookies, aunque la visita hubiera aceptado en
  // otra página.
  const conAnalitica = !rutasSinAnalitica.includes(primerSegmento(pathname));
  // Donde no hay analítica tampoco se mide, ni en Google ni en Vercel.
  const rutasSinMedir = useMemo(
    () => [...rutasSinMedicion, ...rutasSinAnalitica],
    [rutasSinMedicion, rutasSinAnalitica]
  );
  const medible = rutaMedible(pathname, rutasSinMedir);
  // Misma referencia mientras no cambien las listas: `<Analytics>` vuelve a
  // registrar `beforeSend` cada vez que cambia.
  const filtrarEventoDeVercel = useMemo(
    () => crearFiltroDeVercel(rutasSinMedir),
    [rutasSinMedir]
  );

  useEffect(() => {
    if (!conAnalitica) return;
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
  }, [conAnalitica]);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(EVENTO_PREFERENCIAS, abrir);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS, abrir);
  }, []);

  useEffect(() => {
    if (!aplazarAvisoHastaScroll || huboScroll) return;
    const alDesplazar = () => {
      if (window.scrollY > 0) setHuboScroll(true);
    };
    // Una recarga a media página ya viene desplazada.
    alDesplazar();
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => window.removeEventListener("scroll", alDesplazar);
  }, [aplazarAvisoHastaScroll, huboScroll]);

  useEffect(() => {
    if (!conAnalitica || !hidratado || !/^G-[A-Z0-9]+$/.test(ID_MEDICION))
      return;
    if (consentimiento === true) {
      configurarGoogle(grupoDeContenido);
      setPuedeCargar(true);
    } else {
      detenerGoogle();
      setPuedeCargar(false);
      setListo(false);
    }
  }, [consentimiento, hidratado, conAnalitica, grupoDeContenido]);

  useEffect(() => {
    if (!listo || consentimiento !== true || !medible) return;
    // Nunca se envían query strings: contienen tokens de registro o campañas.
    window.gtag?.("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
      page_referrer: referenteSeguro(),
      page_title: document.title,
      ...(grupoDeContenido ? { content_group: grupoDeContenido } : {}),
    });
  }, [listo, consentimiento, pathname, medible, grupoDeContenido]);

  if (!conAnalitica) return null;
  if (!/^G-[A-Z0-9]+$/.test(ID_MEDICION)) return null;

  const decidir = (aceptada: boolean) => {
    guardarConsentimiento(aceptada);
    if (!aceptada) detenerGoogle();
    setConsentimiento(aceptada);
    setAbierto(false);
  };

  const mostrarAviso =
    hidratado &&
    (abierto ||
      (consentimiento === null && (!aplazarAvisoHastaScroll || huboScroll)));
  // El botón solo cuando ya hay una elección que cambiar.
  const mostrarBoton = hidratado && !mostrarAviso && consentimiento !== null;

  // Dentro del panel hay barra lateral (escritorio) y barra inferior (móvil):
  // el botón flotante no puede taparlas. En móvil la opción vive en la hoja
  // «Más»; en escritorio el botón pasa a la esquina derecha. El aviso, en
  // móvil, se apoya encima de la barra inferior.
  const colocacionDelAviso = dentroDelPanel
    ? "bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] lg:bottom-4"
    : "bottom-4";
  const colocacionDelBoton = dentroDelPanel
    ? "right-4 hidden lg:inline-flex"
    : "left-4 inline-flex";

  return (
    <>
      {puedeCargar && consentimiento === true ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ID_MEDICION}`}
            strategy="afterInteractive"
            onReady={() => setListo(true)}
          />
          <Analytics beforeSend={filtrarEventoDeVercel} />
        </>
      ) : null}
      {mostrarAviso ? (
        <aside
          className={`fixed inset-x-4 z-[65] mx-auto max-w-md rounded-2xl border border-linea bg-superficie p-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)] ${colocacionDelAviso}`}
          aria-labelledby="titulo-cookies"
        >
          {/* Título real para quien usa lector de pantalla (puede saltar a
              él), pero oculto a la vista: el aviso tiene que ser compacto
              para no tapar el contenido de la primera pantalla. */}
          <h2 id="titulo-cookies" className="sr-only">
            Preferencias de cookies
          </h2>
          <p className="text-sm leading-5 text-muted">
            Cookies opcionales de medición (Google Analytics y Vercel): solo
            se activan si aceptas.{" "}
            <a
              href={enlaceDePrivacidad}
              className="rounded font-medium text-tinta-2 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
            >
              Más información
            </a>
            .
          </p>
          {/* Etiquetas cortas para que los dos botones quepan en una fila
              en móvil; el nombre accesible completo empieza por el texto
              visible (WCAG 2.5.3). */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decidir(true)}
              aria-label="Aceptar cookies"
              className="btn-secondary h-11 px-5"
            >
              Aceptar
            </button>
            <button
              type="button"
              onClick={() => decidir(false)}
              aria-label="Rechazar cookies"
              className="btn-secondary h-11 px-5"
            >
              Rechazar
            </button>
          </div>
        </aside>
      ) : mostrarBoton ? (
        // `data-relato` lo pone en <html> el relato con scroll de la portada
        // de la web (llamada-scroll.tsx): mientras el escenario está fijo el
        // botón se esconde, porque tapaba la barra de pasos en móvil.
        // Solo el icono: una pastilla con texto ocupaba media esquina en
        // móvil. El nombre accesible y el `title` dicen lo que hace.
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Configurar cookies"
          title="Configurar cookies"
          className={`fixed bottom-4 z-40 h-11 w-11 items-center justify-center rounded-full border border-linea bg-superficie text-tinta-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition duration-200 hover:bg-relleno hover:text-morado [html[data-relato]_&]:pointer-events-none [html[data-relato]_&]:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${colocacionDelBoton}`}
        >
          <Cookie className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}

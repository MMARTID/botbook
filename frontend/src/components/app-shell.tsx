"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useBusiness } from "@/components/providers";
import { useEsMovil } from "@/hooks/use-es-movil";
import { useMinutesWarning } from "@/hooks/use-aviso-de-minutos";
import {
  BarraDePestañas,
  esRutaDePestaña,
  usePorDevolver,
} from "@/components/movil/barra-de-pestanas";
import { AvisoFlotante, useAviso } from "@/components/aviso-flotante";
import { BarraLateral } from "@/components/escritorio/barra-lateral";
import { Buscador, useAtajosDelEscritorio } from "@/components/escritorio/buscador";
import { esPantallaAncha, esPantallaDeTrabajo } from "@/components/escritorio/navegacion";

// Pantallas de cuenta sin el armazón del panel (sin sesión o a medio
// entrar). La landing, los sectores, los planes y las legales viven en la
// web pública (docs/historico/PLAN-APP-DOMINIO.md), no aquí.
const PUBLIC_ROUTES = [
  "/login",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/bienvenida",
  "/bienvenida/niche",
  "/bienvenida/services",
  "/bienvenida/team",
  "/bienvenida/calendar",
  "/auth/google/callback",
  "/auth/entrar",
  "/elegir-plan",
  "/dev/entrar",
];

/** Rutas que se pintan sin barra lateral ni barra inferior. */
export function esRutaSinArmazon(pathname: string) {
  return PUBLIC_ROUTES.includes(pathname);
}

const CLAVE_BARRA_PLEGADA = "alhabla:barra-plegada";
type PreferenciaDeBarra = { trabajo?: boolean; resto?: boolean };

function leerPreferencia(): PreferenciaDeBarra {
  try {
    return JSON.parse(window.localStorage.getItem(CLAVE_BARRA_PLEGADA) ?? "{}") as PreferenciaDeBarra;
  } catch {
    return {};
  }
}

/**
 * Barra lateral plegada o no: por defecto, plegada en las pantallas de
 * trabajo y abierta en el resto. Lo que el dueño elija con el botón se
 * recuerda para ese tipo de pantalla en este navegador.
 */
function useBarraPlegada(pathname: string) {
  const tipo = esPantallaDeTrabajo(pathname) ? "trabajo" : "resto";
  const [preferencia, setPreferencia] = useState<PreferenciaDeBarra>({});
  useEffect(() => setPreferencia(leerPreferencia()), []);
  const plegada = preferencia[tipo] ?? tipo === "trabajo";
  const alternar = useCallback(() => {
    setPreferencia((actual) => {
      const siguiente = { ...actual, [tipo]: !(actual[tipo] ?? tipo === "trabajo") };
      try {
        window.localStorage.setItem(CLAVE_BARRA_PLEGADA, JSON.stringify(siguiente));
      } catch {
        // Sin almacenamiento (navegación privada) vale para esta visita.
      }
      return siguiente;
    });
  }, [tipo]);
  return { plegada, alternar };
}

/**
 * Pantallas de la app móvil que pintan su propia cabecera (CabeceraMovil,
 * con su «‹ Volver»). El resto de rutas del armazón sin pestañas (pago,
 * vuelta de OAuth) llevan la cabecera con la marca.
 */
function tieneCabeceraPropia(pathname: string) {
  return (
    esRutaDePestaña(pathname) ||
    pathname.startsWith("/agente/") ||
    pathname.startsWith("/ajustes/") ||
    pathname.startsWith("/llamadas/") ||
    pathname === "/asistente"
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { business, hasToken } = useBusiness();
  const pathname = usePathname();
  const minutesWarning = useMinutesWarning();
  const conPestañas = esRutaDePestaña(pathname);
  const esMovil = useEsMovil();
  const conArmazon = !PUBLIC_ROUTES.includes(pathname) && !(pathname === "/" && hasToken !== true);
  // La insignia de «por devolver»: en la pestaña Llamadas del móvil y junto a
  // Llamadas en la barra lateral del escritorio.
  const porDevolver = usePorDevolver(hasToken === true && esMovil !== null && conArmazon);
  const { plegada, alternar } = useBarraPlegada(pathname);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const abrirBuscador = useCallback(() => setBuscadorAbierto(true), []);
  const { aviso, avisar, cerrar } = useAviso();
  useAtajosDelEscritorio({ activo: esMovil === false && hasToken === true && conArmazon, onBuscar: abrirBuscador });
  const ancha = esPantallaAncha(pathname);

  if (pathname === "/") {
    if (hasToken === null) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" /></div>;
    if (hasToken === false) return <>{children}</>;
  }
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen bg-white lg:flex">
      <a href="#main-content" className="sr-only z-[80] rounded-[10px] bg-[#0a0a0a] px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar a contenido</a>
      <BarraLateral pathname={pathname} plegada={plegada} onAlternar={alternar} onBuscar={abrirBuscador} porDevolver={porDevolver} />
      <div className="min-w-0 flex-1">
        {/* En móvil cada pantalla trae su cabecera (título grande, «‹ Volver»).
            Solo el chat del Gestor y las rutas sueltas usan una del armazón. */}
        {pathname === "/asistente" ? (
          <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/95 px-2 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
            <Link href="/ajustes" className="flex min-h-11 w-fit items-center gap-0.5 rounded-full pl-1 pr-3 text-base font-semibold text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              Cuenta
            </Link>
          </header>
        ) : !tieneCabeceraPropia(pathname) ? (
          <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <Link href="/" aria-label="Ir al panel de Alhabla" className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
              <BrandMark className="h-9 w-9 shrink-0" />
              <span className="min-w-0"><span className="block text-sm font-bold leading-4 text-[#0a0a0a]">Alhabla</span><span className="block truncate text-xs leading-4 text-muted">{business?.name ?? "Mi negocio"}</span></span>
            </Link>
          </header>
        ) : null}
        {/* Por debajo de lg es la app móvil: una columna de 16 px de margen
            (también en tableta, centrada) para que las cabeceras de pantalla
            puedan llegar de borde a borde con márgenes negativos. */}
        <main
          id="main-content"
          className={`mx-auto w-full max-w-2xl px-4 py-5 ${ancha ? "lg:max-w-none lg:p-0" : "lg:max-w-[90rem] lg:px-10 lg:py-10 lg:pb-10"} ${
            conPestañas ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(2rem+env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </main>
      </div>
      {conPestañas ? (
        <BarraDePestañas pathname={pathname} porDevolver={porDevolver} avisoDeMinutos={minutesWarning !== null} />
      ) : null}
      {esMovil === false ? (
        <Buscador
          abierto={buscadorAbierto}
          onCerrar={() => setBuscadorAbierto(false)}
          timeZone={business?.timezone || "Europe/Madrid"}
          avisar={avisar}
        />
      ) : null}
      {aviso ? <AvisoFlotante aviso={aviso} onClose={cerrar} /> : null}
    </div>
  );
}

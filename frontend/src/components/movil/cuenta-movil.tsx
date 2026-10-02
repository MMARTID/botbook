"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Clock3,
  Cookie,
  CreditCard,
  LifeBuoy,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { getAccountOverview, getBillingSummary } from "@/lib/api";
import { clearAuthTokens } from "@/lib/billing-navigation";
import { plans } from "@/lib/plans";
import { webUrl } from "@/lib/web-url";
import type { Business } from "@/lib/types";
import { BrandMark } from "@/components/brand-mark";
import { abrirPreferenciasDeCookies } from "@/components/google-analytics";
import { CabeceraMovil } from "@/components/movil/cabecera-movil";
import { FilaDeAjuste, GrupoDeFilas, Insignia, RotuloDeGrupo } from "@/components/movil/piezas";
import { SelectorDeTema } from "@/components/selector-de-tema";

/**
 * Pestaña Cuenta de la app móvil: el negocio, el consumo de minutos a la
 * vista y los accesos agrupados. Sustituye a la hoja «Más» y a las
 * pestañas horizontales de Ajustes: cada sección es una fila que abre su
 * pantalla.
 */
export function CuentaMovil({ business }: { business: Business }) {
  const cuenta = useQuery({ queryKey: ["account-overview"], queryFn: getAccountOverview });
  const resumen = useQuery({ queryKey: ["billing-summary"], queryFn: getBillingSummary });
  const facturacion = resumen.data;
  const plan = plans.find((candidato) => candidato.id === facturacion?.effectivePlanId);
  const incluidos = facturacion?.includedMinutes ?? null;
  const usados = facturacion?.consumedMinutes ?? 0;
  const restantes = incluidos != null ? Math.max(0, incluidos - usados) : null;
  const porcentajeRestante = incluidos ? Math.max(0, Math.round((restantes! / incluidos) * 100)) : null;
  const aviso = porcentajeRestante !== null && porcentajeRestante <= 25;

  return (
    <div>
      <CabeceraMovil titulo="Cuenta" subtitulo={cuenta.data?.email ?? "\u00a0"} />

      <section className="panel flex items-center gap-3.5 p-4">
        <BrandMark className="h-11 w-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug text-tinta">{business.name}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted">{cuenta.data?.email ?? "…"}</p>
        </div>
        {cuenta.data ? (
          cuenta.data.googleConnected ? (
            <Insignia tono="exito" icono={Check}>
              Google
            </Insignia>
          ) : (
            <Insignia tono="aviso">Sin verificar</Insignia>
          )
        ) : null}
      </section>

      <Link
        href="/ajustes/facturacion"
        className="panel mt-3 block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-base font-bold text-tinta">{plan ? `Plan ${plan.name}` : "Tu plan"}</span>
          {incluidos != null ? (
            <span className="text-sm tabular-nums text-muted">
              {usados} de {incluidos} min
            </span>
          ) : null}
        </span>
        {incluidos != null ? (
          <>
            <span className="mt-2.5 block h-2 overflow-hidden rounded-full bg-relleno-fuerte" aria-hidden="true">
              <span
                className={`block h-full rounded-full ${aviso ? "bg-aviso-icono" : "bg-morado"}`}
                style={{ width: `${Math.min(100, Math.round((usados / incluidos) * 100))}%` }}
              />
            </span>
            {aviso ? (
              <span className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-aviso">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {restantes === 0 ? "Minutos del plan agotados" : `Te queda un ${porcentajeRestante} % de tus minutos`}
              </span>
            ) : (
              <span className="mt-2.5 block text-[13px] text-muted">
                Te quedan {restantes} {restantes === 1 ? "minuto" : "minutos"} este mes.
              </span>
            )}
          </>
        ) : (
          <span className="mt-1 block text-[13px] text-muted">
            {resumen.isLoading ? "Cargando el consumo…" : "Elige un plan para que tu recepcionista atienda llamadas."}
          </span>
        )}
      </Link>

      <RotuloDeGrupo>Recepcionista</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href="/asistente"
          icono={MessageSquareText}
          titulo="Tu Gestor"
          resumen="Administra el negocio por WhatsApp."
          insignia={<span className="badge-soft px-2 py-px">Beta</span>}
        />
      </GrupoDeFilas>

      <RotuloDeGrupo>Ajustes</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste href="/ajustes/negocio" icono={Building2} titulo="Negocio" resumen="Nombre, dirección y sector." />
        <FilaDeAjuste href="/ajustes/telefono" icono={Smartphone} titulo="Teléfono" resumen="Tu línea, tu recepcionista y tu móvil." />
        <FilaDeAjuste href="/ajustes/seguridad" icono={ShieldCheck} titulo="Seguridad" resumen="Contraseña y eliminación de la cuenta." />
      </GrupoDeFilas>

      <RotuloDeGrupo>Apariencia</RotuloDeGrupo>
      <SelectorDeTema />
      <p className="mt-2 px-1 text-[13px] leading-[1.5] text-muted">
        Con «Sistema», la app se pone en oscuro cuando tu móvil lo está.
      </p>

      <RotuloDeGrupo>Plan</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href="/ajustes/facturacion"
          icono={CreditCard}
          titulo="Plan y facturación"
          resumen={incluidos != null ? `${usados} de ${incluidos} minutos usados` : "Suscripción, facturas y consumo."}
        />
      </GrupoDeFilas>

      <RotuloDeGrupo>Ayuda y legal</RotuloDeGrupo>
      <GrupoDeFilas>
        <FilaDeAjuste
          href={webUrl("/legal/privacidad")}
          externo
          icono={LifeBuoy}
          titulo="Privacidad y datos"
          resumen="Cómo tratamos tus datos y tus derechos."
        />
        {/* En móvil el botón flotante de cookies taparía la barra inferior:
            cambiar la elección vive aquí. */}
        <FilaDeAjuste onClick={abrirPreferenciasDeCookies} icono={Cookie} titulo="Preferencias de cookies" />
      </GrupoDeFilas>

      <button
        type="button"
        onClick={() => {
          clearAuthTokens();
          window.location.assign("/login");
        }}
        className="btn-secondary mt-6 w-full"
      >
        <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
        Cerrar sesión
      </button>
    </div>
  );
}

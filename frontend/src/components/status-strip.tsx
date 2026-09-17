"use client";

import Link from "next/link";
import { AlertTriangle, Check, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { provisionPhoneNumber } from "@/lib/api";
import { OPERATIONAL_TONE, useOperationalStatus, type OperationalTone } from "@/components/operational-status";
import type { Business } from "@/lib/types";

type StatusStripProps = { business: Business; agentActive: boolean };

// Los problemas van primero: en una franja de cuatro señales, el negocio
// necesita ver lo que falla antes que lo que ya funciona solo. Lo que no se
// ha podido comprobar va justo después: no es un fallo, pero tampoco es algo
// que se pueda dar por bueno.
const SEVERITY_RANK: Record<OperationalTone, number> = { error: 0, warning: 1, unknown: 2, waiting: 3, ok: 4 };

/**
 * Traduce el fallo del reintento de compra a algo accionable. El 402 es el
 * caso que más se repite: el número no se puede comprar sin plan activo.
 */
function describeProvisionError(error: unknown): { message: string; href?: string; linkLabel?: string } {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 402) {
    return {
      message: "Tu plan todavía no está activo y sin él no podemos asignarte un número.",
      href: "/ajustes/facturacion",
      linkLabel: "Elegir plan",
    };
  }
  return {
    message: "No hemos podido asignarte el número. Inténtalo otra vez en unos minutos; si sigue fallando, escríbenos a hola@alhabla.ai.",
  };
}

/** Vista completa de la fuente única de salud operativa para el Panel. */
export function StatusStrip({ business, agentActive }: StatusStripProps) {
  const queryClient = useQueryClient();
  const { items, isLoading } = useOperationalStatus(business, agentActive);
  const provisionMutation = useMutation({
    mutationFn: async () => {
      const resultado = await provisionPhoneNumber();
      // La compra puede responder 200 con `success: false` cuando Telnyx la
      // rechaza: sin esto el reintento se daba por bueno, el spinner paraba
      // y el usuario no veía nada distinto en pantalla.
      if (!resultado.success) {
        throw new Error(resultado.error ?? "La compra del número no se completó.");
      }
      return resultado;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["phone-number"] }),
  });

  const needsAttention = items.filter((item) => item.tone === "error" || item.tone === "warning");
  const hasError = items.some((item) => item.tone === "error");
  const unchecked = items.filter((item) => item.tone === "unknown");
  const ordered = [...items].sort((a, b) => SEVERITY_RANK[a.tone] - SEVERITY_RANK[b.tone]);
  const provisionError = provisionMutation.isError ? describeProvisionError(provisionMutation.error) : null;

  // Mientras no hayan contestado teléfono y onboarding no se puede afirmar que
  // todo va bien: un verde prematuro en el primer render es peor que esperar.
  const banner = isLoading
    ? { Icon: Loader2, iconClass: "animate-spin", text: "text-[#52525b]", bg: "bg-[#fafafa]", border: "border-[#e5e5e5]", message: "Comprobando el estado del servicio…" }
    : needsAttention.length === 0 && unchecked.length === 0
      ? { Icon: Check, iconClass: "", text: "text-[#2c7334]", bg: "bg-[#ecf7ec]", border: "border-[#d8efd7]", message: "Todo funcionando correctamente" }
      : hasError
        ? { Icon: AlertTriangle, iconClass: "", text: "text-[#c53030]", bg: "bg-[#fff1f1]", border: "border-[#f5d3d3]", message: needsAttention.length === 1 ? "Un asunto requiere tu atención" : `${needsAttention.length} asuntos requieren tu atención` }
        : needsAttention.length > 0
          ? { Icon: AlertTriangle, iconClass: "", text: "text-[#9f7a15]", bg: "bg-[#fef8e7]", border: "border-[#f0dfa8]", message: needsAttention.length === 1 ? "Un asunto conviene revisarlo" : `${needsAttention.length} asuntos conviene revisarlos` }
          : { Icon: HelpCircle, iconClass: "", text: "text-[#52525b]", bg: "bg-[#fafafa]", border: "border-[#e5e5e5]", message: "No hemos podido comprobar todo el estado. Recarga la página en un momento." };

  return (
    <section aria-label="Estado del servicio" className="panel overflow-hidden p-0">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${banner.bg} ${banner.border}`}>
        <banner.Icon className={`h-4 w-4 shrink-0 ${banner.text} ${banner.iconClass}`} aria-hidden="true" />
        <p className={`text-sm font-semibold ${banner.text}`}>{banner.message}</p>
      </div>
      <ul className="grid grid-cols-1 gap-px bg-[#e5e5e5] sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map((item) => {
          const tone = OPERATIONAL_TONE[item.tone];
          return (
            <li key={item.key} className="flex items-start gap-3 bg-white p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">{item.label}</p>
                <p className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold ${tone.text}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                  <span className="truncate">{item.value}</span>
                </p>
                {item.action ? (
                  "href" in item.action ? (
                    <Link href={item.action.href} className="mt-1.5 inline-flex items-center text-xs font-semibold text-[#6d28d9] underline underline-offset-2 transition hover:text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">{item.action.label}</Link>
                  ) : (
                    <>
                      <button type="button" onClick={() => provisionMutation.mutate()} disabled={provisionMutation.isPending} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6d28d9] underline underline-offset-2 transition hover:text-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
                        {provisionMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}{item.action.label}
                      </button>
                      {/* Sin esto el reintento era mudo: el spinner giraba medio
                          segundo y la pantalla se quedaba exactamente igual. */}
                      {provisionError ? (
                        <p className="mt-1.5 text-xs leading-5 text-[#c53030]" role="alert">
                          {provisionError.message}{" "}
                          {provisionError.href ? (
                            <Link href={provisionError.href} className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
                              {provisionError.linkLabel}
                            </Link>
                          ) : null}
                        </p>
                      ) : null}
                    </>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

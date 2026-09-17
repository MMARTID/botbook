"use client";

import Link from "next/link";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { provisionPhoneNumber } from "@/lib/api";
import { OPERATIONAL_TONE, useOperationalStatus, type OperationalTone } from "@/components/operational-status";
import type { Business } from "@/lib/types";

type StatusStripProps = { business: Business; agentActive: boolean };

// Los problemas van primero: en una franja de cuatro señales, el negocio
// necesita ver lo que falla antes que lo que ya funciona solo.
const SEVERITY_RANK: Record<OperationalTone, number> = { error: 0, warning: 1, waiting: 2, ok: 3 };

/** Vista completa de la fuente única de salud operativa para el Panel. */
export function StatusStrip({ business, agentActive }: StatusStripProps) {
  const queryClient = useQueryClient();
  const { items } = useOperationalStatus(business, agentActive);
  const provisionMutation = useMutation({
    mutationFn: provisionPhoneNumber,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["phone-number"] }),
  });

  const needsAttention = items.filter((item) => item.tone === "error" || item.tone === "warning");
  const hasError = items.some((item) => item.tone === "error");
  const ordered = [...items].sort((a, b) => SEVERITY_RANK[a.tone] - SEVERITY_RANK[b.tone]);

  const banner = needsAttention.length === 0
    ? { Icon: Check, text: "text-[#2c7334]", bg: "bg-[#ecf7ec]", border: "border-[#d8efd7]", message: "Todo funcionando correctamente" }
    : hasError
      ? { Icon: AlertTriangle, text: "text-[#c53030]", bg: "bg-[#fff1f1]", border: "border-[#f5d3d3]", message: needsAttention.length === 1 ? "Un asunto requiere tu atención" : `${needsAttention.length} asuntos requieren tu atención` }
      : { Icon: AlertTriangle, text: "text-[#9f7a15]", bg: "bg-[#fef8e7]", border: "border-[#f0dfa8]", message: needsAttention.length === 1 ? "Un asunto conviene revisarlo" : `${needsAttention.length} asuntos conviene revisarlos` };

  return (
    <section aria-label="Estado del servicio" className="panel overflow-hidden p-0">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${banner.bg} ${banner.border}`}>
        <banner.Icon className={`h-4 w-4 shrink-0 ${banner.text}`} aria-hidden="true" />
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
                    <button type="button" onClick={() => provisionMutation.mutate()} disabled={provisionMutation.isPending} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#6d28d9] underline underline-offset-2 transition hover:text-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
                      {provisionMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}{item.action.label}
                    </button>
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

"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { OPERATIONAL_TONE, useOperationalStatus, type OperationalTone } from "@/components/operational-status";
import type { Business } from "@/lib/types";

// Los problemas van primero, igual que en la franja completa del Panel
// (status-strip.tsx): una sola fuente de criterio de orden para las mismas
// señales, aquí en su versión compacta.
const SEVERITY_RANK: Record<OperationalTone, number> = { error: 0, warning: 1, unknown: 2, waiting: 3, ok: 4 };

/** Versión compacta del mismo estado que se desarrolla en el Panel. */
export function AgentOperationalSummary({ business, agentActive }: { business: Business; agentActive: boolean }) {
  const { items } = useOperationalStatus(business, agentActive);
  const needsAttention = items.filter((item) => item.tone === "error" || item.tone === "warning");
  const ordered = [...items].sort((a, b) => SEVERITY_RANK[a.tone] - SEVERITY_RANK[b.tone]);

  return (
    <section className="rounded-3xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5" aria-labelledby="agent-status-title">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]"><Activity className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="agent-status-title" className="text-base font-semibold text-[#0a0a0a]">Estado de la recepción</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{needsAttention.length ? "Hay ajustes que requieren atención antes de que la recepción esté completa." : "La recepción está preparada para atender llamadas."}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {ordered.map((item) => {
          const tone = OPERATIONAL_TONE[item.tone];
          return <li key={item.key} className="flex min-w-0 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-xs text-muted">{item.label}</span><span className={`block truncate text-sm font-semibold ${tone.text}`}>{item.value}</span></span>
            {item.action && "href" in item.action ? <Link href={item.action.href} className="shrink-0 text-xs font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">Abrir</Link> : null}
          </li>;
        })}
      </ul>
    </section>
  );
}

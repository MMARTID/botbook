"use client";

import { useQuery } from "@tanstack/react-query";
import { useBusiness } from "@/components/providers";
import { getBillingSummary } from "@/lib/api";

/**
 * Aviso de consumo: cuando queda un 25% o menos de los minutos del plan,
 * el menú enseña un globo advirtiendo de que el excedente se factura como
 * minutos extra. Devuelve null mientras no haya motivo de aviso.
 */
export function useMinutesWarning() {
  const { hasToken } = useBusiness();
  const summary = useQuery({
    queryKey: ["billing-summary"],
    queryFn: getBillingSummary,
    enabled: hasToken === true,
  });

  const data = summary.data;
  if (!data?.includedMinutes || data.includedMinutes <= 0) return null;

  const remaining = data.includedMinutes - data.consumedMinutes;
  const remainingPct = Math.max(0, Math.round((remaining / data.includedMinutes) * 100));
  if (remainingPct > 25) return null;

  const extraPrice = data.extraMinuteCents != null
    ? `${(data.extraMinuteCents / 100).toFixed(2).replace(".", ",")}€/min`
    : null;

  return {
    exhausted: remaining <= 0,
    remainingPct,
    remainingMinutes: Math.max(0, remaining),
    extraPrice,
  };
}

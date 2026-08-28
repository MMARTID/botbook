"use client";

import { useEffect, useState } from "react";
import { calculateRoiImpact, getActiveRoiContext } from "@/lib/roi-context";

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function PlansHeadline() {
  const [title, setTitle] = useState<string>("Convierte llamadas en reservas, sin complicarte.");

  useEffect(() => {
    const ctx = getActiveRoiContext();
    if (!ctx) return;
    const impact = calculateRoiImpact(ctx);
    const calls = impact.monthlyAppointments;
    const value = currencyFormatter.format(impact.monthlyOpportunity);
    const callsText = `${calls} ${calls === 1 ? "llamada mensual" : "llamadas mensuales"}`;
    setTitle(`Convierte esas ${callsText} en reservas por valor de ${value}, sin complicarte`);
  }, []);

  return (
    <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight md:text-6xl">
      {title}
    </h1>
  );
}

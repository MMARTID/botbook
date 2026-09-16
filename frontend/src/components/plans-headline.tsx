"use client";

import { useEffect, useState } from "react";
import { calculateRoiImpact, getActiveRoiContext } from "@/lib/roi-context";

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const GENERIC_TITLE = "Convierte llamadas en reservas, sin complicarte.";

export function PlansHeadline() {
  const [title, setTitle] = useState<string>(GENERIC_TITLE);

  useEffect(() => {
    const ctx = getActiveRoiContext();
    if (!ctx) return;
    const impact = calculateRoiImpact(ctx);
    const calls = impact.monthlyAppointments;
    const value = currencyFormatter.format(impact.monthlyOpportunity);
    const callsText = `${calls} ${calls === 1 ? "llamada al mes" : "llamadas al mes"}`;
    setTitle(`Convierte esas ${callsText} en ${value} de reservas, sin complicarte.`);
  }, []);

  // El titular personalizado casi dobla la longitud del genérico: al mismo
  // cuerpo llegaba a seis líneas en móvil y empujaba los planes fuera de la
  // vista. Un paso menos en pantallas pequeñas lo deja en tres o cuatro.
  const personalized = title !== GENERIC_TITLE;

  return (
    <h1
      className={`mt-5 text-balance font-black leading-tight tracking-tight md:text-6xl ${
        personalized ? "text-3xl sm:text-4xl" : "text-4xl"
      }`}
    >
      {title}
    </h1>
  );
}

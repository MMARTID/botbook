"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { WeeklyStats } from "@/lib/types";
import { SectionCard } from "@/components/section-card";

type WeeklySummaryProps = {
  week: WeeklyStats;
};

/**
 * Qué ha conseguido la recepcionista en los últimos 7 días. Ventana móvil, no
 * semana natural: un lunes por la mañana la semana natural compara dos días
 * contra siete y siempre parece un desplome.
 */
export function WeeklySummary({ week }: WeeklySummaryProps) {
  // Conversión sobre conversaciones (llamadas + chats) que acabaron con
  // cita, aunque luego se moviera o cancelara. Dividir citas vivas entre
  // llamadas hacía caer el porcentaje cuando un cliente cambiaba su cita por
  // WhatsApp (cancelar + reservar: 2 conversaciones, 1 cita → 50 %).
  const conversaciones = week.calls + week.chats;
  const conversion =
    conversaciones > 0
      ? Math.round((week.conversationsWithBooking / conversaciones) * 100)
      : null;

  return (
    <SectionCard id="weekly-summary" title="Últimos 7 días">
      <div className="mt-4 grid gap-4 sm:mt-5 sm:grid-cols-3 sm:gap-6">
        <div className="sm:col-span-1">
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-[#0a0a0a] sm:text-5xl">
            {week.bookings}
          </p>
          <p className="mt-1 text-sm font-medium text-[#0a0a0a]">
            {week.bookings === 1 ? "cita reservada" : "citas reservadas"}
          </p>
          <Comparison current={week.bookings} previous={week.previous.bookings} unit="cita" />
        </div>

        <div className="sm:col-span-1 sm:border-l sm:border-[#e5e5e5] sm:pl-6">
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-[#0a0a0a] sm:text-3xl">
            {week.calls}
          </p>
          <p className="mt-1 text-sm font-medium text-[#0a0a0a]">
            {week.calls === 1 ? "llamada atendida" : "llamadas atendidas"}
            {week.chats > 0
              ? ` y ${week.chats === 1 ? "1 chat" : `${week.chats} chats`} de WhatsApp`
              : ""}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {conversion !== null
              ? `${conversion}% terminaron en cita.`
              : "Aún no ha entrado ninguna llamada."}
          </p>
        </div>

        <div className="sm:col-span-1 sm:border-l sm:border-[#e5e5e5] sm:pl-6">
          {week.revenueCents !== null ? (
            <>
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-[#0a0a0a] sm:text-3xl">
                {formatPrice(week.revenueCents)}
              </p>
              <p className="mt-1 text-sm font-medium text-[#0a0a0a]">en citas reservadas</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                {week.revenueIsPartial
                  ? "Estimación a la baja: solo suma los servicios que tienen precio."
                  : "Según el precio de los servicios reservados."}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-[#0a0a0a]">¿Cuánto has recuperado?</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Pon precio a tus servicios y el panel te dirá cuánto valen las citas que entran solas.
              </p>
              <Link
                href="/agente?section=services"
                className="zona-tactil mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
              >
                Añadir precios
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/**
 * Diferencia absoluta, nunca porcentaje: pasar de 2 a 3 citas no es «+50 %»
 * para una peluquería, es «una cita más».
 */
function Comparison({
  current,
  previous,
  unit,
}: {
  current: number;
  previous: number;
  unit: string;
}) {
  if (previous === 0 && current === 0) {
    return <p className="mt-2 text-sm leading-6 text-muted">Sin actividad estos días.</p>;
  }

  if (previous === 0) {
    return (
      <p className="mt-2 text-sm leading-6 text-muted">
        Es tu primera semana con {current === 1 ? `una ${unit}` : `${unit}s`}.
      </p>
    );
  }

  const delta = current - previous;

  if (delta === 0) {
    return <p className="mt-2 text-sm leading-6 text-muted">Igual que la semana pasada.</p>;
  }

  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = delta > 0 ? "text-[#2c7334]" : "text-[#806012]";
  const magnitude = Math.abs(delta);

  return (
    <p className={`mt-2 flex items-center gap-1 text-sm font-medium leading-6 ${tone}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {magnitude} {magnitude === 1 ? unit : `${unit}s`} {delta > 0 ? "más" : "menos"} que la semana
      pasada
    </p>
  );
}

"use client";

import { useComingSoonBubble } from "@/components/coming-soon-bubble";
import type { PlanId } from "@/lib/types";

type PlanSelectionLinkProps = {
  planId: PlanId;
  planName: string;
  featured: boolean;
  preselected?: boolean;
};

// Registro público desactivado mientras se siguen haciendo cambios — este es
// el único botón que de verdad lleva a /register o /checkout (el resto de
// CTAs de la landing navegan con normalidad hasta aquí), así que es el único
// punto que hace falta bloquear. La navegación real (savePendingPlan +
// /register o /checkout según hasAuthToken) sigue en el historial de git
// (commit anterior a este) para restaurarla cuando se reactive el registro.
export function PlanSelectionLink({ planName, featured, preselected = false }: PlanSelectionLinkProps) {
  const { openAt, bubble } = useComingSoonBubble();

  return (
    <>
      <button
        type="button"
        onClick={openAt}
        className={`mt-8 inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition hover:-translate-y-0.5 ${
          featured
            ? "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"
            : preselected
              ? "bg-[#0a0a0a] text-white hover:bg-[#262626]"
              : "border border-[#0a0a0a] bg-white text-[#0a0a0a] hover:bg-[#fafafa]"
        }`}
      >
        Elegir {planName}
      </button>
      {bubble}
    </>
  );
}

import "./_sin-movimiento";
import * as React from "react";
import { OnboardingChecklist } from "alhabla-ui";

/**
 * No recibe props: lee `["onboarding-state"]` de React Query. La preview usa el
 * estado sembrado (horario y servicios hechos, equipo y calendario pendientes),
 * que es el caso interesante — ni vacío ni completo.
 */
export function MitadCompletado() {
  return (
    <div className="w-full max-w-2xl">
      <OnboardingChecklist />
    </div>
  );
}

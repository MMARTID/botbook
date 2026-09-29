import "./_sin-movimiento";
import * as React from "react";
import { PlanSelectionLink } from "alhabla-web-ui";

// Las tarjetas replican las de PlansWithRoi (web/src/components/
// plans-with-roi.tsx) y los precios los de web/src/lib/plans.ts.

/** Plan normal: botón blanco con borde dentro de su tarjeta de precio. */
export function Estandar() {
  return (
    <div className="w-full max-w-xs rounded-3xl border border-[#e5e5e5] bg-white p-6">
      <p className="text-2xl font-bold text-[#0a0a0a]">Inicio</p>
      <p className="mt-6 text-5xl font-black tracking-tight text-[#0a0a0a]">
        69€<span className="text-base font-medium text-[#71717a]">/mes</span>
      </p>
      <PlanSelectionLink planId="inicio" planName="Inicio" featured={false} />
    </div>
  );
}

/**
 * `featured`: el plan recomendado (Pro) va en morado sobre la tarjeta negra.
 * Su nota es blanca translúcida: sobre una tarjeta blanca no se leería.
 */
export function Destacado() {
  return (
    <div className="w-full max-w-xs rounded-3xl bg-[#0a0a0a] p-6">
      <span className="inline-flex items-center rounded-full bg-[#7c3aed] px-3 py-1 text-xs font-semibold text-white">
        Recomendado
      </span>
      <p className="mt-4 text-2xl font-bold text-white">Pro</p>
      <p className="mt-6 text-5xl font-black tracking-tight text-white">
        149€<span className="text-base font-medium text-white/60">/mes</span>
      </p>
      <PlanSelectionLink planId="pro" planName="Pro" featured />
    </div>
  );
}

/** `preselected`: se llega a /planes con el plan ya elegido en la URL. */
export function Preseleccionado() {
  return (
    <div className="w-full max-w-xs rounded-3xl border border-[#8b5cf6] bg-white p-6 ring-2 ring-[#8b5cf6]/25">
      <span className="badge-soft">El que has elegido</span>
      <p className="mt-4 text-2xl font-bold text-[#0a0a0a]">Scale</p>
      <p className="mt-6 text-5xl font-black tracking-tight text-[#0a0a0a]">
        299€<span className="text-base font-medium text-[#71717a]">/mes</span>
      </p>
      <PlanSelectionLink
        planId="scale"
        planName="Scale"
        featured={false}
        preselected
      />
    </div>
  );
}

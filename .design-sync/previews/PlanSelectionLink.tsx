import "./_sin-movimiento";
import * as React from "react";
import { PlanSelectionLink } from "alhabla-ui";

/** Plan normal: enlace secundario dentro de su tarjeta de precio. */
export function Estandar() {
  return (
    <div className="panel w-full max-w-xs p-6">
      <p className="text-sm font-semibold text-[#0a0a0a]">Inicio</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-[#0a0a0a]">
        49 €<span className="text-sm font-medium text-muted">/mes</span>
      </p>
      <div className="mt-5">
        <PlanSelectionLink planId="inicio" planName="Inicio" featured={false} />
      </div>
    </div>
  );
}

/** `featured`: el plan recomendado usa el tratamiento sólido de la tarjeta. */
export function Destacado() {
  return (
    <div className="panel w-full max-w-xs border-[#8b5cf6] p-6">
      <span className="badge-soft">Recomendado</span>
      <p className="mt-3 text-sm font-semibold text-[#0a0a0a]">Pro</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-[#0a0a0a]">
        99 €<span className="text-sm font-medium text-muted">/mes</span>
      </p>
      <div className="mt-5">
        <PlanSelectionLink planId="pro" planName="Pro" featured />
      </div>
    </div>
  );
}

/** `preselected`: se llega desde la landing con el plan ya elegido. */
export function Preseleccionado() {
  return (
    <div className="panel w-full max-w-xs p-6">
      <p className="text-sm font-semibold text-[#0a0a0a]">Scale</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-[#0a0a0a]">
        199 €<span className="text-sm font-medium text-muted">/mes</span>
      </p>
      <div className="mt-5">
        <PlanSelectionLink
          planId="scale"
          planName="Scale"
          featured={false}
          preselected
        />
      </div>
    </div>
  );
}

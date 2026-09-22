"use client";

import { MarcoDeAjustes } from "@/components/ajustes/marco-de-ajustes";
import { SeccionNegocio } from "@/components/ajustes/seccion-negocio";

export default function AjustesNegocioPage() {
  return (
    <MarcoDeAjustes seccion="/ajustes/negocio">
      <SeccionNegocio />
    </MarcoDeAjustes>
  );
}

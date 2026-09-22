"use client";

import { MarcoDeAjustes } from "@/components/ajustes/marco-de-ajustes";
import { SeccionSeguridad } from "@/components/ajustes/seccion-seguridad";

export default function AjustesSeguridadPage() {
  return (
    <MarcoDeAjustes seccion="/ajustes/seguridad">
      <SeccionSeguridad />
    </MarcoDeAjustes>
  );
}

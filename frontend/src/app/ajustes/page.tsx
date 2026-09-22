"use client";

import { MarcoDeAjustes } from "@/components/ajustes/marco-de-ajustes";
import { SeccionCuenta } from "@/components/ajustes/seccion-cuenta";

export default function AjustesCuentaPage() {
  return (
    <MarcoDeAjustes seccion="/ajustes">
      <SeccionCuenta />
    </MarcoDeAjustes>
  );
}

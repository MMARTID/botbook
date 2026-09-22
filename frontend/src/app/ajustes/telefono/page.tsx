"use client";

import {
  MarcoDeAjustes,
  useAjustes,
} from "@/components/ajustes/marco-de-ajustes";
import { AjustesTelefono } from "@/components/ajustes-telefono";

function Telefono() {
  const { business, hasToken } = useAjustes();
  return <AjustesTelefono business={business} hasToken={hasToken} />;
}

export default function AjustesTelefonoPage() {
  return (
    <MarcoDeAjustes seccion="/ajustes/telefono">
      <Telefono />
    </MarcoDeAjustes>
  );
}

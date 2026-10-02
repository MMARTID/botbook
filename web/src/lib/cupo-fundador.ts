"use client";

import { useEffect, useState } from "react";
import { getCupoDeFundador, type CupoDeFundador } from "@/lib/api";

// Una sola petición por visita aunque la pidan las tres tarjetas y el aviso.
let peticion: Promise<CupoDeFundador | null> | null = null;

function pedirCupo() {
  if (!peticion) {
    peticion = getCupoDeFundador().catch(() => {
      // Sin respuesta no se enseña el descuento (nunca uno que quizá ya no
      // existe); la siguiente página lo vuelve a intentar.
      peticion = null;
      return null;
    });
  }
  return peticion;
}

/**
 * El cupo de fundador si todavía quedan plazas; `null` mientras carga, si
 * falla o si ya se agotó. Así la web vuelve sola al precio normal el día que
 * entra el negocio número 15, sin tocar nada a mano.
 */
export function useCupoDeFundador() {
  const [cupo, setCupo] = useState<CupoDeFundador | null>(null);

  useEffect(() => {
    let vivo = true;
    void pedirCupo().then((respuesta) => {
      if (vivo) setCupo(respuesta);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return cupo?.disponible && cupo.restantes > 0 ? cupo : null;
}

/** Solo para los tests: olvida la petición compartida. */
export function reiniciarCupoDeFundador() {
  peticion = null;
}

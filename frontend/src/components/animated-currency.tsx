"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/**
 * Hace legible la relación causa-efecto de la calculadora: el importe cambia
 * con inercia breve después de mover un control, sin retrasar ni falsificar el
 * valor real que se usa en el CTA.
 */
export function AnimatedCurrency({ value }: { value: number }) {
  const reducedMotion = useReducedMotion() === true;
  const previousValue = useRef(value);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (reducedMotion) {
      previousValue.current = value;
      setDisplayValue(value);
      return;
    }

    const controls = animate(previousValue.current, value, {
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplayValue(Math.round(latest)),
      onComplete: () => setDisplayValue(value),
    });
    previousValue.current = value;

    return () => controls.stop();
  }, [reducedMotion, value]);

  return (
    <>
      <span aria-hidden="true">{currencyFormatter.format(displayValue)}</span>
      <span className="sr-only">{currencyFormatter.format(value)}</span>
    </>
  );
}

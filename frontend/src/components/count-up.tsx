"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Aísla el primer número de una cifra (`78%`, `600M€`, `26.000`, `45-65€`…) en
 * prefijo/número/sufijo para poder animar solo la parte numérica y mantener el
 * resto tal cual. Cifras sin ningún dígito (o con valor 0) no son animables.
 */
function parseCountable(raw: string) {
  const match = raw.match(/[\d][\d.,]*/);
  if (!match || match.index === undefined) {
    return null;
  }

  const prefix = raw.slice(0, match.index);
  const suffix = raw.slice(match.index + match[0].length);
  const target = Number(match[0].replace(/[.,]/g, ""));

  if (!Number.isFinite(target) || target <= 0) {
    return null;
  }

  return { prefix, suffix, target };
}

export function CountUp({
  value,
  duration = 1.4,
  delay = 0,
}: {
  value: string;
  duration?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const reducedMotion = useReducedMotion() === true;
  const parsed = parseCountable(value);

  const [display, setDisplay] = useState(
    reducedMotion || !parsed ? value : `${parsed.prefix}0${parsed.suffix}`
  );

  useEffect(() => {
    if (!parsed || reducedMotion || !isInView) {
      return;
    }

    const controls = animate(0, parsed.target, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(latest) {
        setDisplay(`${parsed.prefix}${Math.round(latest).toLocaleString("es-ES")}${parsed.suffix}`);
      },
      onComplete() {
        setDisplay(value);
      },
    });

    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInView, reducedMotion]);

  return <span ref={ref}>{display}</span>;
}

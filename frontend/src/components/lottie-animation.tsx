"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LottiePlayer = dynamic(() => import("./lottie-player"), {
  ssr: false,
});

/**
 * Animación Lottie decorativa servida desde `public`. Las que usamos son
 * cuadradas: `aspect-square` reserva el hueco mientras carga y el ancho lo
 * fija el `className`. Respeta `prefers-reduced-motion` quedándose en el
 * primer fotograma.
 */
export function LottieAnimation({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    setMounted(true);
    const onChange = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div className={`aspect-square ${className ?? ""}`} aria-hidden="true">
      {mounted ? <LottiePlayer src={src} autoplay={!reducedMotion} /> : null}
    </div>
  );
}

"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

import { useMovimientoReducido } from "@/hooks/use-movimiento-reducido";

export function Reveal({
  children,
  delay = 0,
  y = 22,
  className,
  id,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  id?: string;
}) {
  // El HTML del servidor sale siempre oculto y desplazado; con movimiento
  // reducido se enseña de golpe al montar, sin esperar a entrar en pantalla.
  // `initial` solo cuenta al montar: cambiarlo después no haría nada.
  const reducir = useMovimientoReducido();

  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, y }}
      animate={reducir ? { opacity: 1, y: 0 } : undefined}
      whileInView={reducir ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={
        reducir
          ? { duration: 0 }
          : { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {children}
    </motion.div>
  );
}

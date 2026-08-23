"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

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
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      id={id}
      className={className}
      initial={reducedMotion ? undefined : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

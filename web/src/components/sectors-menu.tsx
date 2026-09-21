"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { nicheLinks } from "@/lib/niche-landings";

/**
 * Desplegable "Sectores" de la cabecera: antes el header no tenía ninguna
 * entrada que llevara a las 5 landings de nicho (solo aparecían como
 * tarjetas a media portada). Enlaces reales, no anclas — sirven de
 * navegación y de enlazado interno para SEO.
 */
export function SectorsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="sectores-menu"
        className="enlace-nav inline-flex items-center gap-1"
      >
        Sectores
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          id="sectores-menu"
          role="menu"
          aria-label="Sectores"
          className="absolute left-1/2 top-full z-50 mt-3 w-60 -translate-x-1/2 rounded-2xl border border-[#e5e5e5] bg-white p-2 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.35)]"
        >
          {nicheLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex h-11 items-center rounded-xl px-3 text-sm font-medium text-[#3f3f46] transition duration-200 hover:bg-[#f3eeff] hover:text-[#0a0a0a]"
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

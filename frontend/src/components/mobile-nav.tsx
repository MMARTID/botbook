"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { ComingSoonLink } from "@/components/coming-soon-link";

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

const SECTION_LINKS = [
  { href: "#por-que", label: "Por qué" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
] as const;

export function MobileNav({ niche }: { niche?: string }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const plansHref = buildPlansHref(niche);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // El menú se cierra con Escape y tocando fuera. Sin esto, en móvil quedaba
  // abierto flotando sobre el contenido mientras la página seguía desplazándose.
  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const closeAndRestoreFocus = () => {
      setIsMenuOpen(false);
      toggleRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestoreFocus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  return (
    <div ref={containerRef} className="flex items-center gap-2 md:hidden">
      <ComingSoonLink href={plansHref} className="btn-primary h-11 px-4 text-sm">
        Empezar
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ComingSoonLink>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setIsMenuOpen((open) => !open)}
        aria-expanded={isMenuOpen}
        aria-controls="mobile-menu"
        aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#0a0a0a] transition duration-200 hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
      >
        {isMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
      </button>

      {isMenuOpen ? (
        <nav
          id="mobile-menu"
          aria-label="Navegación móvil"
          className="absolute left-0 right-0 top-full border-t border-[#e5e5e5] bg-white px-4 py-4"
        >
          <div className="flex flex-col gap-1.5">
            {SECTION_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                onClick={() => setIsMenuOpen(false)}
                className="flex h-11 items-center rounded-full px-3 text-sm font-medium text-[#3f3f46] transition duration-200 hover:bg-[#f3eeff] hover:text-[#0a0a0a]"
              >
                {label}
              </a>
            ))}
            <ComingSoonLink
              href="/login"
              onClick={() => setIsMenuOpen(false)}
              className="flex h-11 items-center rounded-full px-3 text-sm font-medium text-[#3f3f46] transition duration-200 hover:bg-[#f3eeff] hover:text-[#0a0a0a]"
            >
              Iniciar sesión
            </ComingSoonLink>
            <ComingSoonLink
              href={plansHref}
              onClick={() => setIsMenuOpen(false)}
              className="btn-primary mt-1.5 justify-center"
            >
              Empezar ahora
            </ComingSoonLink>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

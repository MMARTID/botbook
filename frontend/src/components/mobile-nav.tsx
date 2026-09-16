"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

const VERTICAL_SECTION_LINKS = [
  { href: "#por-que", label: "Por qué" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
] as const;

const MAIN_SECTION_LINKS = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#sectores", label: "Para tu negocio" },
] as const;

export function MobileNav({ niche, variant = "vertical" }: { niche?: string; variant?: "main" | "vertical" }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const plansHref = buildPlansHref(niche);
  const sectionLinks = variant === "main" ? MAIN_SECTION_LINKS : VERTICAL_SECTION_LINKS;
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
      <Link href={plansHref} className="btn-primary h-11 px-4 text-sm">
        Empezar
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
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
        <>
          {/* Fondo que cierra al tocar fuera y contiene visualmente el menú:
              antes el panel solo se posicionaba `absolute` respecto a su
              contenedor en el flujo normal, así que un scroll programático (o
              de accesibilidad, que `overflow:hidden` en el body no bloquea)
              podía desincronizarlo del contenido de debajo. */}
          <div
            className="fixed inset-0 z-40 bg-[#0a0a0a]/20"
            aria-hidden="true"
            onClick={() => setIsMenuOpen(false)}
          />
          <nav
            id="mobile-menu"
            aria-label="Navegación móvil"
            aria-modal="true"
            className="fixed inset-x-0 top-16 z-50 max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-[#e5e5e5] bg-white px-4 py-4 shadow-[0_16px_36px_-24px_rgba(0,0,0,0.35)]"
          >
          <div className="flex flex-col gap-1.5">
            {sectionLinks.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                onClick={() => setIsMenuOpen(false)}
                className="flex h-11 items-center rounded-full px-3 text-sm font-medium text-[#3f3f46] transition duration-200 hover:bg-[#f3eeff] hover:text-[#0a0a0a]"
              >
                {label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setIsMenuOpen(false)}
              className="flex h-11 items-center rounded-full px-3 text-sm font-medium text-[#3f3f46] transition duration-200 hover:bg-[#f3eeff] hover:text-[#0a0a0a]"
            >
              Iniciar sesión
            </Link>
            <Link
              href={plansHref}
              onClick={() => setIsMenuOpen(false)}
              className="btn-primary mt-1.5 justify-center"
            >
              Empezar ahora
            </Link>
          </div>
          </nav>
        </>
      ) : null}
    </div>
  );
}

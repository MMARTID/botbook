"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

function buildPlansHref(niche?: string) {
  return niche ? `/planes?niche=${encodeURIComponent(niche)}` : "/planes";
}

export function MobileNav({ niche }: { niche?: string }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const plansHref = buildPlansHref(niche);

  return (
    <div className="flex items-center gap-2 md:hidden">
      <Link href={plansHref} className="btn-primary h-10 px-3 text-xs sm:px-4 sm:text-sm">
        Empezar
        <ArrowRight className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={() => setIsMenuOpen((open) => !open)}
        aria-expanded={isMenuOpen}
        aria-controls="mobile-menu"
        aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d2dacd] bg-white/95 text-[#344038] transition hover:bg-[#f4f6f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9dbb55]"
      >
        {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {isMenuOpen ? (
        <nav
          id="mobile-menu"
          aria-label="Navegación móvil"
          className="absolute left-0 right-0 top-full border-t border-white/60 bg-[#f8faf5]/95 px-4 py-4 backdrop-blur-xl"
        >
          <div className="flex flex-col gap-2">
            <a
              href="#como-funciona"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#344038] transition hover:bg-[#eef6dc] hover:text-[#1e2b22]"
            >
              Cómo funciona
            </a>
            <a
              href="#calculadora"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#344038] transition hover:bg-[#eef6dc] hover:text-[#1e2b22]"
            >
              Calculadora
            </a>
            <a
              href="#precios"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#344038] transition hover:bg-[#eef6dc] hover:text-[#1e2b22]"
            >
              Precios
            </a>
            <Link
              href="/login"
              onClick={() => setIsMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#344038] transition hover:bg-[#eef6dc] hover:text-[#1e2b22]"
            >
              Iniciar sesión
            </Link>
            <Link
              href={plansHref}
              onClick={() => setIsMenuOpen(false)}
              className="btn-primary mt-1 h-11 justify-center"
            >
              Empezar ahora
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

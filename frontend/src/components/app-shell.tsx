"use client";

import Link from "next/link";
import { useBusiness } from "@/components/providers";
import { LogOut, Activity, Settings, LayoutDashboard, ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { business, hasToken } = useBusiness();
  const pathname = usePathname();
  const publicRoutes = [
    "/landing",
    "/peluqueria",
    "/centro-de-estetica",
    "/salon-de-unas",
    "/barberia",
    "/fisioterapia",
    "/login",
    "/register",
    "/register/business",
    "/register/business/niche",
    "/register/business/services",
    "/planes",
    "/auth/google/callback",
    "/legal/privacidad",
    "/legal/aviso-legal",
  ];

  if (pathname === "/") {
    if (hasToken === null) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#405115]" />
        </div>
      );
    }
    if (hasToken === false) {
      return <>{children}</>;
    }
  }

  if (publicRoutes.includes(pathname)) {
    return <>{children}</>;
  }

  const navItems = [
    { href: "/", label: "Panel", icon: LayoutDashboard },
    { href: "/ajustes", label: "Ajustes", icon: Settings },
    { href: "/ajustes/facturacion", label: "Facturación", icon: CreditCard },
  ];
  const isSettingsPage = pathname.startsWith("/ajustes");

  const renderNavLink = ({ href, label, icon: Icon }: (typeof navItems)[number]) => {
    const isActive = href === "/"
      ? pathname === href
      : href === "/ajustes"
        ? pathname === href
        : pathname.startsWith(href);

    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? "page" : undefined}
        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9dbb55] md:h-9 md:px-3 ${
          isActive
            ? "border-[#cfe1ae] bg-[#eef6dc] text-[#405115]"
            : "border-[#e4e8df] bg-white text-[#344038] hover:bg-[#f6f8f2]"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      {isSettingsPage ? (
        <header className="absolute left-3 top-3 z-50 sm:hidden">
          <Link
            href="/"
            aria-label="Volver al panel"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dfe6da] bg-white/90 text-[#344038] shadow-[0_8px_20px_rgba(30,43,34,0.12)] backdrop-blur-md transition duration-200 hover:bg-white active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#9dbb55] focus:ring-offset-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </header>
      ) : null}

      <header className={`sticky top-0 z-50 border-b border-white/60 bg-[#f8faf5]/80 backdrop-blur-xl ${isSettingsPage ? "hidden sm:block" : ""}`}>
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3 sm:h-[4.5rem]">
            <Link href="/" aria-label="Ir al panel de BotBook" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <BrandMark className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
              <div className="min-w-0">
                <p className="text-base font-semibold leading-5 text-[#1e2b22]">BotBook</p>
                <p className="truncate text-xs leading-4 text-muted sm:text-sm">
                  {business?.name ?? "Mi Negocio"}
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-2 md:flex" aria-label="Navegación principal">
              {navItems.map(renderNavLink)}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#eef6dc] px-2.5 text-xs font-semibold text-[#405115] ring-1 ring-inset ring-[#d7e9c5] sm:px-3">
                <Activity className="h-3 w-3" />
                {business?.active ? "Activo" : "Inactivo"}
              </span>
              <button
                onClick={() => {
                  window.localStorage.removeItem('botbook_token');
                  window.location.href = '/login';
                }}
                aria-label="Cerrar sesión"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e4e8df] bg-white text-[#344038] transition hover:bg-[#f6f8f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9dbb55] sm:h-11 sm:w-auto sm:gap-2 sm:px-4 sm:text-sm sm:font-medium"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-2 overflow-x-auto pb-3 md:hidden" aria-label="Navegación principal">
            {navItems.map(renderNavLink)}
          </nav>
        </div>
      </header>

      <main className={`mx-auto w-full max-w-7xl flex-1 px-3 sm:px-6 sm:py-8 lg:px-8 ${isSettingsPage ? "pt-16 pb-5" : "py-5"}`}>
        {children}
      </main>
    </div>
  );
}

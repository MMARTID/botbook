"use client";

import Link from "next/link";
import { useBusiness } from "@/components/providers";
import { LogOut, Bot, Activity, Settings, LayoutDashboard, ArrowLeft, CreditCard, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";

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
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(184,217,110,0.18),transparent_28%),linear-gradient(180deg,#f8faf5_0%,#eef2eb_100%)]">
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

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top_left,rgba(184,217,110,0.18),transparent_28%),linear-gradient(180deg,#f8faf5_0%,#eef2eb_100%)]">
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

      <header className={`sticky top-0 z-50 border-b border-[#dfe6da] bg-[#fbfcf8]/90 backdrop-blur-xl shadow-[0_8px_24px_rgba(30,43,34,0.05)] ${isSettingsPage ? "hidden sm:block" : ""}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3 sm:h-[4.5rem]">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef6dc] sm:h-10 sm:w-10">
                <Bot className="h-5 w-5 text-[#1e2b22] sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-5 tracking-tight text-[#1e2b22] sm:text-xl">AsistAI</p>
                <p className="truncate text-xs leading-4 text-[#5a6a58] sm:text-sm">
                  {business?.name ?? "Mi Negocio"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#eef6dc] px-2.5 text-xs font-semibold text-[#405115] ring-1 ring-inset ring-[#d7e9c5] sm:px-3">
                <Activity className="h-3 w-3" />
                {business?.active ? "Activo" : "Inactivo"}
              </span>
              <button
                onClick={() => {
                  window.localStorage.removeItem('asistai_token');
                  window.location.href = '/login';
                }}
                aria-label="Cerrar sesión"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#e4e8df] bg-white text-[#344038] shadow-sm transition hover:bg-[#f6f8f2] sm:w-auto sm:gap-2 sm:px-3 sm:text-sm sm:font-medium"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2 pb-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/"
                ? pathname === href
                : href === "/ajustes"
                  ? pathname === href
                  : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-[#cfe1ae] bg-[#eef6dc] text-[#405115]"
                      : "border-[#e4e8df] bg-white text-[#344038] hover:bg-[#f6f8f2]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  PhoneCall,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useBusiness } from "@/components/providers";
import { clearAuthTokens } from "@/lib/billing-navigation";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const PRIMARY_NAVIGATION: NavItem[] = [
  { href: "/", label: "Panel", icon: LayoutDashboard, exact: true },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/llamadas", label: "Llamadas", icon: PhoneCall },
];

const AGENT_NAVIGATION: NavItem[] = [
  { href: "/agente", label: "Agente", icon: Bot, exact: true },
];

const ACCOUNT_NAVIGATION: NavItem[] = [
  { href: "/ajustes", label: "Ajustes", icon: Settings, exact: true },
  { href: "/ajustes/facturacion", label: "Facturación", icon: CreditCard },
];

const PUBLIC_ROUTES = [
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
  "/register/business/team",
  "/register/business/calendar",
  "/planes",
  "/auth/google/callback",
  "/legal/privacidad",
  "/legal/aviso-legal",
  "/dev/entrar",
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavigationLink({
  item,
  pathname,
  compact = false,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, item);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-11 items-center gap-3 rounded-full border text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-2 ${
        compact ? "flex-col justify-center gap-0.5 px-2 text-[11px]" : "px-4"
      } ${
        active
          ? "border-[#ddd6fe] bg-[#f3eeff] text-[#6d28d9]"
          : "border-transparent text-[#3f3f46] hover:border-[#e5e5e5] hover:bg-[#fafafa] hover:text-[#0a0a0a]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact ? <span className="min-w-0 flex-1">{item.label}</span> : <span>{item.label}</span>}
      {!compact && active ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </Link>
  );
}

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      <p className="mb-2 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a1a1aa]">{label}</p>
      <div className="space-y-1">
        {items.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} />)}
      </div>
    </div>
  );
}

function AccountFooter({ pathname }: { pathname: string }) {
  const { business } = useBusiness();
  const hasIssue = business?.callsSuspendedAt || business?.subscriptionStatus === "PAST_DUE" || business?.subscriptionStatus === "UNPAID";

  return (
    <div className="border-t border-[#e5e5e5] px-4 py-4">
      <NavGroup label="Cuenta" items={ACCOUNT_NAVIGATION} pathname={pathname} />
      <div className={`mt-4 rounded-2xl border p-3 ${hasIssue ? "border-[#f0dfa8] bg-[#fef8e7]" : "border-[#ddd6fe] bg-[#f3eeff]"}`}>
        <div className="flex items-center gap-2">
          <Activity className={`h-4 w-4 ${hasIssue ? "text-[#9f7a15]" : "text-[#6d28d9]"}`} aria-hidden="true" />
          <p className={`text-xs font-semibold ${hasIssue ? "text-[#9f7a15]" : "text-[#6d28d9]"}`}>
            {hasIssue ? "Requiere atención" : "Plan y servicio"}
          </p>
        </div>
        <p className="mt-1 text-xs leading-5 text-[#52525b]">
          {hasIssue ? "Revisa tu facturación para que la recepción siga activa." : "Gestiona tu plan y los métodos de pago."}
        </p>
        <Link href="/ajustes/facturacion" className="mt-2 inline-flex text-xs font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
          Ver facturación
        </Link>
      </div>
      <button
        type="button"
        onClick={() => { clearAuthTokens(); window.location.assign("/login"); }}
        className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-semibold text-[#52525b] transition hover:bg-[#fafafa] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Cerrar sesión
      </button>
    </div>
  );
}

function MobileMoreSheet({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <button type="button" aria-label="Cerrar menú" className="absolute inset-0 cursor-default bg-black/30" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="more-menu-title" className="absolute inset-x-0 bottom-0 max-h-[min(38rem,calc(100dvh-1rem))] overflow-y-auto rounded-t-[2rem] border-t border-[#e5e5e5] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_48px_rgba(0,0,0,0.16)]">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-[#e5e5e5]" aria-hidden="true" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p id="more-menu-title" className="text-lg font-semibold text-[#0a0a0a]">Cuenta y ayuda</p>
            <p className="mt-1 text-sm text-muted">Gestiona la cuenta sin salir de la operación diaria.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e5e5] text-[#27272a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]" aria-label="Cerrar menú">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav className="mt-5 space-y-1" aria-label="Cuenta">
          {ACCOUNT_NAVIGATION.map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} onNavigate={onClose} />)}
          <Link href="/legal/privacidad" onClick={onClose} className="flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold text-[#3f3f46] transition hover:bg-[#fafafa] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Privacidad y datos
          </Link>
          <button type="button" onClick={() => { clearAuthTokens(); window.location.assign("/login"); }} className="flex min-h-11 w-full items-center gap-3 rounded-full px-4 text-left text-sm font-semibold text-[#3f3f46] transition hover:bg-[#fafafa] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
          </button>
        </nav>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { business, hasToken } = useBusiness();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const wasMoreOpenRef = useRef(false);

  useEffect(() => {
    if (wasMoreOpenRef.current && !moreOpen) moreTriggerRef.current?.focus();
    wasMoreOpenRef.current = moreOpen;
  }, [moreOpen]);

  if (pathname === "/") {
    if (hasToken === null) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#6d28d9]" /></div>;
    if (hasToken === false) return <>{children}</>;
  }
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f8f8fa] lg:flex">
      <a href="#main-content" className="sr-only z-[80] rounded-full bg-[#0a0a0a] px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar a contenido</a>
      <aside className="hidden h-screen w-72 shrink-0 flex-col border-r border-[#e5e5e5] bg-white lg:sticky lg:top-0 lg:flex">
        <div className="px-5 pb-6 pt-6">
          <Link href="/" aria-label="Ir al panel de Alhabla" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
            <BrandMark className="h-11 w-11 shrink-0" />
            <span className="min-w-0"><span className="block text-base font-bold text-[#0a0a0a]">Alhabla</span><span className="block truncate text-sm text-muted">{business?.name ?? "Mi negocio"}</span></span>
          </Link>
        </div>
        <nav className="flex-1 space-y-7 overflow-y-auto px-4 pb-6" aria-label="Navegación principal">
          <NavGroup label="Operación" items={PRIMARY_NAVIGATION} pathname={pathname} />
          <NavGroup label="Recepcionista" items={AGENT_NAVIGATION} pathname={pathname} />
        </nav>
        <AccountFooter pathname={pathname} />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-50 border-b border-[#e5e5e5] bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" aria-label="Ir al panel de Alhabla" className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
              <BrandMark className="h-9 w-9 shrink-0" />
              <span className="min-w-0"><span className="block text-sm font-bold leading-4 text-[#0a0a0a]">Alhabla</span><span className="block truncate text-xs leading-4 text-muted">{business?.name ?? "Mi negocio"}</span></span>
            </Link>
            <button type="button" onClick={() => setMoreOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#27272a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]" aria-label="Abrir cuenta y ayuda" aria-expanded={moreOpen}>
              <CircleUserRound className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-[90rem] px-4 py-4 pb-32 sm:px-6 sm:py-7 lg:px-10 lg:py-10 lg:pb-10">{children}</main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-[#e5e5e5] bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_12px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden" aria-label="Navegación principal">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {[...PRIMARY_NAVIGATION, ...AGENT_NAVIGATION].map((item) => <NavigationLink key={item.href} item={item} pathname={pathname} compact />)}
          <button ref={moreTriggerRef} type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full border border-transparent px-2 text-[11px] font-semibold text-[#3f3f46] transition hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
            <Menu className="h-4 w-4" aria-hidden="true" /> Más
          </button>
        </div>
      </nav>
      {moreOpen ? <MobileMoreSheet pathname={pathname} onClose={() => setMoreOpen(false)} /> : null}
    </div>
  );
}

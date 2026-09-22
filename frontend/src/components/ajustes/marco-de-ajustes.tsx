"use client";

import Link from "next/link";
import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Loader2,
  Phone,
  Settings,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { AppPageHeader } from "@/components/app-page-header";
import { useBusiness } from "@/components/providers";
import { getAccountOverview, type AccountOverview } from "@/lib/api";
import type { Business } from "@/lib/types";

/**
 * Ajustes está repartido en cuatro pantallas cortas en vez de una sola
 * página larga: Cuenta, Negocio, Teléfono y Seguridad. Este marco pone la
 * cabecera y las pestañas, carga lo que todas necesitan (negocio y cuenta) y
 * se lo da a la sección por contexto. Facturación vive aparte en el menú
 * lateral y no es una pestaña.
 */
export const SECCIONES_DE_AJUSTES = [
  { href: "/ajustes", label: "Cuenta", icon: UserRound },
  { href: "/ajustes/negocio", label: "Negocio", icon: Building2 },
  { href: "/ajustes/telefono", label: "Teléfono", icon: Phone },
  { href: "/ajustes/seguridad", label: "Seguridad", icon: ShieldCheck },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: LucideIcon;
}[];

export type SeccionDeAjustes = (typeof SECCIONES_DE_AJUSTES)[number]["href"];

const DESCRIPCIONES: Record<SeccionDeAjustes, string> = {
  "/ajustes": "Tu correo de acceso, el plan y la sesión.",
  "/ajustes/negocio":
    "El nombre, la dirección y el sector que usa tu recepcionista.",
  "/ajustes/telefono":
    "Qué número es cuál: la línea de tus clientes, tu recepcionista y tu móvil.",
  "/ajustes/seguridad": "Tu contraseña y la eliminación de la cuenta.",
};

type ContextoDeAjustes = {
  business: Business;
  account: AccountOverview;
  hasToken: boolean;
};

const Contexto = createContext<ContextoDeAjustes | null>(null);

export function useAjustes(): ContextoDeAjustes {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useAjustes solo se usa dentro de MarcoDeAjustes");
  return ctx;
}

export function MarcoDeAjustes({
  seccion,
  children,
}: {
  seccion: SeccionDeAjustes;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { business, hasToken, isLoadingBusiness } = useBusiness();
  const accountQuery = useQuery({
    queryKey: ["account-overview"],
    queryFn: getAccountOverview,
    enabled: hasToken === true,
  });

  useEffect(() => {
    if (hasToken === false) router.replace("/login");
  }, [hasToken, router]);

  // Enlaces antiguos (`/ajustes#whatsapp`, `/ajustes#telefono`, en avisos de
  // WhatsApp ya enviados y en marcadores): la sección de teléfono ahora es
  // una pantalla propia, así que se reenvía conservando el ancla.
  useEffect(() => {
    if (seccion !== "/ajustes") return;
    const hash = window.location.hash;
    if (hash === "#whatsapp" || hash === "#telefono") {
      router.replace(`/ajustes/telefono${hash}`);
    }
  }, [seccion, router]);

  if (isLoadingBusiness || accountQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Cargando ajustes…
      </div>
    );
  }

  if (hasToken === false) return null;

  const account = accountQuery.data;

  // Sin `accountQuery.isError` a propósito: React Query conserva los datos en
  // caché cuando un refresco falla (marca error sin soltar `data`), y esta
  // pantalla solo debe aparecer si no hay nada que pintar.
  if (!business || !account) {
    return (
      <div className="panel mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-2xl font-semibold text-[#0a0a0a]">
          No se pudieron cargar los ajustes
        </h1>
        <p className="text-sm leading-6 text-muted">
          Comprueba tu conexión y vuelve a intentarlo.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary mx-auto"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <Contexto.Provider
      value={{ business, account, hasToken: hasToken === true }}
    >
      <div className="space-y-5 sm:space-y-6">
        <AppPageHeader
          icon={Settings}
          title="Ajustes"
          description={DESCRIPCIONES[seccion]}
        />
        <nav
          aria-label="Secciones de ajustes"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {SECCIONES_DE_AJUSTES.map((item) => {
            const activa = (pathname ?? seccion) === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activa ? "page" : undefined}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] ${
                  activa
                    ? "bg-[#0a0a0a] text-white"
                    : "border border-[#e5e5e5] bg-white text-[#27272a] hover:border-[#0a0a0a] hover:bg-[#fafafa]"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </Contexto.Provider>
  );
}

export type Feedback = { type: "success" | "error"; message: string } | null;

export function FeedbackMessage({ value }: { value: Feedback }) {
  if (!value) return <span />;
  return (
    <p
      aria-live="polite"
      className={`text-sm leading-6 ${value.type === "success" ? "text-[#2c7334]" : "text-[#c53030]"}`}
    >
      {value.message}
    </p>
  );
}

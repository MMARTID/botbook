import {
  Bot,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  MessageSquareText,
  PhoneCall,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type Destino = {
  href: string;
  etiqueta: string;
  icono: LucideIcon;
  exacta?: boolean;
  /** Segunda tecla del atajo «G + letra». */
  tecla?: string;
  /** Más palabras con las que encontrarlo en el buscador. */
  sinonimos?: string;
};

export const OPERACION: Destino[] = [
  { href: "/", etiqueta: "Panel", icono: LayoutDashboard, exacta: true, tecla: "P", sinonimos: "inicio resumen" },
  { href: "/agenda", etiqueta: "Agenda", icono: CalendarDays, tecla: "A", sinonimos: "citas calendario semana" },
  { href: "/llamadas", etiqueta: "Llamadas", icono: PhoneCall, tecla: "L", sinonimos: "historial conversaciones recados" },
];

export const RECEPCIONISTA: Destino[] = [
  { href: "/agente", etiqueta: "Agente", icono: Bot, exacta: true, tecla: "R", sinonimos: "recepcionista horario servicios profesionales" },
  { href: "/asistente", etiqueta: "Gestor", icono: MessageSquareText, exacta: true, tecla: "G", sinonimos: "asistente chat whatsapp" },
];

export const CUENTA: Destino[] = [
  { href: "/ajustes", etiqueta: "Ajustes", icono: Settings, tecla: "J", sinonimos: "cuenta negocio teléfono seguridad" },
  { href: "/ajustes/facturacion", etiqueta: "Facturación", icono: CreditCard, sinonimos: "plan minutos facturas pago" },
];

export const DESTINOS: Destino[] = [...OPERACION, ...RECEPCIONISTA, ...CUENTA];

export function estaActivo(pathname: string, destino: Destino) {
  if (destino.exacta) return pathname === destino.href;
  if (pathname !== destino.href && !pathname.startsWith(`${destino.href}/`)) return false;
  // Si otra entrada casa con más precisión (Facturación bajo /ajustes/), gana esa.
  return !DESTINOS.some(
    (otro) =>
      otro !== destino &&
      otro.href.length > destino.href.length &&
      (pathname === otro.href || pathname.startsWith(`${otro.href}/`))
  );
}

/** Pantallas de trabajo: la barra lateral se pliega sola para dejarles sitio. */
export function esPantallaDeTrabajo(pathname: string) {
  return pathname === "/agenda" || pathname === "/llamadas" || pathname === "/asistente";
}

/** Pantallas de escritorio que pintan su propia franja de borde a borde. */
export function esPantallaAncha(pathname: string) {
  return pathname === "/" || pathname === "/agenda" || pathname === "/llamadas";
}

/** «Lucía» y «lucia» son lo mismo para el buscador. */
export function normalizarTexto(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

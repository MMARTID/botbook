"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Copy,
  LoaderCircle,
  MessageCircle,
  MessageSquareText,
  PhoneCall,
  Search,
  type LucideIcon,
} from "lucide-react";
import { buscarEnElNegocio, getPhoneNumberInfo } from "@/lib/api";
import { formatPhoneLocal } from "@/lib/format";
import { claveDeDia, etiquetaDeDia, horaDelNegocio } from "@/lib/fechas-negocio";
import { momentoCorto } from "@/lib/llamadas";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { DESTINOS, normalizarTexto } from "@/components/escritorio/navegacion";
import { Tecla } from "@/components/escritorio/piezas";

type Opcion = {
  clave: string;
  grupo: "Ir a" | "Citas" | "Llamadas" | "Acciones";
  icono: LucideIcon;
  titulo: string;
  detalle?: string;
  pista?: React.ReactNode;
  ejecutar: () => void;
};

/** El texto tecleado, con medio segundo de margen antes de preguntar al
 * servidor: no se busca letra a letra. */
function useConRetraso(valor: string, ms = 220) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const temporizador = window.setTimeout(() => setRetrasado(valor), ms);
    return () => window.clearTimeout(temporizador);
  }, [valor, ms]);
  return retrasado;
}

/**
 * Buscador del escritorio (⌘K): saltar a una pantalla, encontrar una cita o
 * una llamada por nombre, teléfono o servicio, preguntarle algo al gestor o
 * copiar el número de Alhabla. Todo con el teclado: ↑ ↓ para moverse, ↵
 * para abrir, Esc para cerrar.
 */
export function Buscador({
  abierto,
  onCerrar,
  timeZone,
  avisar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  timeZone: string;
  avisar: (mensaje: string, tipo?: "success" | "error") => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [activa, setActiva] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const ref = useFocusTrap<HTMLDivElement>({ active: abierto, onEscape: onCerrar, initialFocusRef: campoRef });

  useEffect(() => {
    if (abierto) setTexto("");
  }, [abierto]);

  const consulta = useConRetraso(texto.trim());
  const busqueda = useQuery({
    queryKey: ["buscar", consulta],
    queryFn: () => buscarEnElNegocio(consulta),
    enabled: abierto && consulta.length >= 2,
    staleTime: 30_000,
  });
  const telefono = useQuery({ queryKey: ["phone-number"], queryFn: getPhoneNumberInfo, enabled: abierto });
  const numero = telefono.data?.phoneNumber ?? null;

  const opciones = useMemo<Opcion[]>(() => {
    const ir = (href: string) => () => {
      onCerrar();
      router.push(href);
    };
    const buscado = normalizarTexto(texto);
    const hoy = claveDeDia(new Date(), timeZone);
    const lista: Opcion[] = [];

    for (const destino of DESTINOS) {
      const encaja = !buscado || normalizarTexto(`${destino.etiqueta} ${destino.sinonimos ?? ""}`).includes(buscado);
      if (!encaja) continue;
      lista.push({
        clave: `ir:${destino.href}`,
        grupo: "Ir a",
        icono: destino.icono,
        titulo: destino.etiqueta,
        pista: destino.tecla ? (
          <span className="flex gap-1">
            <Tecla>G</Tecla>
            <Tecla>{destino.tecla}</Tecla>
          </span>
        ) : undefined,
        ejecutar: ir(destino.href),
      });
    }

    if (consulta.length >= 2 && busqueda.data && consulta === texto.trim()) {
      for (const cita of busqueda.data.citas) {
        const dia = claveDeDia(cita.programedAt, timeZone);
        lista.push({
          clave: `cita:${cita.id}`,
          grupo: "Citas",
          icono: CalendarDays,
          titulo: [
            `${etiquetaDeDia(dia, hoy)} ${horaDelNegocio(cita.programedAt, timeZone)}`,
            cita.servicios.join(" + ") || "Cita",
            cita.clientName ?? formatPhoneLocal(cita.clientPhone),
          ]
            .filter(Boolean)
            .join(" · "),
          detalle: cita.profesional ? `Con ${cita.profesional}` : undefined,
          pista: <span className="text-xs text-muted">ver cita</span>,
          ejecutar: ir(`/agenda?dia=${dia}&cita=${encodeURIComponent(cita.id)}`),
        });
      }
      for (const llamada of busqueda.data.llamadas) {
        lista.push({
          clave: `llamada:${llamada.id}`,
          grupo: "Llamadas",
          icono: llamada.canal === "whatsapp" ? MessageCircle : PhoneCall,
          titulo: `${formatPhoneLocal(llamada.fromNumber) ?? "Número oculto"} · ${momentoCorto(llamada.startedAt, timeZone, hoy)}`,
          detalle: llamada.resumen ?? undefined,
          pista: <span className="text-xs text-muted">ver llamada</span>,
          ejecutar: ir(`/llamadas?llamada=${encodeURIComponent(llamada.id)}`),
        });
      }
    }

    if (texto.trim()) {
      lista.push({
        clave: "gestor",
        grupo: "Acciones",
        icono: MessageSquareText,
        titulo: `Preguntar al gestor: «${texto.trim()}»`,
        ejecutar: ir(`/asistente?mensaje=${encodeURIComponent(texto.trim())}`),
      });
    }
    if (numero && (!buscado || normalizarTexto("copiar numero de alhabla telefono").includes(buscado))) {
      lista.push({
        clave: "copiar-numero",
        grupo: "Acciones",
        icono: Copy,
        titulo: "Copiar el número de Alhabla",
        detalle: formatPhoneLocal(numero) ?? numero,
        ejecutar: () => {
          onCerrar();
          const visible = formatPhoneLocal(numero) ?? numero;
          if (!navigator.clipboard) return avisar("Tu navegador no deja copiar desde aquí.", "error");
          navigator.clipboard.writeText(visible).then(
            () => avisar(`Copiado: ${visible}`),
            () => avisar("No se pudo copiar el número.", "error")
          );
        },
      });
    }
    return lista;
  }, [texto, consulta, busqueda.data, timeZone, numero, onCerrar, router, avisar]);

  useEffect(() => setActiva(0), [texto, busqueda.data]);

  if (!abierto || typeof document === "undefined") return null;

  const buscando = consulta.length >= 2 && (busqueda.isFetching || consulta !== texto.trim());
  const sinResultados =
    consulta.length >= 2 && !buscando && busqueda.data && busqueda.data.citas.length === 0 && busqueda.data.llamadas.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-center px-6 pt-[12vh]">
      <div aria-hidden="true" onClick={onCerrar} className="absolute inset-0 bg-black/40" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en Alhabla"
        className="relative flex max-h-[70vh] w-full max-w-[40rem] flex-col self-start overflow-hidden rounded-3xl border border-linea bg-superficie shadow-[0_24px_64px_rgba(0,0,0,0.25)]"
      >
        <div className="flex items-center gap-3 border-b border-linea px-5">
          {buscando ? (
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-morado" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
          )}
          <input
            ref={campoRef}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiva((indice) => Math.min(opciones.length - 1, indice + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiva((indice) => Math.max(0, indice - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                opciones[activa]?.ejecutar();
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listaId}
            aria-activedescendant={opciones[activa] ? `${listaId}-${activa}` : undefined}
            aria-autocomplete="list"
            placeholder="Buscar citas, llamadas o pantallas… o preguntar al gestor"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-tinta outline-none placeholder:text-tenue"
          />
          <Tecla>esc</Tecla>
        </div>
        <ul id={listaId} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {opciones.map((opcion, indice) => {
            const Icono = opcion.icono;
            const primeraDelGrupo = indice === 0 || opciones[indice - 1].grupo !== opcion.grupo;
            return (
              <li key={opcion.clave} role="presentation">
                {primeraDelGrupo ? (
                  <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted" aria-hidden="true">
                    {opcion.grupo}
                  </p>
                ) : null}
                <div
                  id={`${listaId}-${indice}`}
                  role="option"
                  aria-selected={indice === activa}
                  onMouseMove={() => setActiva(indice)}
                  onClick={opcion.ejecutar}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${indice === activa ? "bg-lavado" : ""}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${indice === activa ? "bg-superficie text-morado-tinta" : "bg-relleno-fuerte text-apagado"}`}
                    aria-hidden="true"
                  >
                    <Icono className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-tinta">{opcion.titulo}</span>
                    {opcion.detalle ? <span className="block truncate text-xs text-muted">{opcion.detalle}</span> : null}
                  </span>
                  {opcion.pista ? <span className="shrink-0">{opcion.pista}</span> : null}
                </div>
              </li>
            );
          })}
          {sinResultados ? (
            <li className="px-3 py-3 text-sm text-muted">No hay citas ni llamadas con «{consulta}».</li>
          ) : null}
          {busqueda.isError ? (
            <li className="px-3 py-3 text-sm text-error" role="alert">
              No se ha podido buscar ahora mismo. Inténtalo de nuevo.
            </li>
          ) : null}
        </ul>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-linea bg-relleno px-5 py-2.5 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Tecla>↑</Tecla>
            <Tecla>↓</Tecla> moverse
          </span>
          <span className="flex items-center gap-1">
            <Tecla>↵</Tecla> abrir
          </span>
          <span className="flex items-center gap-1">
            <Tecla>G</Tecla> + letra: ir a una pantalla sin abrir esto
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Atajos de teclado del escritorio: ⌘K (o Ctrl+K) abre el buscador y «G»
 * seguida de una letra salta a una pantalla, como en el buscador. No se
 * disparan mientras se escribe en un campo.
 */
export function useAtajosDelEscritorio({ activo, onBuscar }: { activo: boolean; onBuscar: () => void }) {
  const router = useRouter();
  const onBuscarRef = useRef(onBuscar);
  onBuscarRef.current = onBuscar;

  useEffect(() => {
    if (!activo) return;
    let esperandoDestino = 0;
    const escribiendo = (objetivo: EventTarget | null) =>
      objetivo instanceof HTMLElement &&
      (objetivo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName));

    const alPulsar = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onBuscarRef.current();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || escribiendo(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const tecla = event.key.toUpperCase();
      if (esperandoDestino && Date.now() - esperandoDestino < 1200) {
        esperandoDestino = 0;
        const destino = DESTINOS.find((candidato) => candidato.tecla === tecla);
        if (destino) {
          event.preventDefault();
          router.push(destino.href);
        }
        return;
      }
      if (tecla === "G") esperandoDestino = Date.now();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [activo, router]);
}

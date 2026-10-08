"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  MessageSquareText,
  Send,
  UserPlus,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import { decideGestorAction, getGestor, sendGestorMessage } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type {
  DecisionDelGestor,
  EstadoDelGestor,
  MensajeDelGestor,
  PropuestaDelGestor,
} from "@/lib/types";
import { BrandMark } from "@/components/brand-mark";
import { SectionErrorState } from "@/components/section-card";

export const EJEMPLOS = [
  "¿Qué tengo mañana?",
  "Apunta a Marta el jueves a las 17:00, corte",
  "Laura no viene el viernes",
  "Cierra el sábado por la tarde",
];

const ICONOS_DE_EJEMPLO: LucideIcon[] = [CalendarDays, UserPlus, UserX, Clock];

type EstadoDeDecision = DecisionDelGestor["estado"];
type Burbuja = MensajeDelGestor & { clave: string; estado?: EstadoDeDecision };
type Aviso = { tipo: "info" | "error"; texto: string } | null;

const ETIQUETA_DE_ESTADO: Record<
  EstadoDeDecision,
  { icono: LucideIcon; texto: string; clase: string }
> = {
  ejecutada: {
    icono: Check,
    texto: "Hecho",
    clase: "bg-exito-fondo text-exito",
  },
  fallida: {
    icono: AlertCircle,
    texto: "No se pudo hacer",
    clase: "bg-error-fondo-2 text-error",
  },
  rechazada: {
    icono: X,
    texto: "Descartado",
    clase: "bg-relleno text-muted ring-1 ring-inset ring-linea",
  },
};

// Altura acotada a la ventana: con una conversación larga hace scroll la
// lista de mensajes, no la página, y la cabecera y el cuadro de texto se
// quedan siempre a la vista. En móvil descuenta la barra «‹ Cuenta» y los
// márgenes de la pantalla (el chat ya no lleva la barra de pestañas debajo).
const MARCO =
  "panel flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] min-h-[26rem] flex-col overflow-hidden p-0 lg:h-[calc(100dvh-5rem)]";

function aFecha(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hora(date: Date | null) {
  return date
    ? date.toLocaleTimeString("es-ES", { hour: "numeric", minute: "2-digit" })
    : null;
}

function diaDe(date: Date) {
  return date.toDateString();
}

function etiquetaDeDia(date: Date) {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (diaDe(date) === diaDe(hoy)) return "Hoy";
  if (diaDe(date) === diaDe(ayer)) return "Ayer";
  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function Avatar({ grande = false }: { grande?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-lavado ${
        grande
          ? "h-[52px] w-[52px]"
          : "h-[26px] w-[26px] sm:h-[30px] sm:w-[30px]"
      }`}
    >
      <BrandMark className={grande ? "h-[26px] w-[26px]" : "h-4 w-4"} />
    </span>
  );
}

/** «Misma conversación que en WhatsApp», o la invitación a conectarlo. */
export function IndicadorDeWhatsapp({
  whatsapp,
  className = "",
}: {
  whatsapp: EstadoDelGestor["whatsapp"];
  className?: string;
}) {
  return whatsapp === "activo" ? (
    <span className={`flex items-center gap-2 text-muted ${className}`}>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-exito shadow-[0_0_0_3px_rgb(var(--exito-fondo))]"
      />
      <span>
        Misma conversación que en{" "}
        <b className="font-semibold text-tinta">WhatsApp</b>
      </span>
    </span>
  ) : (
    <Link
      href="/ajustes/telefono#whatsapp"
      className={`flex items-center gap-2 rounded text-muted hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-linea-fuerte"
      />
      <span>
        Conecta tu <b className="font-semibold">WhatsApp</b> para escribirle
        también desde el móvil
      </span>
    </Link>
  );
}

function Cabecera({ whatsapp }: { whatsapp?: EstadoDelGestor["whatsapp"] }) {
  return (
    <header className="flex flex-wrap items-center gap-2.5 border-b border-linea px-4 py-3.5 sm:flex-nowrap sm:gap-3 sm:px-8 sm:py-5">
      <span
        aria-hidden="true"
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-lavado text-morado sm:h-10 sm:w-10 sm:rounded-xl"
      >
        <MessageSquareText className="h-[18px] w-[18px]" />
      </span>
      <h1 className="text-[19px] font-black tracking-[-0.025em] text-tinta sm:text-[22px]">
        Tu gestor
      </h1>
      <span className="badge-soft">Beta</span>
      {whatsapp ? (
        <IndicadorDeWhatsapp
          whatsapp={whatsapp}
          className="w-full text-xs sm:ml-auto sm:w-auto sm:text-[13px]"
        />
      ) : null}
    </header>
  );
}

// En escritorio el chat ocupa la columna de la pantalla, sin marco: la
// cabecera la pone la franja de título y el contexto va a la derecha.
const MARCO_ESCRITORIO = "flex h-full min-h-0 flex-col";

/**
 * «Tu gestor» (Beta): el mismo gestor que atiende al dueño por WhatsApp, con
 * la misma conversación, desde el panel. Cada propuesta llega con sus dos
 * botones y el botón ejecuta; el texto nunca ejecuta nada.
 */
export function GestorChat({
  hasToken,
  enEscritorio = false,
}: {
  hasToken: boolean | null;
  /** Sin marco ni cabecera propia: los pone la pantalla de escritorio. */
  enEscritorio?: boolean;
}) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [propuesta, setPropuesta] = useState<PropuestaDelGestor | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const estadoQuery = useQuery({
    queryKey: ["gestor"],
    queryFn: getGestor,
    enabled: hasToken === true,
  });
  const estado = estadoQuery.data;

  // «Preguntar al gestor…» del buscador del escritorio llega como
  // ?mensaje=: se deja escrito, sin enviarlo, y se limpia de la URL.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const mensaje = parametros.get("mensaje");
    if (!mensaje) return;
    setTexto(mensaje.slice(0, 1000));
    parametros.delete("mensaje");
    const resto = parametros.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${resto ? `?${resto}` : ""}`);
  }, []);

  // El historial viene de la conversación de Telnyx (compartida con el
  // WhatsApp): al cargar, sustituye lo local; después solo se añade.
  useEffect(() => {
    if (!estado) return;
    setBurbujas(
      estado.mensajes.map((m, i) => ({ ...m, clave: `h-${i}-${m.en ?? ""}` }))
    );
    setPropuesta(estado.propuesta);
  }, [estado]);

  const anadir = (
    de: MensajeDelGestor["de"],
    textoNuevo: string,
    estadoDeDecision?: EstadoDeDecision
  ) =>
    setBurbujas((previas) => [
      ...previas,
      {
        de,
        texto: textoNuevo,
        en: new Date().toISOString(),
        clave: `${de}-${Date.now()}-${previas.length}`,
        estado: estadoDeDecision,
      },
    ]);

  const enviar = useMutation({
    mutationFn: (textoEnviado: string) => sendGestorMessage(textoEnviado),
    onMutate: (textoEnviado) => {
      setAviso(null);
      anadir("dueno", textoEnviado);
      setTexto("");
    },
    onSuccess: (r) => {
      anadir("gestor", r.respuesta);
      setPropuesta(r.propuesta);
      // Una propuesta nueva sale en «Cambios del gestor» del escritorio.
      if (r.propuesta) {
        void queryClient.invalidateQueries({ queryKey: ["gestor-cambios"] });
      }
    },
    onError: (error) =>
      setAviso({
        tipo: "error",
        texto: describeApiError(
          error,
          "El gestor no ha podido responder. Inténtalo de nuevo."
        ),
      }),
    onSettled: () => campoRef.current?.focus(),
  });

  const decidir = useMutation({
    mutationFn: (input: { id: string; decision: "confirmar" | "cancelar" }) =>
      decideGestorAction(input.id, input.decision),
    onMutate: () => setAviso(null),
    onSuccess: (r) => {
      setPropuesta(null);
      anadir("gestor", r.mensaje, r.estado);
      if (r.seguimiento) anadir("gestor", r.seguimiento);
      if (r.propuesta) setPropuesta(r.propuesta);
      // Lo que cambia el gestor (servicios, horario, citas) lo ven las demás
      // vistas al volver a pedirlo.
      void queryClient.invalidateQueries({ queryKey: ["my-business"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-settings"] });
      // Las cuatro vistas de la agenda tienen clave propia: ["agenda"] no
      // coincidía con ninguna y la cita que acababa de apuntar el gestor no
      // aparecía hasta recargar.
      void queryClient.invalidateQueries({ queryKey: ["agenda-panel"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-escritorio"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-semana"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda-inicio"] });
      void queryClient.invalidateQueries({ queryKey: ["gestor-cambios"] });
    },
    onError: (error) => {
      setPropuesta(null);
      setAviso({
        tipo: "error",
        texto: describeApiError(
          error,
          "No se pudo decidir la propuesta. Inténtalo de nuevo."
        ),
      });
    },
  });

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [burbujas, propuesta, enviar.isPending]);

  const ocupado = enviar.isPending || decidir.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    enviar.mutate(limpio);
  };

  const usarEjemplo = (ejemplo: string) => {
    setTexto(ejemplo);
    campoRef.current?.focus();
  };

  if (estadoQuery.isLoading) {
    // Mismo marco que la conversación: la pantalla no salta al cargar.
    return (
      <div role="status" className={enEscritorio ? MARCO_ESCRITORIO : MARCO}>
        {enEscritorio ? null : <Cabecera />}
        <span className="sr-only">Cargando tu gestor…</span>
        <div
          className="mx-auto w-full max-w-[720px] flex-1 space-y-4 px-4 py-6 sm:px-8"
          aria-hidden="true"
        >
          <div className="h-10 w-2/3 rounded-2xl bg-lavado motion-safe:animate-pulse sm:w-1/2" />
          <div className="ml-auto h-10 w-1/2 rounded-2xl bg-relleno-fuerte motion-safe:animate-pulse sm:w-1/3" />
          <div className="h-16 w-3/4 rounded-2xl bg-lavado motion-safe:animate-pulse sm:w-1/2" />
        </div>
        <div
          className="border-t border-linea px-4 py-3 sm:px-8"
          aria-hidden="true"
        >
          <div className="mx-auto h-[52px] max-w-[720px] rounded-[10px] border border-linea bg-relleno" />
        </div>
      </div>
    );
  }
  if (estadoQuery.isError || !estado) {
    return (
      <>
        <h1 className="sr-only">Tu gestor</h1>
        <SectionErrorState
          message="No se pudo cargar el gestor. Puede ser un corte momentáneo de conexión."
          onRetry={() => void estadoQuery.refetch()}
        />
      </>
    );
  }
  if (!estado.disponible || !estado.activoEnNegocio) {
    return (
      <div className={enEscritorio ? "" : "panel overflow-hidden p-0"}>
        {enEscritorio ? null : <Cabecera />}
        <div className="p-6 text-sm leading-6 text-muted sm:px-8">
          {!estado.disponible ? (
            <>
              El gestor todavía no está disponible en tu cuenta. Te avisaremos
              cuando lo esté.
            </>
          ) : (
            <>
              Tienes el gestor desactivado. Puedes volver a activarlo en{" "}
              <Link
                href="/ajustes/telefono#whatsapp"
                className="rounded font-semibold text-morado-tinta underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2"
              >
                Ajustes › Teléfono
              </Link>
              .
            </>
          )}
        </div>
      </div>
    );
  }

  // También mira el historial que llega del servidor: las burbujas se
  // rellenan en un efecto y, sin esto, el estado vacío se asomaba un
  // instante antes de la conversación real.
  const vacio =
    burbujas.length === 0 &&
    estado.mensajes.length === 0 &&
    !propuesta &&
    !enviar.isPending;

  let diaAnterior: string | null = null;

  return (
    <div className={enEscritorio ? MARCO_ESCRITORIO : MARCO}>
      {enEscritorio ? null : <Cabecera whatsapp={estado.whatsapp} />}
      <div
        className="relative min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Conversación con tu gestor"
      >
        {vacio ? (
          <div className="mx-auto flex max-w-[560px] flex-col items-center px-4 pb-6 pt-12 text-center sm:px-8 sm:pt-16">
            <Avatar grande />
            <h2 className="mt-5 text-2xl font-black tracking-[-0.025em] text-tinta sm:text-[28px]">
              ¿En qué te ayudo?
            </h2>
            <p className="mt-2 max-w-[400px] text-pretty text-sm leading-6 text-muted">
              Pregúntale por la agenda o pídele cambios. Todo lo que cambie te
              lo propondrá antes con un botón.
            </p>
            <ul className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
              {EJEMPLOS.map((ejemplo, i) => {
                const Icono = ICONOS_DE_EJEMPLO[i];
                return (
                  <li key={ejemplo}>
                    <button
                      type="button"
                      onClick={() => usarEjemplo(ejemplo)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-linea bg-superficie p-3.5 text-left text-sm font-semibold leading-snug text-tinta transition duration-200 hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lavado text-morado"
                      >
                        <Icono className="h-[17px] w-[17px]" />
                      </span>
                      {ejemplo}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-1.5 px-4 pb-3 pt-5 sm:px-8 sm:pb-4 sm:pt-7">
            {burbujas.map((m) => {
              const fecha = aFecha(m.en);
              const dia = fecha ? diaDe(fecha) : diaAnterior;
              const separador =
                fecha && dia !== diaAnterior ? etiquetaDeDia(fecha) : null;
              const primero = diaAnterior === null;
              diaAnterior = dia;
              const delDueno = m.de === "dueno";
              const etiqueta = m.estado ? ETIQUETA_DE_ESTADO[m.estado] : null;
              return (
                <Fragment key={m.clave}>
                  {separador ? (
                    <div
                      className={`flex items-center gap-3 text-xs font-semibold text-muted before:h-px before:flex-1 before:bg-linea after:h-px after:flex-1 after:bg-linea ${primero ? "mb-2.5" : "mb-2.5 mt-[18px]"}`}
                    >
                      {separador}
                    </div>
                  ) : null}
                  <div
                    className={`mt-2.5 flex gap-2 sm:gap-3 ${delDueno ? "justify-end" : ""}`}
                  >
                    {delDueno ? null : <Avatar />}
                    <div
                      className={`flex min-w-0 flex-col gap-1 ${
                        delDueno
                          ? "max-w-[86%] items-end sm:max-w-[78%]"
                          : "max-w-[600px]"
                      }`}
                    >
                      {etiqueta ? (
                        <span
                          className={`mt-[3px] inline-flex items-center gap-1.5 self-start rounded-full py-[3px] pl-2 pr-2.5 text-xs font-semibold ${etiqueta.clase}`}
                        >
                          <etiqueta.icono
                            className="h-[13px] w-[13px]"
                            aria-hidden="true"
                          />
                          {etiqueta.texto}
                        </span>
                      ) : null}
                      <p
                        className={
                          delDueno
                            ? "whitespace-pre-wrap rounded-[18px] rounded-br-md bg-morado-hondo px-4 py-2.5 text-[15px] leading-normal text-white"
                            : "whitespace-pre-wrap text-pretty pt-[3px] text-[15px] leading-relaxed text-tinta"
                        }
                      >
                        {m.texto}
                      </p>
                      {hora(fecha) ? (
                        <span className="mt-0.5 text-[11px] text-muted">
                          {hora(fecha)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Fragment>
              );
            })}
            {propuesta ? (
              <div className="mt-2.5 flex gap-2 sm:gap-3">
                <span
                  aria-hidden="true"
                  className="w-[26px] shrink-0 sm:w-[30px]"
                />
                <div className="w-full max-w-[520px] rounded-[20px] border border-lavado-borde bg-superficie p-3.5 sm:px-[18px] sm:pb-[18px] sm:pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="badge-soft">
                      Pendiente de tu confirmación
                    </span>
                    {hora(aFecha(propuesta.expiresAt)) ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <Clock
                          className="h-[13px] w-[13px]"
                          aria-hidden="true"
                        />
                        Caduca a las {hora(aFecha(propuesta.expiresAt))}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-4 mt-3 text-pretty text-[15px] font-semibold leading-normal text-tinta">
                    {propuesta.resumen}
                  </p>
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    {(["confirmar", "cancelar"] as const).map((decision) => (
                      <button
                        key={decision}
                        type="button"
                        disabled={decidir.isPending}
                        onClick={() =>
                          decidir.mutate({ id: propuesta.id, decision })
                        }
                        className={`${decision === "confirmar" ? "btn-primary" : "btn-secondary"} h-11 px-4 sm:h-10`}
                      >
                        {decidir.isPending &&
                        decidir.variables?.decision === decision ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                        {propuesta.botones[decision]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {enviar.isPending ? (
              <div className="mt-2.5 flex gap-2 sm:gap-3">
                <Avatar />
                <div className="relative inline-flex gap-1 pb-2 pt-3">
                  <span className="sr-only">El gestor está pensando…</span>
                  {[0, 150, 300].map((retraso) => (
                    <i
                      key={retraso}
                      aria-hidden="true"
                      style={{ animationDelay: `${retraso}ms` }}
                      className="h-1.5 w-1.5 rounded-full bg-morado opacity-40 motion-safe:animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {aviso ? (
              <p
                role="alert"
                className={`mt-2.5 text-sm ${aviso.tipo === "error" ? "text-error" : "text-muted"}`}
              >
                {aviso.texto}
              </p>
            ) : null}
            <div ref={finRef} />
          </div>
        )}
      </div>
      <form onSubmit={submit} className="border-t border-linea bg-superficie">
        <div className="mx-auto flex max-w-[720px] flex-col gap-2.5 px-3 pb-3.5 pt-2.5 sm:px-8 sm:pt-3">
          {vacio ? null : (
            <ul className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {EJEMPLOS.map((ejemplo) => (
                <li key={ejemplo} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => usarEjemplo(ejemplo)}
                    className="whitespace-nowrap rounded-full border border-linea bg-superficie px-3 py-1.5 text-xs font-semibold text-tinta-2 transition duration-200 hover:border-linea-fuerte hover:bg-relleno focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado"
                  >
                    {ejemplo}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2 rounded-[10px] border border-linea bg-superficie py-1.5 pl-4 pr-1.5 transition duration-200 focus-within:border-morado focus-within:ring-[3px] focus-within:ring-morado/20">
            <label htmlFor="gestor-texto" className="sr-only">
              Mensaje para tu gestor
            </label>
            <textarea
              id="gestor-texto"
              ref={campoRef}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(event);
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Escribe a tu gestor…"
              disabled={ocupado}
              className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent py-[7px] text-[15px] leading-normal text-tinta outline-none [field-sizing:content] placeholder:text-muted disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={ocupado || texto.trim() === ""}
              aria-label="Enviar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-tinta text-sobre-tinta transition duration-200 hover:bg-tinta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-morado focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-tinta"
            >
              <Send className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          </div>
          <div className="hidden justify-between gap-3 text-[11px] text-muted sm:flex">
            <span>Nada cambia hasta que pulses el botón de la propuesta.</span>
            <span>Enter para enviar · Mayús + Enter, nueva línea</span>
          </div>
        </div>
      </form>
    </div>
  );
}

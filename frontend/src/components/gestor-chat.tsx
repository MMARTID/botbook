"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { decideGestorAction, getGestor, sendGestorMessage } from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import type { MensajeDelGestor, PropuestaDelGestor } from "@/lib/types";

export const EJEMPLOS = [
  "¿Qué tengo mañana?",
  "Apunta a Marta el jueves a las 17:00, corte",
  "Laura no viene el viernes",
  "Cierra el sábado por la tarde",
];

type Burbuja = MensajeDelGestor & { clave: string };
type Aviso = { tipo: "info" | "error"; texto: string } | null;

function hora(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * «Tu Gestor» (Beta): el mismo Gestor que atiende al dueño por WhatsApp, con
 * la misma conversación, desde el panel. Cada propuesta llega con sus dos
 * botones y el botón ejecuta; el texto nunca ejecuta nada.
 */
export function GestorChat({ hasToken }: { hasToken: boolean | null }) {
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

  // El historial viene de la conversación de Telnyx (compartida con el
  // WhatsApp): al cargar, sustituye lo local; después solo se añade.
  useEffect(() => {
    if (!estado) return;
    setBurbujas(
      estado.mensajes.map((m, i) => ({ ...m, clave: `h-${i}-${m.en ?? ""}` }))
    );
    setPropuesta(estado.propuesta);
  }, [estado]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [burbujas, propuesta]);

  const anadir = (de: MensajeDelGestor["de"], textoNuevo: string) =>
    setBurbujas((previas) => [
      ...previas,
      {
        de,
        texto: textoNuevo,
        en: new Date().toISOString(),
        clave: `${de}-${Date.now()}-${previas.length}`,
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
    },
    onError: (error) =>
      setAviso({
        tipo: "error",
        texto: describeApiError(
          error,
          "El asistente no ha podido responder. Inténtalo de nuevo."
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
      anadir("gestor", r.mensaje);
      if (r.seguimiento) anadir("gestor", r.seguimiento);
      if (r.propuesta) setPropuesta(r.propuesta);
      // Lo que cambia el Gestor (servicios, horario, citas) lo ven las demás
      // vistas al volver a pedirlo.
      void queryClient.invalidateQueries({ queryKey: ["my-business"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
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

  const ocupado = enviar.isPending || decidir.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    enviar.mutate(limpio);
  };

  if (estadoQuery.isLoading) {
    return (
      <div className="p-8 text-center text-muted">Cargando tu asistente…</div>
    );
  }
  if (estadoQuery.isError || !estado) {
    return (
      <div className="panel p-6 text-sm text-[#c53030]">
        No se pudo cargar el asistente. Recarga la página en un momento.
      </div>
    );
  }
  if (!estado.disponible) {
    return (
      <div className="panel p-6 text-sm leading-6 text-muted">
        El asistente todavía no está disponible en tu cuenta. Te avisaremos
        cuando lo esté.
      </div>
    );
  }
  if (!estado.activoEnNegocio) {
    return (
      <div className="panel p-6 text-sm leading-6 text-muted">
        Tienes el asistente desactivado. Puedes volver a activarlo en{" "}
        <Link
          href="/ajustes/telefono#whatsapp"
          className="font-semibold text-[#6d28d9]"
        >
          Ajustes › Teléfono
        </Link>
        .
      </div>
    );
  }

  return (
    // Altura acotada a la ventana: con una conversación larga hace scroll la
    // lista de mensajes, no la página, y la cabecera «Tu Gestor» y el cuadro
    // de texto se quedan siempre a la vista.
    <div className="panel flex h-[calc(100dvh-15rem)] min-h-[24rem] flex-col overflow-hidden p-0 lg:h-[calc(100dvh-13rem)]">
      <div
        className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6"
        role="log"
        aria-live="polite"
        aria-label="Conversación con tu asistente"
      >
        {burbujas.length === 0 ? (
          <div className="mx-auto max-w-md py-6 text-center">
            <p className="text-sm leading-6 text-muted">
              Pregúntale por la agenda o pídele cambios. Todo lo que cambie te
              lo propondrá antes con un botón.
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2">
              {EJEMPLOS.map((ejemplo) => (
                <li key={ejemplo}>
                  <button
                    type="button"
                    onClick={() => {
                      setTexto(ejemplo);
                      campoRef.current?.focus();
                    }}
                    className="rounded-full border border-[#e5e5e5] px-3 py-1.5 text-xs font-semibold text-[#27272a] transition hover:bg-[#fafafa]"
                  >
                    {ejemplo}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {burbujas.map((m) => (
          <div
            key={m.clave}
            className={`flex ${m.de === "dueno" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 sm:max-w-[70%] ${
                m.de === "dueno"
                  ? "bg-[#0a0a0a] text-white"
                  : "bg-[#f3eeff] text-[#0a0a0a]"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {hora(m.en) ? (
                <p
                  className={`mt-1 text-[11px] ${m.de === "dueno" ? "text-white/60" : "text-muted"}`}
                >
                  {hora(m.en)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {enviar.isPending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[#f3eeff] px-4 py-2.5 text-sm text-muted">
              <Loader2
                className="inline h-4 w-4 animate-spin"
                aria-hidden="true"
              />{" "}
              El asistente está pensando…
            </div>
          </div>
        ) : null}
        {propuesta ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl border border-[#d9ccff] bg-white px-4 py-3 text-sm sm:max-w-[70%]">
              <p className="font-semibold text-[#0a0a0a]">
                {propuesta.resumen}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={decidir.isPending}
                  onClick={() =>
                    decidir.mutate({ id: propuesta.id, decision: "confirmar" })
                  }
                  className="btn-primary px-4"
                >
                  {decidir.isPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {propuesta.botones.confirmar}
                </button>
                <button
                  type="button"
                  disabled={decidir.isPending}
                  onClick={() =>
                    decidir.mutate({ id: propuesta.id, decision: "cancelar" })
                  }
                  className="btn-secondary px-4"
                >
                  {propuesta.botones.cancelar}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {aviso ? (
          <p
            role="alert"
            className={`text-sm ${aviso.tipo === "error" ? "text-[#c53030]" : "text-muted"}`}
          >
            {aviso.texto}
          </p>
        ) : null}
        <div ref={finRef} />
      </div>
      <form
        onSubmit={submit}
        className="flex items-end gap-2 border-t border-[#e5e5e5] px-4 py-3 sm:px-6"
      >
        <label htmlFor="gestor-texto" className="sr-only">
          Mensaje para tu asistente
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
          placeholder="Escribe a tu asistente…"
          disabled={ocupado}
          className="field min-h-11 flex-1 resize-none"
        />
        <button
          type="submit"
          disabled={ocupado || texto.trim() === ""}
          className="btn-primary h-11 px-4"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}

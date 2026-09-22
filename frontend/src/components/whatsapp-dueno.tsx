"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  getOwnerWhatsapp,
  sendOwnerWhatsappActivation,
  updateMyBusiness,
} from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { esFijoEspanol, formatearMovil, normalizarMovil } from "@/lib/phone";
import type {
  Business,
  EstadoWhatsappDueno,
  WhatsappOwnerStatus,
} from "@/lib/types";

export const AYUDA_MOVIL =
  "Aquí te avisará la recepcionista de cada reserva y recado. Es tu móvil, no el teléfono del local.";
export const ERROR_MOVIL_INVALIDO =
  "Escribe un móvil válido, por ejemplo 600 123 456 o +34 600 123 456.";
export const AVISO_PARECE_FIJO =
  "Parece el teléfono del local. Necesitamos el móvil en el que usas WhatsApp.";
export const AYUDA_AVISO_RESERVA =
  "Si lo desactivas dejarás de recibir el aviso de cada cita que reserve la recepcionista. Las citas pendientes de confirmar, las cancelaciones y los recados te llegarán igual.";
export const AYUDA_GESTOR =
  "Escríbele por WhatsApp o desde el panel: te dice qué tienes, apunta o mueve citas y cambia servicios, equipo y horario, siempre con tu confirmación. Si lo desactivas, los avisos siguen llegando.";
export const AYUDA_CHAT_CLIENTES =
  "Cuando un cliente escriba al WhatsApp de reservas, la recepcionista le atenderá por chat con tus mismos servicios, horario y calendario. Si lo desactivas, se le pedirá que llame.";

type Feedback = { type: "success" | "error"; message: string } | null;

type WhatsappDuenoProps = {
  business: Business;
  hasToken: boolean | null;
};

/** Fecha larga en español; nunca se llama con `null` (evita «Invalid Date»). */
function fechaLarga(iso: string, conHora: boolean) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return conHora
    ? date.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })
    : date.toLocaleDateString("es-ES", { dateStyle: "long" });
}

const BADGES: Record<
  Exclude<WhatsappOwnerStatus, "sin_numero">,
  { texto: string; clases: string }
> = {
  activo: {
    texto: "Activo",
    clases: "bg-[#ecf7ec] text-[#2c7334] ring-[#d8efd7]",
  },
  pendiente: {
    texto: "Pendiente de activar",
    clases: "bg-[#fef8e7] text-[#9f7a15] ring-[#f0dfa8]",
  },
  sin_whatsapp: {
    texto: "Sin WhatsApp",
    clases: "bg-[#fdecec] text-[#c53030] ring-[#f5d3d3]",
  },
  baja: {
    texto: "Avisos desactivados",
    clases: "bg-[#f4f4f5] text-[#52525b] ring-[#e4e4e7]",
  },
};

/**
 * Ajustes › Teléfono › Tu móvil: el móvil del dueño, su estado y la vía de activación.
 * Guardar el móvil no activa nada por sí solo: el consentimiento lo da la
 * persona desde su propio móvil (mensaje «ALTA <código>» o el botón de la
 * plantilla). Por eso el enlace/QR se enseña siempre que hay código.
 */
export function WhatsappDueno({ business, hasToken }: WhatsappDuenoProps) {
  const queryClient = useQueryClient();
  const campoRef = useRef<HTMLInputElement>(null);
  const [movil, setMovil] = useState(business.ownerWhatsappNumber ?? "");
  const [editando, setEditando] = useState(false);
  const [movilError, setMovilError] = useState<string | null>(null);
  const [movilAviso, setMovilAviso] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [feedbackAviso, setFeedbackAviso] = useState<Feedback>(null);
  const [copiado, setCopiado] = useState(false);

  const estadoQuery = useQuery({
    queryKey: ["owner-whatsapp"],
    queryFn: getOwnerWhatsapp,
    enabled: hasToken === true,
    // La activación ocurre fuera del panel (el dueño envía ALTA desde su
    // móvil): mientras esté pendiente se consulta cada 10 s y al volver a
    // la pestaña, para que el estado cambie solo a «Activo».
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pendiente" ||
        status === "sin_whatsapp" ||
        status === "baja"
        ? 10_000
        : false;
    },
  });
  const estado = estadoQuery.data;

  // Si el número cambia desde fuera (otro dispositivo, un ALTA <código> desde
  // otro móvil) el campo se pone al día, salvo que la persona esté escribiendo.
  useEffect(() => {
    if (editando) return;
    setMovil(business.ownerWhatsappNumber ?? "");
  }, [business.ownerWhatsappNumber, editando]);

  // La checklist del panel enlaza a /ajustes#whatsapp: al llegar, la sección
  // se pone a la vista y el foco cae en el campo, que es lo que hay que rellenar.
  useEffect(() => {
    if (estadoQuery.isLoading) return;
    if (typeof window === "undefined" || window.location.hash !== "#whatsapp")
      return;
    const seccion = document.getElementById("whatsapp");
    if (seccion && typeof seccion.scrollIntoView === "function") {
      seccion.scrollIntoView({ block: "start" });
    }
    campoRef.current?.focus();
  }, [estadoQuery.isLoading]);

  const validar = (
    valor: string
  ): { ok: boolean; normalizado: string | null } => {
    if (valor.trim() === "") {
      setMovilError(null);
      setMovilAviso(null);
      return { ok: true, normalizado: null };
    }
    const normalizado = normalizarMovil(valor);
    if (!normalizado) {
      setMovilError(ERROR_MOVIL_INVALIDO);
      setMovilAviso(null);
      return { ok: false, normalizado: null };
    }
    setMovilError(null);
    const telefonoDelLocal = business.phone.startsWith("TEMP-")
      ? null
      : normalizarMovil(business.phone);
    // Si en el alta dijo que los avisos van al mismo móvil al que le llaman
    // los clientes (caso C del plan de telefonía), coincidir con la línea
    // no es una sospecha: es lo que pidió.
    const pareceDelLocal =
      esFijoEspanol(normalizado) ||
      (!business.ownerPhoneIsCustomerLine &&
        telefonoDelLocal !== null &&
        telefonoDelLocal === normalizado);
    setMovilAviso(pareceDelLocal ? AVISO_PARECE_FIJO : null);
    return { ok: true, normalizado };
  };

  const guardarMutation = useMutation({
    mutationFn: async (normalizado: string | null) => {
      // «Es el mismo que la línea de clientes» (Ajustes › Teléfono › Tu
      // móvil) solo es verdad mientras el móvil de los avisos coincida con
      // esa línea: si desde aquí se cambia o se quita, la casilla se apaga
      // en el mismo PATCH para no dejar un estado imposible.
      const lineaDeClientes = business.phone.startsWith("TEMP-")
        ? null
        : business.phone;
      const dejaDeSerLaLinea =
        business.ownerPhoneIsCustomerLine === true &&
        normalizado !== lineaDeClientes;
      const updated = await updateMyBusiness({
        ownerWhatsappNumber: normalizado,
        ...(dejaDeSerLaLinea ? { ownerPhoneIsCustomerLine: false } : {}),
      });
      // Un backend anterior descarta el campo sin error: la respuesta no lo
      // trae. En ese caso no se pide la activación (no hay móvil que activar).
      const guardado = updated.ownerWhatsappNumber === normalizado;
      let activacion: Awaited<
        ReturnType<typeof sendOwnerWhatsappActivation>
      > | null = null;
      if (normalizado && guardado) {
        activacion = await sendOwnerWhatsappActivation().catch(() => null);
      }
      return { updated, activacion, normalizado, guardado };
    },
    onSuccess: ({ updated, activacion, normalizado, guardado }) => {
      queryClient.setQueryData(["my-business"], updated);
      void queryClient.invalidateQueries({ queryKey: ["owner-whatsapp"] });
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      setEditando(false);
      if (!guardado) {
        setFeedback({
          type: "error",
          message: "No se pudo guardar el móvil. Inténtalo de nuevo.",
        });
        return;
      }
      if (normalizado === null) {
        setFeedback({
          type: "success",
          message: "Móvil eliminado. Ya no recibirás avisos por WhatsApp.",
        });
        return;
      }
      setFeedback({
        type: "success",
        message:
          activacion?.sent === "template"
            ? "Te hemos enviado un WhatsApp. Pulsa «Activar avisos» cuando te llegue."
            : "Móvil guardado. Ahora envía el mensaje desde WhatsApp para activar los avisos.",
      });
    },
    onError: (error) =>
      setFeedback({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo guardar el móvil. Inténtalo de nuevo."
        ),
      }),
  });

  const reenviarMutation = useMutation({
    mutationFn: sendOwnerWhatsappActivation,
    onSuccess: (data) => {
      queryClient.setQueryData(["owner-whatsapp"], data);
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      setFeedback(
        data.sent === "template"
          ? {
              type: "success",
              message: "Activación enviada. Mira tu WhatsApp.",
            }
          : {
              type: "error",
              message:
                "No hemos podido enviarte el mensaje. Escríbenos tú con el mensaje de abajo.",
            }
      );
    },
    onError: (error) => {
      // Los 409/429 traen su propio texto (ya escrito para el dueño); el
      // estado puede haber cambiado (baja, ya activo), así que se refresca.
      void queryClient.invalidateQueries({ queryKey: ["owner-whatsapp"] });
      setFeedback({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo enviar la activación. Inténtalo de nuevo."
        ),
      });
    },
  });

  // El toggle guarda al instante: el PATCH fusiona la preferencia con las
  // demás y devuelve el negocio entero, así que el estado de WhatsApp se
  // pone al día con la respuesta, sin esperar a un refetch.
  const avisoMutation = useMutation({
    mutationFn: async (avisoPorReserva: boolean) => {
      const updated = await updateMyBusiness({
        notificationPrefs: { avisoPorReserva },
      });
      // Un backend anterior descarta el campo sin error: la respuesta no lo
      // trae con el valor pedido. Se avisa en vez de fingir que se guardó.
      const guardado =
        updated.notificationPrefs?.avisoPorReserva === avisoPorReserva;
      return { updated, avisoPorReserva, guardado };
    },
    onSuccess: ({ updated, avisoPorReserva, guardado }) => {
      queryClient.setQueryData(["my-business"], updated);
      if (!guardado) {
        setFeedbackAviso({
          type: "error",
          message: "No se pudo guardar la preferencia. Inténtalo de nuevo.",
        });
        return;
      }
      queryClient.setQueryData<EstadoWhatsappDueno>(
        ["owner-whatsapp"],
        (previo) => (previo ? { ...previo, avisoPorReserva } : previo)
      );
      setFeedbackAviso({
        type: "success",
        message: avisoPorReserva
          ? "Te avisaremos de cada reserva nueva."
          : "Ya no te avisaremos de cada reserva nueva.",
      });
    },
    onError: (error) =>
      setFeedbackAviso({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo guardar la preferencia. Inténtalo de nuevo."
        ),
      }),
  });

  // Interruptores de las conversaciones (Beta): mismo PATCH, guardado al
  // instante; el negocio actualizado sustituye al de la caché.
  const [feedbackChat, setFeedbackChat] = useState<Feedback>(null);
  const chatMutation = useMutation({
    mutationFn: async (cambio: {
      campo: "ownerChatEnabled" | "clientChatEnabled";
      valor: boolean;
    }) => {
      const updated = await updateMyBusiness({ [cambio.campo]: cambio.valor });
      return {
        updated,
        cambio,
        guardado: updated[cambio.campo] === cambio.valor,
      };
    },
    onSuccess: ({ updated, cambio, guardado }) => {
      queryClient.setQueryData(["my-business"], updated);
      void queryClient.invalidateQueries({ queryKey: ["gestor"] });
      setFeedbackChat(
        guardado
          ? {
              type: "success",
              message:
                cambio.campo === "ownerChatEnabled"
                  ? cambio.valor
                    ? "El asistente queda activado."
                    : "El asistente queda desactivado."
                  : cambio.valor
                    ? "La recepcionista atenderá a los clientes por chat."
                    : "Los clientes que escriban recibirán un aviso para llamar.",
            }
          : {
              type: "error",
              message: "No se pudo guardar el ajuste. Inténtalo de nuevo.",
            }
      );
    },
    onError: (error) =>
      setFeedbackChat({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo guardar el ajuste. Inténtalo de nuevo."
        ),
      }),
  });

  const guardar = (valor: string) => {
    setFeedback(null);
    const { ok, normalizado } = validar(valor);
    if (!ok) return;
    const actual = business.ownerWhatsappNumber ?? null;
    if (normalizado === null && actual === null) {
      setMovilError("Escribe tu móvil con WhatsApp.");
      campoRef.current?.focus();
      return;
    }
    if (normalizado !== null && normalizado === actual) {
      // Mismo móvil que ya está guardado: si ya consintió (o pidió la baja)
      // no hay nada que activar, y pedirlo solo produciría un 409.
      if (estado?.status === "activo") {
        setEditando(false);
        setMovil(actual);
        setFeedback({
          type: "success",
          message: "Los avisos ya están activos en este móvil.",
        });
        return;
      }
      if (estado?.status === "baja") {
        setEditando(false);
        setMovil(actual);
        setFeedback({
          type: "error",
          message:
            "Ese móvil pidió no recibir avisos. Solo puede volver a activarlos escribiendo ALTA desde el propio móvil.",
        });
        return;
      }
    }
    if (normalizado === null) {
      if (
        !window.confirm(
          "Si quitas el móvil dejarás de recibir los avisos por WhatsApp. ¿Continuar?"
        )
      ) {
        return;
      }
    } else if (
      estado?.status === "activo" &&
      actual !== null &&
      normalizado !== actual &&
      !window.confirm(
        "Al cambiar de móvil tendrás que activar los avisos otra vez en el nuevo. ¿Continuar?"
      )
    ) {
      return;
    }
    guardarMutation.mutate(normalizado);
  };

  const copiarEnlace = async (enlace: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Portapapeles bloqueado: el enlace también se abre con el botón de al
      // lado, así que no hace falta alarmar.
      setCopiado(false);
    }
  };

  const ocupado = guardarMutation.isPending || reenviarMutation.isPending;
  const ayudaId = "settings-owner-whatsapp-hint";
  const errorId = "settings-owner-whatsapp-error";
  const status = estado?.status;
  const numeroFormateado = estado?.ownerWhatsappNumber
    ? formatearMovil(estado.ownerWhatsappNumber)
    : null;
  const alhablaFormateado = estado
    ? formatearMovil(estado.alhablaNumber)
    : null;
  const badge = status && status !== "sin_numero" ? BADGES[status] : null;
  const alta = estado?.alta ?? null;
  const puedeReenviar =
    Boolean(estado?.canSendTemplate) &&
    (status === "pendiente" || status === "sin_whatsapp");
  // Con un número tecleado y sin guardar, «Reenviar» mandaría la plantilla
  // al móvil antiguo y diría que ya está: primero hay que guardar.
  const cambiosSinGuardar =
    editando &&
    normalizarMovil(movil) !== (business.ownerWhatsappNumber ?? null);

  if (estadoQuery.isLoading) {
    return (
      <div className="mt-5 flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Cargando estado de WhatsApp…
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-5">
      {badge ? (
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${badge.clases}`}
        >
          {badge.texto}
        </span>
      ) : null}

      {estado ? (
        <TextoDeEstado estado={estado} numero={numeroFormateado} />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[#c53030]">
            No se pudo comprobar el estado de WhatsApp.
          </p>
          <button
            type="button"
            onClick={() => void estadoQuery.refetch()}
            className="btn-secondary h-11 shrink-0 px-4"
          >
            Reintentar
          </button>
        </div>
      )}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          guardar(movil);
        }}
      >
        <label className="block text-sm font-semibold text-[#27272a]">
          Tu móvil con WhatsApp
          <input
            ref={campoRef}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={movil}
            onChange={(event) => {
              setEditando(true);
              setMovil(event.target.value);
              if (movilError) setMovilError(null);
            }}
            onBlur={() => validar(movil)}
            placeholder="600 123 456"
            aria-describedby={movilError ? `${ayudaId} ${errorId}` : ayudaId}
            aria-invalid={Boolean(movilError) || status === "sin_whatsapp"}
            className="field mt-2 w-full"
          />
          <span
            id={ayudaId}
            className="mt-1 block text-xs font-normal leading-5 text-muted"
          >
            {AYUDA_MOVIL}
            {alhablaFormateado
              ? ` Te escribiremos desde el número de Alhabla para negocios, ${alhablaFormateado}.`
              : ""}
          </span>
          {movilError ? (
            <span
              id={errorId}
              className="mt-1 block text-xs font-normal leading-5 text-[#c53030]"
            >
              {movilError}
            </span>
          ) : movilAviso ? (
            <span className="mt-1 block text-xs font-normal leading-5 text-[#9f7a15]">
              {movilAviso}
            </span>
          ) : null}
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="submit"
            disabled={ocupado || Boolean(movilError)}
            className="btn-primary shrink-0"
          >
            {guardarMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {guardarMutation.isPending ? "Guardando…" : "Guardar y activar"}
          </button>
          {puedeReenviar ? (
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                reenviarMutation.mutate();
              }}
              disabled={ocupado || cambiosSinGuardar}
              title={cambiosSinGuardar ? "Guarda primero el móvil" : undefined}
              className="btn-secondary shrink-0"
            >
              {reenviarMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              {status === "sin_whatsapp"
                ? "Volver a intentar"
                : "Reenviar activación"}
            </button>
          ) : null}
          {business.ownerWhatsappNumber ? (
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    "Si quitas el móvil dejarás de recibir los avisos por WhatsApp. ¿Continuar?"
                  )
                ) {
                  return;
                }
                // El campo se vacía cuando el borrado se confirma (el
                // efecto de sincronización lo hace al cambiar el negocio);
                // si el PATCH falla, el número guardado sigue a la vista.
                setEditando(false);
                setMovilError(null);
                setMovilAviso(null);
                setFeedback(null);
                guardarMutation.mutate(null);
              }}
              disabled={ocupado}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold text-[#52525b] transition duration-200 hover:bg-[#fafafa] hover:text-[#c53030] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Quitar el móvil
            </button>
          ) : null}
        </div>
        <FeedbackMessage value={feedback} />
      </form>

      {estado && alta ? (
        <BloqueAlta
          alta={alta}
          status={estado.status}
          copiado={copiado}
          onCopiar={() => void copiarEnlace(alta.link)}
        />
      ) : null}

      {estado && status !== "sin_numero" ? (
        <div className="space-y-2">
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
            <input
              type="checkbox"
              checked={estado.avisoPorReserva}
              disabled={avisoMutation.isPending}
              onChange={(event) => {
                setFeedbackAviso(null);
                avisoMutation.mutate(event.target.checked);
              }}
              aria-describedby="settings-owner-whatsapp-aviso-hint"
              className="mt-1 accent-[#8b5cf6]"
            />
            <span>
              <span className="font-semibold">
                Avisarme por WhatsApp de cada reserva nueva
              </span>
              <span
                id="settings-owner-whatsapp-aviso-hint"
                className="mt-1 block text-xs leading-5 text-muted"
              >
                {AYUDA_AVISO_RESERVA}
              </span>
            </span>
          </label>
          <FeedbackMessage value={feedbackAviso} />
        </div>
      ) : null}

      <div className="space-y-2" id="conversaciones">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#0a0a0a]">
            Conversaciones
          </h3>
          <span className="badge-soft">Beta</span>
        </div>
        <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
          <input
            type="checkbox"
            checked={business.ownerChatEnabled !== false}
            disabled={chatMutation.isPending}
            onChange={(event) => {
              setFeedbackChat(null);
              chatMutation.mutate({
                campo: "ownerChatEnabled",
                valor: event.target.checked,
              });
            }}
            aria-describedby="settings-gestor-hint"
            className="mt-1 accent-[#8b5cf6]"
          />
          <span>
            <span className="font-semibold">
              Tu asistente por WhatsApp y en el panel
            </span>
            <span
              id="settings-gestor-hint"
              className="mt-1 block text-xs leading-5 text-muted"
            >
              {AYUDA_GESTOR}
            </span>
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
          <input
            type="checkbox"
            checked={business.clientChatEnabled !== false}
            disabled={chatMutation.isPending}
            onChange={(event) => {
              setFeedbackChat(null);
              chatMutation.mutate({
                campo: "clientChatEnabled",
                valor: event.target.checked,
              });
            }}
            aria-describedby="settings-chat-clientes-hint"
            className="mt-1 accent-[#8b5cf6]"
          />
          <span>
            <span className="font-semibold">
              La recepcionista atiende a tus clientes por chat
            </span>
            <span
              id="settings-chat-clientes-hint"
              className="mt-1 block text-xs leading-5 text-muted"
            >
              {AYUDA_CHAT_CLIENTES}
            </span>
          </span>
        </label>
        <FeedbackMessage value={feedbackChat} />
      </div>
    </div>
  );
}

function TextoDeEstado({
  estado,
  numero,
}: {
  estado: EstadoWhatsappDueno;
  numero: string | null;
}) {
  switch (estado.status) {
    case "sin_numero":
      return (
        <p className="text-sm leading-6 text-muted">
          Añade tu móvil para recibir los avisos por WhatsApp.
        </p>
      );
    case "pendiente": {
      const enviado =
        estado.canSendTemplate && estado.activationSentAt
          ? fechaLarga(estado.activationSentAt, true)
          : null;
      return (
        <p className="text-sm leading-6 text-muted">
          {enviado
            ? `Te enviamos un WhatsApp el ${enviado}. Pulsa «Activar avisos» en ese mensaje. ¿No lo ves? Reenvía la activación o escríbenos tú con el mensaje de abajo.`
            : "Falta un paso: envíanos un mensaje desde tu móvil para saber que este número es tuyo. Ya viene escrito, solo tienes que darle a enviar."}
        </p>
      );
    }
    case "activo": {
      const desde = estado.optInAt ? fechaLarga(estado.optInAt, false) : null;
      return (
        <div className="space-y-1 text-sm leading-6 text-muted">
          <p>
            Recibes los avisos en{" "}
            <span className="font-semibold text-[#27272a]">{numero}</span>.
            {desde ? ` Activado el ${desde}.` : ""}
          </p>
          <p className="text-xs leading-5">
            Para dejar de recibir avisos, escribe STOP a Alhabla desde ese
            móvil. Si cambias de móvil, guarda el nuevo número: tendrás que
            activarlo otra vez.
          </p>
        </div>
      );
    }
    case "sin_whatsapp": {
      const cuando = estado.unreachableAt
        ? fechaLarga(estado.unreachableAt, false)
        : null;
      return (
        <p className="text-sm leading-6 text-[#c53030]">
          No hemos podido entregar el mensaje en {numero}
          {cuando ? ` (el ${cuando})` : ""}: parece que no tiene WhatsApp.
          Revisa el número o escribe otro móvil.
        </p>
      );
    }
    case "baja": {
      const cuando = estado.optOutAt
        ? fechaLarga(estado.optOutAt, false)
        : null;
      return (
        <p className="text-sm leading-6 text-muted">
          {cuando
            ? `Pediste no recibir avisos el ${cuando}. Para volver a activarlos, escribe ALTA a Alhabla desde ese móvil o pulsa «Abrir WhatsApp».`
            : "Ese móvil pidió no recibir avisos de Alhabla. Para volver a activarlos, escribe ALTA desde ese móvil o pulsa «Abrir WhatsApp»."}
        </p>
      );
    }
    default:
      return null;
  }
}

function BloqueAlta({
  alta,
  status,
  copiado,
  onCopiar,
}: {
  alta: NonNullable<EstadoWhatsappDueno["alta"]>;
  status: WhatsappOwnerStatus;
  copiado: boolean;
  onCopiar: () => void;
}) {
  const caduca = fechaLarga(alta.expiresAt, false);
  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[#0a0a0a]">
        Actívalo desde tu móvil
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        {status === "sin_numero"
          ? "¿Prefieres hacerlo desde el móvil? Envíanos este mensaje y quedará vinculado:"
          : "Envía este mensaje al WhatsApp de Alhabla desde el móvil que quieras usar:"}
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="rounded-[10px] border border-[#e5e5e5] bg-white px-4 py-3 font-mono text-base font-semibold tracking-wide text-[#0a0a0a]">
            {alta.text}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={alta.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary justify-center"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Abrir WhatsApp
            </a>
            <button
              type="button"
              onClick={onCopiar}
              className="btn-secondary justify-center"
            >
              {copiado ? (
                <Check className="h-4 w-4 text-[#2c7334]" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copiado ? "Copiado" : "Copiar enlace"}
            </button>
          </div>
          {caduca ? (
            <p className="text-xs leading-5 text-muted">
              El código caduca el {caduca}; si caduca, aquí verás otro.
            </p>
          ) : null}
        </div>
        <div className="hidden shrink-0 sm:block">
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-3">
            <QRCodeSVG
              value={alta.link}
              size={160}
              fgColor="#0a0a0a"
              role="img"
              aria-label="Código QR para abrir WhatsApp con el mensaje de activación"
            />
          </div>
          <p className="mt-2 max-w-[184px] text-xs leading-5 text-muted">
            O escanea este código con la cámara del móvil.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeedbackMessage({ value }: { value: Feedback }) {
  return (
    <p
      aria-live="polite"
      className={`text-sm leading-6 ${
        value?.type === "success" ? "text-[#2c7334]" : "text-[#c53030]"
      }`}
    >
      {value?.message ?? ""}
    </p>
  );
}

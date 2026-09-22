"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  Headset,
  Loader2,
  Phone,
  PhoneForwarded,
  Save,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import {
  CODIGOS_FIJO,
  CODIGOS_MOVIL,
  CodigoFila,
  ComprobarDesvio,
  NotaDeLinea,
} from "@/components/call-forwarding-card";
import { DEFAULT_AGENT_SETTINGS } from "@/components/agent-settings-editor";
import {
  OPERATIONAL_TONE,
  buildOperationalStatus,
} from "@/components/operational-status";
import { PasarLlamadas } from "@/components/pasar-llamadas";
import {
  TIPOS_CON_LINEA_PROPIA,
  TarjetasDeLinea,
} from "@/components/tarjetas-de-linea";
import { WhatsappDueno } from "@/components/whatsapp-dueno";
import {
  getOnboardingState,
  getPhoneNumberInfo,
  sendOwnerWhatsappActivation,
  updateMyBusiness,
} from "@/lib/api";
import { describeApiError } from "@/lib/api-errors";
import { formatDate, formatPhone } from "@/lib/format";
import {
  modoDePasarLlamadas,
  motivoSinMovilParaPasarLlamadas,
} from "@/lib/pasar-llamadas";
import { TEXTO_MOVIL_SIN_DESVIO_EN_AJUSTES } from "@/lib/numero-principal";
import {
  esFijoEspanol,
  esMovilEspanol,
  normalizarMovil,
  tipoDeLineaTrasCambiarTelefono,
} from "@/lib/phone";
import type {
  Business,
  CustomerLineType,
  ModoDePasarLlamadas,
  OnboardingForwarding,
} from "@/lib/types";

export const ERROR_LINEA_INVALIDA =
  "Añade el prefijo del país y escribe solo números, por ejemplo +34 930 453 218.";
export const AVISO_LINEA_PARECE_MOVIL =
  "Ese número parece un móvil, no un fijo. Revisa el tipo de línea.";
export const AVISO_LINEA_PARECE_FIJO =
  "Ese número parece un fijo, no un móvil. Revisa el tipo de línea.";
export const AVISO_FALTA_NUMERO =
  "Escribe el número al que te llaman tus clientes para guardar el tipo de línea.";
export const TEXTO_ALHABLA_PRINCIPAL =
  "Tu número de Alhabla es tu teléfono: publícalo en Google y en tu web. No hay nada que desviar.";
export const TEXTO_SIN_MOVIL_PARA_PASAR =
  "Añade tu móvil más abajo para que tu recepcionista pueda pasarte llamadas.";
/** El backend solo transfiere a fijos y móviles de España (la pata la paga
 * Alhabla): con un móvil extranjero no hay tool, y hay que decirlo. */
export const TEXTO_MOVIL_FUERA_DE_ESPANA_PARA_PASAR =
  "Tu recepcionista solo puede pasar llamadas a un móvil o fijo de España, y el móvil que tienes guardado más abajo no lo es. Hasta que lo cambies, lo atenderá todo ella.";
export const CONFIRMACION_CAMBIO_DE_MOVIL =
  "Los avisos pasarán a tu línea de clientes y tendrás que activarlos otra vez desde ese móvil. ¿Continuar?";
export const ERROR_LINEA_SIN_WHATSAPP =
  "Esa línea es un fijo y no tiene WhatsApp. Escribe abajo el móvil al que quieres los avisos.";

type Feedback = { type: "success" | "error"; message: string } | null;

type AjustesTelefonoProps = {
  business: Business;
  hasToken: boolean | null;
};

const ES_MOVIL: Record<CustomerLineType, boolean> = {
  fijo: false,
  movil_trabajo: true,
  movil_personal: true,
  alhabla: false,
};

function telefonoGuardado(business: Business): string | null {
  return business.phone.startsWith("TEMP-") ? null : business.phone;
}

/**
 * La línea de clientes propia del negocio: `Business.phone` salvo que sea
 * el placeholder del registro o el propio número de Alhabla (caso E, «usar
 * como número principal»), que no es una línea que desviar ni un móvil al
 * que mandar avisos.
 */
function lineaPropia(
  business: Business,
  numeroDeAlhabla: string | null
): string | null {
  const telefono = telefonoGuardado(business);
  if (telefono === null) return null;
  return numeroDeAlhabla !== null && telefono === numeroDeAlhabla
    ? null
    : telefono;
}

/**
 * Ajustes › Teléfono (PLAN-TELEFONIA-UX.md § 5, fase 2): los tres números
 * del negocio contados en orden — la línea a la que llaman los clientes, el
 * número de la recepcionista y el móvil del dueño — para que cuando algo
 * falle se sepa cuál tocar.
 */
export function AjustesTelefono({ business, hasToken }: AjustesTelefonoProps) {
  const onboardingQuery = useQuery({
    queryKey: ["onboarding-state"],
    queryFn: getOnboardingState,
    enabled: hasToken === true,
  });
  const phoneQuery = useQuery({
    queryKey: ["phone-number"],
    queryFn: getPhoneNumberInfo,
    enabled: hasToken === true,
  });

  const forwarding = onboardingQuery.data?.forwarding;
  const numeroDeAlhabla = buildOperationalStatus({
    business,
    agentActive: true,
    phone: phoneQuery.data,
    forwardingStatus: forwarding?.status,
    phoneUnavailable: phoneQuery.isError,
    forwardingUnavailable: onboardingQuery.isError,
  }).find((item) => item.key === "phone");
  // El número de Alhabla en E.164, solo cuando está activo de verdad: es el
  // que se publica como teléfono del negocio al usarlo como principal.
  const numeroDeAlhablaActivo =
    phoneQuery.data?.status === "active"
      ? (phoneQuery.data.phoneNumber ?? null)
      : null;

  return (
    <section
      id="telefono"
      className="panel scroll-mt-24 p-4 sm:p-6"
      aria-labelledby="telefono-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
          <Phone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2
            id="telefono-title"
            className="text-lg font-semibold text-[#0a0a0a]"
          >
            Teléfono
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Qué número es cuál: la línea a la que llaman tus clientes, el número
            de tu recepcionista y tu móvil.
          </p>
        </div>
      </div>

      <div className="mt-5 divide-y divide-[#e5e5e5]">
        <LineaDeClientes
          business={business}
          forwarding={forwarding}
          forwardingNoDisponible={onboardingQuery.isError}
          numeroDeAlhablaActivo={numeroDeAlhablaActivo}
        />
        <TuRecepcionista
          business={business}
          estado={numeroDeAlhabla ?? null}
          numeroDeAlhablaActivo={numeroDeAlhablaActivo}
          cargando={phoneQuery.isLoading}
        />
        <TuMovil
          business={business}
          hasToken={hasToken}
          numeroDeAlhabla={
            numeroDeAlhablaActivo ?? forwarding?.phoneNumber ?? null
          }
        />
      </div>
    </section>
  );
}

function Bloque({
  id,
  icon: Icon,
  titulo,
  descripcion,
  children,
}: {
  id: string;
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="group"
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 py-5 first:pt-0 last:pb-0"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3
            id={`${id}-title`}
            className="text-base font-semibold text-[#0a0a0a]"
          >
            {titulo}
          </h3>
          <p className="mt-0.5 text-sm leading-6 text-muted">{descripcion}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

/**
 * Bloque 1: el número (`Business.phone`) y su tipo, editables juntos; el
 * estado del desvío con «Comprobar desvío» y los códigos para activarlo o
 * quitarlo según el tipo. Con el número de Alhabla como principal, `phone`
 * ES el número de Alhabla (es el que la recepcionista da a los clientes)
 * y no hay desvío que enseñar.
 */
function LineaDeClientes({
  business,
  forwarding,
  forwardingNoDisponible,
  numeroDeAlhablaActivo,
}: {
  business: Business;
  forwarding: OnboardingForwarding | undefined;
  /** La consulta del onboarding falló: no sabemos cómo está el desvío. */
  forwardingNoDisponible: boolean;
  /** Número de Alhabla en E.164 si está activo; null si no hay o no lo está. */
  numeroDeAlhablaActivo: string | null;
}) {
  const queryClient = useQueryClient();
  const numeroDeAlhabla =
    numeroDeAlhablaActivo ?? forwarding?.phoneNumber ?? null;
  const telefonoActual = telefonoGuardado(business);
  const lineaActual = lineaPropia(business, numeroDeAlhabla);
  const tipoActual = business.customerLineType ?? null;
  const [telefono, setTelefono] = useState(lineaActual ?? "");
  const [tipo, setTipo] = useState<CustomerLineType | null>(tipoActual);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  // Si el negocio cambia desde fuera (otra pestaña, «Usar como número
  // principal» más abajo), el formulario se pone al día con lo guardado.
  useEffect(() => {
    setTelefono(lineaActual ?? "");
    setTipo(tipoActual);
  }, [lineaActual, tipoActual]);

  const telefonoNormalizado =
    telefono.trim() === "" ? null : normalizarMovil(telefono);
  const telefonoInvalido =
    telefono.trim() !== "" && telefonoNormalizado === null;
  const pideNumero = tipo !== "alhabla";
  // Con Alhabla como principal el teléfono del negocio pasa a ser el
  // número de Alhabla: es el que la recepcionista dice en voz alta y pone
  // en los mensajes al cliente, así que no puede quedarse la línea antigua.
  const telefonoAEnviar = pideNumero
    ? telefonoNormalizado
    : numeroDeAlhablaActivo;
  const cambiaElTelefono =
    telefonoAEnviar !== null && telefonoAEnviar !== telefonoActual;
  const faltaNumero = pideNumero && tipo !== null && telefono.trim() === "";
  const hayCambios =
    !faltaNumero &&
    (tipo !== tipoActual || cambiaElTelefono) &&
    (pideNumero || numeroDeAlhablaActivo !== null);
  // La tarjeta «quiero usar el de Alhabla» solo cuando hay un número de
  // Alhabla activo que publicar; si ya está elegida se sigue enseñando.
  const tiposDisponibles =
    numeroDeAlhablaActivo !== null || tipoActual === "alhabla"
      ? undefined
      : TIPOS_CON_LINEA_PROPIA;

  // Un fijo con tipo «móvil» (o al revés) dejaría a la tarjeta de desvío
  // enseñando los códigos equivocados. Al escribir se corrige solo; si la
  // persona vuelve a elegir el tipo a mano, se avisa sin bloquear (puede
  // ser un número extranjero o un caso que no sabemos leer).
  const avisoDeTipo =
    pideNumero && telefonoNormalizado && tipo
      ? tipo === "fijo" && esMovilEspanol(telefonoNormalizado)
        ? AVISO_LINEA_PARECE_MOVIL
        : ES_MOVIL[tipo] && esFijoEspanol(telefonoNormalizado)
          ? AVISO_LINEA_PARECE_FIJO
          : null
      : null;

  const cambiarTelefono = (valor: string) => {
    setTelefono(valor);
    setFeedback(null);
    const normalizado = normalizarMovil(valor);
    if (!normalizado) return;
    const ajuste = tipoDeLineaTrasCambiarTelefono(tipo, normalizado);
    if (ajuste !== undefined) setTipo(ajuste);
  };

  const guardarMutation = useMutation({
    mutationFn: async () => {
      // «Los avisos van al mismo móvil al que te llaman» deja de ser verdad
      // si la línea cambia a otro número: se apaga en el mismo PATCH y el
      // móvil de los avisos se queda como estaba (cambiarlo reiniciaría la
      // activación sin que nadie lo haya pedido).
      const apagaMismoMovil =
        business.ownerPhoneIsCustomerLine === true &&
        cambiaElTelefono &&
        telefonoAEnviar !== (business.ownerWhatsappNumber ?? null);
      const updated = await updateMyBusiness({
        ...(cambiaElTelefono ? { phone: telefonoAEnviar } : {}),
        ...(tipo !== tipoActual ? { customerLineType: tipo } : {}),
        ...(apagaMismoMovil ? { ownerPhoneIsCustomerLine: false } : {}),
      });
      return { updated, apagaMismoMovil };
    },
    onSuccess: ({ updated, apagaMismoMovil }) => {
      queryClient.setQueryData(["my-business"], updated);
      // El desvío depende de la línea (y «alhabla» lo da por hecho).
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      setFeedback({
        type: "success",
        message:
          apagaMismoMovil && business.ownerWhatsappNumber
            ? `Línea de clientes guardada. Los avisos siguen yendo al ${formatPhone(business.ownerWhatsappNumber)}; si quieres que vayan a la nueva línea, márcalo abajo.`
            : "Línea de clientes guardada.",
      });
    },
    onError: (error) =>
      setFeedback({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo guardar la línea de clientes."
        ),
      }),
  });

  const copiar = async (valor: string, id: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(id);
      window.setTimeout(
        () => setCopiado((actual) => (actual === id ? null : actual)),
        2000
      );
    } catch {
      // Portapapeles bloqueado: el código está a la vista y se copia a mano.
      setCopiado(null);
    }
  };

  const codigos =
    tipoActual === "fijo"
      ? CODIGOS_FIJO
      : tipoActual && ES_MOVIL[tipoActual]
        ? CODIGOS_MOVIL
        : null;

  // Con Alhabla como principal, el número que se está dando a los clientes
  // se enseña siempre: si por lo que sea sigue siendo la línea antigua
  // (guardado antes de que el cambio la sustituyera), «Guardar línea» lo
  // corrige.
  const numeroPublicado = telefonoActual;
  const publicadoEsElDeAlhabla =
    numeroPublicado !== null && numeroPublicado === numeroDeAlhabla;

  return (
    <Bloque
      id="linea-de-clientes"
      icon={PhoneForwarded}
      titulo="Línea de clientes"
      descripcion="El número al que llaman tus clientes. Es el que se desvía a tu recepcionista y el que ella les da para cambiar o anular una cita."
    >
      <div>
        <p
          id="linea-de-clientes-tipo-title"
          className="text-sm font-semibold text-[#27272a]"
        >
          ¿Qué tipo de línea es?
        </p>
        <div className="mt-2">
          <TarjetasDeLinea
            name="ajustes-tipo-de-linea"
            value={tipo}
            onChange={(nuevo) => {
              setTipo(nuevo);
              setFeedback(null);
            }}
            tipos={tiposDisponibles}
            disabled={guardarMutation.isPending}
            aria-labelledby="linea-de-clientes-tipo-title"
          />
        </div>
      </div>

      {pideNumero ? (
        <label className="block text-sm font-semibold text-[#27272a]">
          Número al que te llaman tus clientes
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={telefono}
            onChange={(event) => cambiarTelefono(event.target.value)}
            aria-describedby="linea-de-clientes-hint"
            aria-invalid={telefonoInvalido}
            className="field mt-2 w-full"
            placeholder="+34 930 453 218"
          />
          <span
            id="linea-de-clientes-hint"
            className={`mt-1 block text-xs font-normal leading-5 ${
              telefonoInvalido
                ? "text-[#c53030]"
                : avisoDeTipo || (faltaNumero && tipo !== tipoActual)
                  ? "text-[#9f7a15]"
                  : "text-muted"
            }`}
          >
            {telefonoInvalido
              ? ERROR_LINEA_INVALIDA
              : faltaNumero && tipo !== tipoActual
                ? AVISO_FALTA_NUMERO
                : (avisoDeTipo ??
                  "Con prefijo internacional. Los avisos para ti van a tu móvil, más abajo.")}
          </span>
        </label>
      ) : (
        <div className="rounded-2xl bg-[#f3eeff] px-4 py-3 text-sm leading-6 text-[#6d28d9]">
          <p>{TEXTO_ALHABLA_PRINCIPAL}</p>
          {tipoActual === "alhabla" && numeroPublicado ? (
            <p className="mt-1">
              Número que tu recepcionista da a tus clientes:{" "}
              <span className="font-semibold tabular-nums">
                {formatPhone(numeroPublicado)}
              </span>
              {!publicadoEsElDeAlhabla && numeroDeAlhablaActivo
                ? ". Sigue siendo tu línea antigua: guarda para que sea el de Alhabla."
                : "."}
            </p>
          ) : tipoActual !== "alhabla" && numeroDeAlhablaActivo ? (
            <p className="mt-1">
              Al guardar, tu teléfono pasará a ser el{" "}
              <span className="font-semibold tabular-nums">
                {formatPhone(numeroDeAlhablaActivo)}
              </span>
              .
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FeedbackMessage value={feedback} />
        <button
          type="button"
          onClick={() => guardarMutation.mutate()}
          disabled={
            guardarMutation.isPending || telefonoInvalido || !hayCambios
          }
          className="btn-primary shrink-0"
        >
          {guardarMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {guardarMutation.isPending ? "Guardando…" : "Guardar línea"}
        </button>
      </div>

      {tipoActual !== "alhabla" ? (
        <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-[#0a0a0a]">
              Desvío a tu recepcionista
            </p>
            <EstadoDelDesvio
              forwarding={forwarding}
              noDisponible={forwardingNoDisponible}
            />
          </div>

          {!forwarding ||
          forwarding.status === "waiting_number" ||
          !numeroDeAlhabla ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              {forwarding?.status === "waiting_number"
                ? "Tu número de Alhabla se está activando. En cuanto esté, aquí podrás comprobar el desvío y ver los códigos."
                : forwardingNoDisponible
                  ? "No hemos podido consultar el estado del desvío. Recarga la página en un momento."
                  : !forwarding
                    ? "Consultando el estado del desvío…"
                    : "Cuando tengas tu número de Alhabla, aquí podrás comprobar el desvío y ver los códigos."}
            </p>
          ) : forwarding.customerLine === null ? (
            <p className="mt-2 text-sm leading-6 text-muted">
              Guarda arriba el número al que te llaman tus clientes para poder
              comprobar el desvío.
            </p>
          ) : (
            <ComprobarDesvio
              customerLine={forwarding.customerLine}
              contexto="ajustes"
            />
          )}

          {numeroDeAlhabla && numeroDeAlhablaActivo ? (
            codigos ? (
              <details className="group mt-3">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-1 py-2 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
                  Códigos para activar o quitar el desvío
                  <ChevronDown
                    className="h-4 w-4 transition duration-200 group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {tipoActual === "fijo"
                    ? "Descuelga el fijo y marca el código tras el tono, como si fuera una llamada. Es el mismo en todas las compañías."
                    : "Marca el código en el móvil como si fuera una llamada normal. Funciona igual en todas las compañías."}
                </p>
                <ul className="mt-2 space-y-2">
                  {codigos.map((codigo) => (
                    <li key={codigo.id}>
                      <CodigoFila
                        codigo={codigo}
                        numero={numeroDeAlhabla}
                        copiado={copiado}
                        onCopiar={copiar}
                      />
                    </li>
                  ))}
                </ul>
                {tipoActual === "fijo" ? (
                  <NotaDeLinea>
                    Si tu fijo tiene contestador, desactívalo o se quedará él
                    las llamadas. En Movistar se quita marcando{" "}
                    <span className="font-mono text-[#27272a]">#10#</span>.
                  </NotaDeLinea>
                ) : (
                  <NotaDeLinea>
                    Este desvío sustituye al buzón de voz: las llamadas que no
                    cojas irán a tu recepcionista en vez de al contestador.
                  </NotaDeLinea>
                )}
              </details>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted">
                Elige el tipo de línea y guarda para ver los códigos de activar
                y quitar el desvío.
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </Bloque>
  );
}

/**
 * «Comprobado el …» solo cuando la llamada de comprobación entró de verdad
 * (`forwardingCheckedAt`); lo demás es «sin comprobar», aunque el dueño
 * dijera que sí o ya hayan entrado llamadas.
 */
function EstadoDelDesvio({
  forwarding,
  noDisponible,
}: {
  forwarding: OnboardingForwarding | undefined;
  noDisponible: boolean;
}) {
  if (!forwarding && noDisponible) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 text-xs text-muted">
        No se ha podido comprobar
      </span>
    );
  }
  if (!forwarding) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Consultando…
      </span>
    );
  }
  if (forwarding.checkedAt) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecf7ec] px-3 py-1.5 text-xs font-semibold text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Comprobado el {formatDate(forwarding.checkedAt)}
      </span>
    );
  }
  return (
    <span
      className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#fef8e7] px-3 py-1.5 text-xs font-semibold text-[#9f7a15] ring-1 ring-inset ring-[#f0dfa8]"
      title={
        forwarding.firstCallAt
          ? "Ya han entrado llamadas desviadas, pero nunca has pulsado «Comprobar desvío»."
          : undefined
      }
    >
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
      Sin comprobar
    </span>
  );
}

/**
 * Bloque 2: el número de Alhabla y su estado (misma fuente que el panel de
 * inicio), el enlace a la recepcionista y «Usar como número principal», que
 * lleva a la pantalla de la fase 4 (/ajustes/numero-principal: qué cambia,
 * dónde publicarlo, qué hacer con el número antiguo). Con Alhabla como
 * principal enseña aquí el ajuste «Cuándo pasarme llamadas».
 */
function TuRecepcionista({
  business,
  estado,
  numeroDeAlhablaActivo,
  cargando,
}: {
  business: Business;
  estado: ReturnType<typeof buildOperationalStatus>[number] | null;
  numeroDeAlhablaActivo: string | null;
  cargando: boolean;
}) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const esPrincipal = business.customerLineType === "alhabla";
  const numeroActivo = estado?.tone === "ok" && numeroDeAlhablaActivo !== null;
  const motivoSinMovil = motivoSinMovilParaPasarLlamadas(
    business,
    numeroDeAlhablaActivo
  );
  const hayMovil = motivoSinMovil === null;
  const modoActual = modoDePasarLlamadas(business, numeroDeAlhablaActivo);

  // Se manda el bloque entero de agentSettings (como hace /agente): el
  // backend valida el objeto completo y una clave suelta no vale.
  const pasarMutation = useMutation({
    mutationFn: (modo: ModoDePasarLlamadas) =>
      updateMyBusiness({
        agentSettings: {
          ...DEFAULT_AGENT_SETTINGS,
          ...business.agentSettings,
          pasarLlamadas: modo,
        },
      }),
    onSuccess: (updated, modo) => {
      queryClient.setQueryData(["my-business"], updated);
      setFeedback({
        type: "success",
        message:
          modo === "nunca"
            ? "Tu recepcionista no te pasará llamadas: tomará recado."
            : modo === "siempre"
              ? "Te pasará las llamadas que haga falta dentro de tu horario."
              : "Te pasará la llamada cuando el cliente pida hablar contigo.",
      });
    },
    onError: (error) =>
      setFeedback({
        type: "error",
        message: describeApiError(error, "No se pudo guardar el ajuste."),
      }),
  });

  const tono = estado ? OPERATIONAL_TONE[estado.tone] : null;
  const TonoIcono = tono?.icon;

  return (
    <Bloque
      id="tu-recepcionista"
      icon={Headset}
      titulo="Tu recepcionista"
      descripcion="El número de Alhabla al que llega el desvío. No hace falta dárselo a nadie, salvo que lo uses como número principal."
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">Tu número de Alhabla</p>
          {cargando && !estado ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Consultando…
            </p>
          ) : numeroActivo ? (
            <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#0a0a0a]">
              {estado?.value}
            </p>
          ) : (
            <p
              className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${tono?.text ?? "text-muted"}`}
            >
              {TonoIcono ? (
                <TonoIcono className="h-4 w-4" aria-hidden="true" />
              ) : null}
              {estado?.value ?? "Sin número todavía"}
            </p>
          )}
          {estado?.action && "href" in estado.action ? (
            <Link
              href={estado.action.href}
              className="mt-1 inline-block text-xs font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              {estado.action.label}
            </Link>
          ) : estado?.action && "kind" in estado.action ? (
            <Link
              href="/"
              className="mt-1 inline-block text-xs font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
            >
              Reintentar desde el panel
            </Link>
          ) : null}
        </div>
        {numeroActivo ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecf7ec] px-3 py-1.5 text-xs font-semibold text-[#2c7334] ring-1 ring-inset ring-[#d8efd7]">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Activo
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link href="/agente" className="btn-secondary shrink-0">
          <Bot className="h-4 w-4" aria-hidden="true" />
          Configurar la recepcionista
        </Link>
        {esPrincipal ? (
          <p className="text-sm leading-6 text-muted">
            Es tu número principal: tu recepcionista atiende todas las llamadas
            que entran por él.
          </p>
        ) : numeroActivo ? (
          <Link
            href="/ajustes/numero-principal"
            className="btn-purple shrink-0"
          >
            <Headset className="h-4 w-4" aria-hidden="true" />
            Usar como número principal
          </Link>
        ) : null}
      </div>
      {!esPrincipal && numeroActivo ? (
        <p className="text-xs leading-5 text-muted">
          Si lo usas como número principal, publicas el de Alhabla como teléfono
          del negocio y tu recepcionista lo atiende todo, sin desvío. Tu línea
          de siempre puede seguir desviada mientras dure el cambio.
        </p>
      ) : null}

      {esPrincipal ? (
        <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
          <p
            id="ajustes-pasar-llamadas-title"
            className="text-sm font-semibold text-[#0a0a0a]"
          >
            Cuándo pasarme llamadas
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            {hayMovil && business.ownerWhatsappNumber
              ? `Tu recepcionista puede pasar la llamada a tu móvil (${formatPhone(business.ownerWhatsappNumber)}). Si no la coges, retoma ella y toma recado.`
              : motivoSinMovil === "fuera_de_espana"
                ? TEXTO_MOVIL_FUERA_DE_ESPANA_PARA_PASAR
                : TEXTO_SIN_MOVIL_PARA_PASAR}
          </p>
          {hayMovil ? (
            <div className="mt-3">
              <PasarLlamadas
                name="ajustes-pasar-llamadas"
                value={modoActual}
                onChange={(modo) => {
                  setFeedback(null);
                  pasarMutation.mutate(modo);
                }}
                disabled={pasarMutation.isPending}
                aria-labelledby="ajustes-pasar-llamadas-title"
              />
              {modoActual !== "nunca" ? (
                // Con Alhabla como principal ya no sabemos si el móvil
                // venía de ser la línea de clientes con desvío: se avisa
                // siempre, porque un desvío al número de Alhabla anula la
                // transferencia sin ningún otro síntoma.
                <NotaDeLinea>{TEXTO_MOVIL_SIN_DESVIO_EN_AJUSTES}</NotaDeLinea>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2">
            <FeedbackMessage value={feedback} />
          </div>
        </div>
      ) : null}
    </Bloque>
  );
}

/**
 * Bloque 3: el móvil del dueño (avisos, recados y Gestor: el bloque
 * `WhatsappDueno`), «es el mismo que la línea de clientes» cuando esa línea
 * es un móvil y la privacidad «no des mi número a los clientes».
 */
function TuMovil({
  business,
  hasToken,
  numeroDeAlhabla,
}: {
  business: Business;
  hasToken: boolean | null;
  numeroDeAlhabla: string | null;
}) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const tipo = business.customerLineType ?? null;
  const lineaEsMovil = tipo !== null && ES_MOVIL[tipo];
  const linea = lineaPropia(business, numeroDeAlhabla);
  const movilActual = business.ownerWhatsappNumber ?? null;
  // La casilla pinta la realidad, no solo el flag: marcada únicamente si
  // los avisos van de verdad a la línea de clientes. Si el móvil o la línea
  // cambiaron por otro lado, se ve desmarcada y se puede volver a marcar.
  const avisosEnLaLinea =
    business.ownerPhoneIsCustomerLine === true &&
    linea !== null &&
    movilActual === linea;

  const ajustesMutation = useMutation({
    mutationFn: async (cambio: {
      campo: "ownerPhoneIsCustomerLine" | "hideOwnerNumberFromClients";
      valor: boolean;
      /** Al marcar «es el mismo», los avisos pasan a la línea de clientes. */
      movil?: string;
    }) => {
      const updated = await updateMyBusiness({
        [cambio.campo]: cambio.valor,
        ...(cambio.movil ? { ownerWhatsappNumber: cambio.movil } : {}),
      });
      // Un backend anterior descarta el campo sin error: se avisa en vez de
      // fingir que se guardó.
      const guardado = updated[cambio.campo] === cambio.valor;
      // Cambiar el móvil reinicia la activación: se pide la plantilla igual
      // que al guardarlo desde el bloque de abajo o en el alta, para que el
      // dueño no tenga que descubrir el enlace por su cuenta.
      const activacion =
        cambio.movil && guardado && updated.ownerWhatsappNumber === cambio.movil
          ? await sendOwnerWhatsappActivation().catch(() => null)
          : null;
      return { updated, cambio, guardado, activacion };
    },
    onSuccess: ({ updated, cambio, guardado, activacion }) => {
      queryClient.setQueryData(["my-business"], updated);
      if (cambio.movil) {
        void queryClient.invalidateQueries({ queryKey: ["owner-whatsapp"] });
        void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
      }
      if (!guardado) {
        setFeedback({
          type: "error",
          message: "No se pudo guardar el ajuste. Inténtalo de nuevo.",
        });
        return;
      }
      setFeedback({
        type: "success",
        message:
          cambio.campo === "ownerPhoneIsCustomerLine"
            ? cambio.valor
              ? cambio.movil
                ? activacion?.sent === "template"
                  ? `Los avisos irán al ${formatPhone(cambio.movil)}. Te hemos enviado un WhatsApp: pulsa «Activar avisos» cuando te llegue.`
                  : `Los avisos irán al ${formatPhone(cambio.movil)}. Actívalos desde ese móvil con el mensaje de abajo.`
                : "Los avisos van al mismo móvil al que te llaman tus clientes."
              : "Los avisos van a otro móvil: escríbelo abajo."
            : cambio.valor
              ? "Tu recepcionista no dará tu número: tomará recado."
              : "Tu recepcionista dará tu número cuando haga falta.",
      });
    },
    onError: (error) =>
      setFeedback({
        type: "error",
        message: describeApiError(
          error,
          "No se pudo guardar el ajuste. Inténtalo de nuevo."
        ),
      }),
  });

  const marcarMismoMovil = (valor: boolean) => {
    setFeedback(null);
    if (!valor) {
      ajustesMutation.mutate({ campo: "ownerPhoneIsCustomerLine", valor });
      return;
    }
    // Sin línea guardada la casilla no se enseña; un fijo con tipo «móvil»
    // (avisado arriba) no tiene WhatsApp al que mandar nada.
    if (linea === null || esFijoEspanol(linea)) {
      setFeedback({ type: "error", message: ERROR_LINEA_SIN_WHATSAPP });
      return;
    }
    const cambiaDeMovil = movilActual !== null && movilActual !== linea;
    if (cambiaDeMovil && !window.confirm(CONFIRMACION_CAMBIO_DE_MOVIL)) return;
    ajustesMutation.mutate({
      campo: "ownerPhoneIsCustomerLine",
      valor,
      ...(movilActual !== linea ? { movil: linea } : {}),
    });
  };

  return (
    <Bloque
      id="whatsapp"
      icon={Smartphone}
      titulo="Tu móvil"
      descripcion="Donde tu recepcionista te avisa de cada reserva y recado por WhatsApp, y donde te escribe el Gestor."
    >
      {tipo !== "alhabla" ? (
        <div className="space-y-2">
          {lineaEsMovil && linea !== null ? (
            <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
              <input
                type="checkbox"
                checked={avisosEnLaLinea}
                disabled={ajustesMutation.isPending}
                onChange={(event) => marcarMismoMovil(event.target.checked)}
                aria-describedby="settings-mismo-movil-hint"
                className="mt-1 accent-[#8b5cf6]"
              />
              <span>
                <span className="font-semibold">
                  Es el mismo que la línea de clientes
                </span>
                <span
                  id="settings-mismo-movil-hint"
                  className="mt-1 block text-xs leading-5 text-muted"
                >
                  Los avisos te llegan al móvil al que te llaman tus clientes (
                  {formatPhone(linea)}). Coincidir con esa línea no es un error.
                </span>
              </span>
            </label>
          ) : null}
          <label className="flex min-h-11 items-start gap-3 rounded-xl border border-[#e5e5e5] p-3 text-sm text-[#27272a]">
            <input
              type="checkbox"
              checked={business.hideOwnerNumberFromClients === true}
              disabled={ajustesMutation.isPending}
              onChange={(event) => {
                setFeedback(null);
                ajustesMutation.mutate({
                  campo: "hideOwnerNumberFromClients",
                  valor: event.target.checked,
                });
              }}
              aria-describedby="settings-ocultar-numero-hint"
              className="mt-1 accent-[#8b5cf6]"
            />
            <span>
              <span className="font-semibold">
                No des mi número a los clientes
              </span>
              <span
                id="settings-ocultar-numero-hint"
                className="mt-1 block text-xs leading-5 text-muted"
              >
                Tu recepcionista no lo dirá ni lo pondrá en los mensajes: que
                dejen recado y les llamas tú.
              </span>
            </span>
          </label>
          <FeedbackMessage value={feedback} />
        </div>
      ) : null}

      <WhatsappDueno business={business} hasToken={hasToken} />
    </Bloque>
  );
}

function FeedbackMessage({ value }: { value: Feedback }) {
  if (!value) return <span />;
  return (
    <p
      aria-live="polite"
      className={`text-sm leading-6 ${
        value.type === "success" ? "text-[#2c7334]" : "text-[#c53030]"
      }`}
    >
      {value.message}
    </p>
  );
}

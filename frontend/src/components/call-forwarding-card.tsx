"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Copy,
  Loader2,
  PhoneCall,
  PhoneForwarded,
  Clock3,
  TriangleAlert,
} from "lucide-react";
import {
  TIPOS_CON_LINEA_PROPIA,
  TarjetasDeLinea,
} from "@/components/tarjetas-de-linea";
import {
  confirmForwarding,
  getForwardingCheck,
  startForwardingCheck,
  updateMyBusiness,
} from "@/lib/api";
import { apiErrorCode } from "@/lib/api-errors";
import { formatPhone } from "@/lib/format";
import type {
  CustomerLineType,
  ForwardingCheckErrorCode,
  ForwardingCheckFailureReason,
  OnboardingForwarding,
} from "@/lib/types";

export type CodigoDeDesvio = {
  id: string;
  titulo: string;
  descripcion: string;
  activar: (numero: string) => string;
  desactivar: string;
  recomendado: boolean;
};

/**
 * Códigos MMI del estándar GSM (3GPP TS 22.030): son los mismos en Movistar,
 * Vodafone, Orange, Yoigo y MásMóvil, no dependen de la operadora. Se marcan
 * en el teléfono como una llamada normal.
 *
 * El primero es el que corresponde a la promesa del producto — «solo las
 * llamadas que no contestas» — así que va primero y es el recomendado.
 */
export const CODIGOS_MOVIL: CodigoDeDesvio[] = [
  {
    id: "no-contesta",
    titulo: "Cuando no contestas",
    descripcion: "Suena en tu teléfono; si no lo coges, atiende tu recepcionista. Es el recomendado.",
    activar: (numero: string) => `**61*${numero}#`,
    desactivar: "##61#",
    recomendado: true,
  },
  {
    id: "comunicando",
    titulo: "Cuando estás comunicando",
    descripcion: "Para no perder al cliente que llama mientras hablas con otro.",
    activar: (numero: string) => `**67*${numero}#`,
    desactivar: "##67#",
    recomendado: false,
  },
  {
    id: "apagado",
    titulo: "Cuando estás sin cobertura o apagado",
    descripcion: "Cubre las horas en las que tienes el teléfono apagado o sin línea.",
    activar: (numero: string) => `**62*${numero}#`,
    desactivar: "##62#",
    recomendado: false,
  },
  {
    id: "todas",
    titulo: "Todas las llamadas",
    descripcion: "Tu teléfono no suena: todas van directas a la recepcionista.",
    activar: (numero: string) => `**21*${numero}#`,
    desactivar: "##21#",
    recomendado: false,
  },
];

/**
 * En un fijo los códigos son los mismos pero sin el `**` inicial (PLAN-
 * TELEFONIA-UX.md § 2): se marcan desde el propio aparato tras el tono. Solo
 * los dos que tienen sentido en un local: «si no contestas» y «todas».
 */
export const CODIGOS_FIJO: CodigoDeDesvio[] = [
  {
    id: "fijo-no-contesta",
    titulo: "Cuando no contestas",
    descripcion: "Suena en el local; si nadie lo coge, atiende tu recepcionista. Es el recomendado.",
    activar: (numero: string) => `*61*${numero}#`,
    desactivar: "#61#",
    recomendado: true,
  },
  {
    id: "fijo-todas",
    titulo: "Todas las llamadas",
    descripcion: "El fijo no suena: todas van directas a la recepcionista.",
    activar: (numero: string) => `*21*${numero}#`,
    desactivar: "#21#",
    recomendado: false,
  },
];

/**
 * «Comprobar desvío» (PLAN-TELEFONIA-UX.md § 4): el panel pregunta el
 * resultado cada 2 s. La llamada saliente espera hasta 35 s a que salte el
 * desvío y luego llega el webhook, así que 25 consultas (50 s) cubren el
 * caso más lento; pasado eso se da por no recibido y se ofrece repetir.
 */
export const INTERVALO_DE_CONSULTA_MS = 2000;
export const MAX_CONSULTAS = 25;

/** Qué hacer según por qué no ha funcionado (§ 4 punto 5 del plan). */
export const TEXTO_POR_MOTIVO: Record<ForwardingCheckFailureReason, { titulo: string; detalle: string }> = {
  la_has_cogido: {
    titulo: "Alguien ha cogido la llamada",
    detalle:
      "Puede que la hayas cogido tú por reflejo o que la tenga un contestador. Vuelve a comprobarlo y deja que suene sin cogerla; si esa línea tiene contestador, desactívalo antes.",
  },
  comunicando: {
    titulo: "Tu línea estaba comunicando o ha rechazado la llamada",
    detalle:
      "Cuelga lo que tengas en curso y vuelve a comprobarlo. Si quieres que las llamadas que entran mientras hablas también lleguen a tu recepcionista, activa además el desvío «cuando estás comunicando».",
  },
  sin_desvio: {
    titulo: "No ha saltado el desvío",
    detalle:
      "La llamada ha sonado hasta agotar el tiempo sin llegar a tu recepcionista. Revisa que marcaste bien el código desde el teléfono de esa línea. Si es un fijo con contestador, desactívalo (en Movistar, #10#) o se quedará él las llamadas.",
  },
  desconocido: {
    titulo: "No hemos podido completar la llamada",
    detalle:
      "Inténtalo otra vez en unos minutos. Si estás seguro de que el desvío está activo, marca «Ya lo he activado» y lo confirmaremos con la primera llamada real.",
  },
};

const TEXTO_POR_CODIGO_DE_ERROR: Record<ForwardingCheckErrorCode, string> = {
  sin_numero: "Tu número de Alhabla todavía no está activo. Espera unos minutos y vuelve a probar.",
  linea_de_clientes_invalida:
    "Necesitamos el teléfono al que te llaman tus clientes, distinto del número de Alhabla. Revísalo en Ajustes.",
  linea_no_admitida:
    "Solo podemos comprobar el desvío de un fijo o un móvil de España. Revisa el teléfono de tus clientes en Ajustes.",
  comprobacion_en_curso: "Ya hay una comprobación en marcha. Espera un minuto y vuelve a probar.",
  limite_alcanzado: "Has agotado las tres comprobaciones de esta hora. Puedes volver a intentarlo más tarde.",
  telefonia_no_configurada: "No hemos podido llamar a tu línea. Inténtalo en unos minutos.",
  no_se_pudo_llamar: "No hemos podido llamar a tu línea. Inténtalo en unos minutos.",
};

function textoDeErrorAlComprobar(error: unknown): string {
  const code = apiErrorCode(error) as ForwardingCheckErrorCode | null;
  return (code && TEXTO_POR_CODIGO_DE_ERROR[code]) ||
    "No hemos podido iniciar la comprobación. Inténtalo otra vez en unos segundos.";
}

type CallForwardingCardProps = {
  forwarding: OnboardingForwarding;
  /**
   * Tipo de la línea de clientes (`Business.customerLineType`): decide qué
   * códigos y qué avisos se enseñan. null o ausente = negocio anterior a la
   * fase 1 del plan de telefonía: se enseña todo y se pregunta aquí mismo.
   */
  customerLineType?: CustomerLineType | null;
};

export function CallForwardingCard({
  forwarding,
  customerLineType,
}: CallForwardingCardProps) {
  const queryClient = useQueryClient();
  const [copiado, setCopiado] = useState<string | null>(null);
  const tipoDeLinea = customerLineType ?? null;

  const confirmMutation = useMutation({
    mutationFn: confirmForwarding,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    },
  });

  const copiar = async (valor: string, id: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(id);
      window.setTimeout(() => setCopiado((actual) => (actual === id ? null : actual)), 2000);
    } catch {
      // Portapapeles bloqueado (permisos del navegador): el código está a la
      // vista, así que se puede copiar a mano; no hace falta alarmar.
      setCopiado(null);
    }
  };

  // Con el número de Alhabla como teléfono del negocio no hay nada que
  // desviar: el paso se da por hecho (el backend lo marca como tal).
  if (tipoDeLinea === "alhabla") return null;

  if (forwarding.status === "waiting_number") {
    return (
      <section id="desvio" className="panel scroll-mt-32 border-[#e5e5e5] bg-[#fafafa] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
            <Clock3 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
              Estamos activando tu número
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Tu número español tarda unos minutos en quedar aprobado. En cuanto lo esté, aquí mismo te
              diremos cómo desviar tu línea de siempre para empezar a recibir llamadas. Mientras tanto,
              completa la configuración: es lo que tu recepcionista necesita para poder reservar citas.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const numero = forwarding.phoneNumber;
  if (!numero) return null;

  const esMovil =
    tipoDeLinea === "movil_trabajo" || tipoDeLinea === "movil_personal";
  const esFijo = tipoDeLinea === "fijo";
  const recomendado = CODIGOS_MOVIL[0];
  const otrosCodigos = CODIGOS_MOVIL.slice(1);

  return (
    <section
      id="desvio"
      className="panel scroll-mt-32 border-[#ddd6fe] bg-[#f3eeff] p-4 sm:p-5"
      aria-labelledby="desvio-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#8b5cf6]">
          <PhoneForwarded className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="desvio-title" className="text-base font-semibold text-[#0a0a0a] sm:text-lg">
            Activa el desvío para empezar a recibir llamadas
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Tus clientes siguen llamando a tu número de siempre. El desvío es lo que hace que las
            llamadas que no puedes coger lleguen a tu recepcionista, sin cambiar de número ni avisar a
            nadie.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">Tu número de Alhabla</p>
          <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-[#0a0a0a]">
            {formatPhone(numero)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => copiar(numero, "numero")}
          className="btn-secondary h-11 shrink-0 px-4"
        >
          {copiado === "numero" ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copiar número
            </>
          )}
        </button>
      </div>

      {tipoDeLinea === null && forwarding.customerLine ? (
        <PreguntaTipoDeLinea customerLine={forwarding.customerLine} />
      ) : null}

      {esFijo ? (
        <>
          <h3 className="mt-5 text-sm font-semibold text-[#0a0a0a]">Desde el fijo del local</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Descuelga el teléfono del local y marca el código tras el tono, como si fuera una llamada.
            Es el mismo en todas las compañías.
          </p>
          <ul className="mt-3 space-y-2">
            {CODIGOS_FIJO.map((codigo) => (
              <li key={codigo.id}>
                <CodigoFila codigo={codigo} numero={numero} copiado={copiado} onCopiar={copiar} />
              </li>
            ))}
          </ul>
          <NotaDeLinea>
            Si tu fijo tiene contestador, desactívalo o se quedará él las llamadas. En Movistar se
            quita marcando <span className="font-mono text-[#27272a]">#10#</span>.
          </NotaDeLinea>
        </>
      ) : null}

      {esMovil || tipoDeLinea === null ? (
        <>
          <h3 className="mt-5 text-sm font-semibold text-[#0a0a0a]">
            {esMovil ? "Desde tu móvil" : "Desde un móvil"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Marca el código en tu teléfono como si fuera una llamada normal. Funciona igual en Movistar,
            Vodafone, Orange, Yoigo y MásMóvil.
          </p>

          {/* Solo el recomendado a la vista: elegir entre cuatro modos de desvío
              es una decisión que este usuario no tiene por qué tomar para empezar. */}
          <div className="mt-3">
            <CodigoFila
              codigo={recomendado}
              numero={numero}
              copiado={copiado}
              onCopiar={copiar}
            />
          </div>

          <details className="group mt-2">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-1 py-2 text-sm font-semibold text-[#6d28d9] transition duration-200 hover:text-[#8b5cf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]">
              Otras formas de desviar
              <ChevronDown className="h-4 w-4 transition duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="mt-2 space-y-2">
              {otrosCodigos.map((codigo) => (
                <li key={codigo.id}>
                  <CodigoFila codigo={codigo} numero={numero} copiado={copiado} onCopiar={copiar} />
                </li>
              ))}
            </ul>
          </details>

          {esMovil ? (
            <NotaDeLinea>
              Este desvío sustituye al buzón de voz: las llamadas que no cojas irán a tu recepcionista
              en vez de al contestador.
            </NotaDeLinea>
          ) : null}
        </>
      ) : null}

      {tipoDeLinea === null ? (
        <>
          <h3 className="mt-5 text-sm font-semibold text-[#0a0a0a]">Desde un fijo</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Descuelga y marca <span className="font-mono text-[#27272a]">*61*{numero}#</span> tras el
            tono para desviar las llamadas que no contestas, o{" "}
            <span className="font-mono text-[#27272a]">*21*{numero}#</span> para desviarlas todas. Si el
            fijo tiene contestador, desactívalo o se quedará él las llamadas.
          </p>
        </>
      ) : null}

      <ComprobarDesvio customerLine={forwarding.customerLine} />

      <div className="mt-5 flex flex-col gap-3 border-t border-[#ddd6fe] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Si prefieres no comprobarlo, en cuanto entre la primera llamada lo damos por hecho automáticamente.
        </p>
        <button
          type="button"
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending}
          className="btn-primary h-11 shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirmMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          Ya lo he activado
        </button>
      </div>

      {confirmMutation.isError ? (
        <p className="mt-3 text-sm font-medium text-[#c53030]">
          No se pudo guardar la confirmación. Inténtalo otra vez en unos segundos.
        </p>
      ) : null}
    </section>
  );
}

/** Aviso corto bajo los códigos (contestador, buzón de voz). */
export function NotaDeLinea({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-[#9f7a15]">
      <TriangleAlert className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Negocio anterior a la fase 1 del plan de telefonía: no dijo de qué tipo
 * es su línea. Se pregunta aquí, una vez, y se guarda al elegir; el negocio
 * en caché se sustituye por el que devuelve el PATCH para que la tarjeta
 * cambie de códigos al instante.
 */
function PreguntaTipoDeLinea({ customerLine }: { customerLine: string }) {
  const queryClient = useQueryClient();
  const guardarMutation = useMutation({
    mutationFn: (tipo: CustomerLineType) =>
      updateMyBusiness({ customerLineType: tipo }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["my-business"], updated);
      void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
    },
  });

  return (
    <div className="mt-4 rounded-2xl bg-white p-4">
      <h3 id="desvio-tipo-de-linea-title" className="text-sm font-semibold text-[#0a0a0a]">
        ¿De qué tipo es esta línea?
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">
        Tus clientes te llaman al {formatPhone(customerLine)}. Dinos qué es y te enseñamos solo los
        códigos que le corresponden.
      </p>
      <div className="mt-3">
        {/* Si el PATCH falla, la tarjeta se suelta: un radio que sigue marcado
            no vuelve a disparar onChange y no se podría reintentar la misma. */}
        <TarjetasDeLinea
          name="desvio-tipo-de-linea"
          value={guardarMutation.isError ? null : (guardarMutation.variables ?? null)}
          onChange={(tipo) => guardarMutation.mutate(tipo)}
          tipos={TIPOS_CON_LINEA_PROPIA}
          disabled={guardarMutation.isPending}
          aria-labelledby="desvio-tipo-de-linea-title"
        />
      </div>
      {guardarMutation.isError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[#c53030]">
          No se pudo guardar el tipo de línea. Inténtalo otra vez en unos segundos.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Estados: inactiva → aviso («te vamos a llamar, no lo cojas») → en curso
 * (polling) → ok / fallo con motivo / sin respuesta. El resultado ok no
 * cierra la tarjeta solo: el mensaje se queda a la vista hasta que la
 * persona pulsa «Continuar», que refresca la guía (y la tarjeta desaparece
 * porque el paso ya está hecho).
 *
 * Se comparte con Ajustes › Teléfono (fase 2 del plan): mismo bloque, misma
 * conversación con el backend.
 */
export function ComprobarDesvio({ customerLine }: { customerLine: string | null | undefined }) {
  const queryClient = useQueryClient();
  const [fase, setFase] = useState<"inactiva" | "aviso" | "en_curso">("inactiva");
  const [checkId, setCheckId] = useState<string | null>(null);
  const consultas = useRef(0);

  const startMutation = useMutation({
    mutationFn: startForwardingCheck,
    onSuccess: (check) => {
      consultas.current = 0;
      setCheckId(check.id);
      setFase("en_curso");
    },
  });

  const checkQuery = useQuery({
    queryKey: ["forwarding-check", checkId],
    queryFn: () => {
      consultas.current += 1;
      return getForwardingCheck(checkId!);
    },
    enabled: checkId !== null,
    staleTime: 0,
    refetchInterval: (query) => {
      if (query.state.data?.resultado || consultas.current >= MAX_CONSULTAS) return false;
      return INTERVALO_DE_CONSULTA_MS;
    },
  });

  // Desestructurado a propósito: TanStack solo vuelve a renderizar por las
  // propiedades leídas en el render, y `isFetching` tiene que contar aunque
  // el dato (sin resultado) no cambie entre consultas.
  const {
    data: comprobacionActual,
    isFetching: consultando,
    isError: consultaFallida,
  } = checkQuery;
  const resultado = comprobacionActual?.resultado ?? null;
  const sinRespuesta =
    fase === "en_curso" && !resultado && consultas.current >= MAX_CONSULTAS && !consultando;
  const fallo = resultado?.estado === "fallo" ? resultado : null;

  const empezar = () => {
    setCheckId(null);
    startMutation.mutate();
  };

  const reiniciar = () => {
    setCheckId(null);
    startMutation.reset();
    setFase("aviso");
  };

  const continuar = () => {
    void queryClient.invalidateQueries({ queryKey: ["onboarding-state"] });
  };

  // `undefined` = backend anterior a la fase 3 (Vercel puede publicar esta
  // interfaz unos minutos antes que Cloud Run): sin el bloque, sin ruido.
  if (customerLine === undefined) return null;

  if (customerLine === null) {
    return (
      <div className="mt-5 rounded-2xl bg-white p-4">
        <h3 className="text-sm font-semibold text-[#0a0a0a]">Comprueba que funciona</h3>
        <p className="mt-1 text-sm leading-6 text-muted">
          Para comprobar el desvío necesitamos el teléfono al que te llaman tus clientes.{" "}
          <Link
            href="/ajustes"
            className="font-semibold text-[#6d28d9] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          >
            Añádelo en Ajustes
          </Link>{" "}
          y vuelve aquí.
        </p>
      </div>
    );
  }

  const lineaLegible = formatPhone(customerLine);

  return (
    <div className="mt-5 rounded-2xl bg-white p-4" aria-live="polite">
      <h3 className="text-sm font-semibold text-[#0a0a0a]">Comprueba que funciona</h3>

      {fase === "inactiva" ? (
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted">
            Te llamamos a tu línea de clientes desde tu número de Alhabla y vemos si la llamada
            vuelve a tu recepcionista. Tarda menos de un minuto.
          </p>
          <button type="button" onClick={() => setFase("aviso")} className="btn-purple h-11 shrink-0 px-5">
            <PhoneCall className="h-4 w-4" aria-hidden="true" />
            Comprobar desvío
          </button>
        </div>
      ) : null}

      {fase === "aviso" ? (
        <div className="mt-2 rounded-2xl border border-[#ddd6fe] bg-[#f3eeff] p-4">
          <p className="text-sm font-semibold text-[#0a0a0a]">
            Vamos a llamar al {lineaLegible}. No lo cojas.
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Deja que suene: si has activado el desvío «cuando no contestas», tardará unos segundos
            en saltar a tu recepcionista. Si lo coges, la comprobación no vale.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={empezar}
              disabled={startMutation.isPending}
              className="btn-purple h-11 px-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PhoneCall className="h-4 w-4" aria-hidden="true" />
              )}
              Llamar ahora
            </button>
            <button
              type="button"
              onClick={() => {
                startMutation.reset();
                setFase("inactiva");
              }}
              disabled={startMutation.isPending}
              className="btn-secondary h-11 px-5"
            >
              Cancelar
            </button>
          </div>
          {startMutation.isError ? (
            <p role="alert" className="mt-3 text-sm font-medium text-[#c53030]">
              {textoDeErrorAlComprobar(startMutation.error)}
            </p>
          ) : null}
        </div>
      ) : null}

      {fase === "en_curso" && !resultado && !sinRespuesta ? (
        <div className="mt-2 flex items-start gap-3 rounded-2xl border border-[#ddd6fe] bg-[#f3eeff] p-4">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[#8b5cf6]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a]">Llamando al {lineaLegible}… no lo cojas</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Estamos esperando a que la llamada llegue a tu recepcionista. Puede tardar hasta un minuto.
            </p>
          </div>
        </div>
      ) : null}

      {resultado?.estado === "ok" ? (
        <div className="mt-2 rounded-2xl border border-[#d8efd7] bg-[#ecf7ec] p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#2c7334]">
            <CircleCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
            Desvío funcionando
          </p>
          <p className="mt-1 text-sm leading-6 text-[#2c7334]">
            La llamada al {lineaLegible} ha llegado a tu recepcionista. Tus clientes ya pueden reservar
            aunque no cojas el teléfono.
          </p>
          <button type="button" onClick={continuar} className="btn-primary mt-3 h-11 px-5">
            <Check className="h-4 w-4" aria-hidden="true" />
            Continuar
          </button>
        </div>
      ) : null}

      {fallo || sinRespuesta ? (
        <div className="mt-2 rounded-2xl border border-[#f5d3d3] bg-[#fff1f1] p-4" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#c53030]">
            <TriangleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            {fallo ? TEXTO_POR_MOTIVO[fallo.motivo].titulo : "No hemos recibido respuesta"}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#7f1d1d]">
            {fallo
              ? TEXTO_POR_MOTIVO[fallo.motivo].detalle
              : "La comprobación no ha terminado a tiempo. Espera un minuto y vuelve a intentarlo."}
          </p>
          <button type="button" onClick={reiniciar} className="btn-secondary mt-3 h-11 px-5">
            <PhoneCall className="h-4 w-4" aria-hidden="true" />
            Volver a comprobar
          </button>
        </div>
      ) : null}

      {fase === "en_curso" && consultaFallida ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[#c53030]">
          Hemos perdido el hilo de la comprobación. Vuelve a intentarlo en un minuto.{" "}
          <button type="button" onClick={reiniciar} className="font-semibold underline underline-offset-2">
            Volver a comprobar
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function CodigoFila({
  codigo,
  numero,
  copiado,
  onCopiar,
}: {
  codigo: CodigoDeDesvio;
  numero: string;
  copiado: string | null;
  onCopiar: (valor: string, id: string) => void;
}) {
  const valor = codigo.activar(numero);

  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0a0a0a]">
            {codigo.titulo}
            {codigo.recomendado ? <span className="badge-soft">Recomendado</span> : null}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted">{codigo.descripcion}</p>
        </div>
        <button
          type="button"
          onClick={() => onCopiar(valor, codigo.id)}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-[#e5e5e5] bg-white px-4 font-mono text-sm text-[#0a0a0a] transition duration-200 hover:border-[#8b5cf6] hover:bg-[#f3eeff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]"
          aria-label={`Copiar el código ${valor}`}
        >
          {copiado === codigo.id ? (
            <Check className="h-4 w-4 shrink-0 text-[#2c7334]" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 shrink-0 text-[#52525b]" aria-hidden="true" />
          )}
          {valor}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Para anularlo más adelante, marca{" "}
        <span className="font-mono text-[#27272a]">{codigo.desactivar}</span>
      </p>
    </div>
  );
}

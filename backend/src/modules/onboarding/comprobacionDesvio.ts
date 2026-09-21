import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { errorMessage } from "../../lib/logUtils.js";
import { isValidE164Phone } from "../../lib/phone.js";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";

/**
 * «Comprobar desvío» (PLAN-TELEFONIA-UX.md § 4): el número de Alhabla del
 * negocio llama a su línea de clientes. Si el desvío está bien marcado, esa
 * llamada vuelve a entrar por el propio número de Alhabla y
 * webhookHandlers.ts la reconoce (`from` = número de Alhabla) antes de
 * arrancar la recepcionista: la comprobación pasa a `ok`, se cuelga y no se
 * guarda ninguna Call. Si la pata saliente termina sin que haya entrado
 * nada, la comprobación es un `fallo` con el motivo que Telnyx nos dé.
 *
 * Todo el estado vive en Redis (no hace falta tabla): la comprobación dura
 * segundos y el panel la consulta por polling. Solo queda en Postgres el
 * resultado que importa, `OnboardingState.forwardingCheckedAt`.
 */

export const COMPROBACION_TTL_SEGUNDOS = 120;
/** Tres intentos por hora y negocio: cada uno es una llamada real. */
export const LIMITE_DE_COMPROBACIONES_POR_HORA = 3;
/**
 * Lo que espera Telnyx a que contesten antes de colgar con `timeout`. Un
 * desvío «si no contesta» en un fijo puede tardar 30 s en saltar (§ 6 del
 * plan), así que se deja margen; el panel espera hasta 50 s.
 */
export const TIMEOUT_DE_LLAMADA_SEGUNDOS = 35;
/** Si alguien la coge (el dueño o un contestador) no tiene sentido que dure. */
export const DURACION_MAXIMA_DE_LLAMADA_SEGUNDOS = 60;

export const MOTIVOS_DE_FALLO = [
  "la_has_cogido",
  "comunicando",
  "sin_desvio",
  "desconocido",
] as const;
export type MotivoDeFallo = (typeof MOTIVOS_DE_FALLO)[number];

export type ResultadoDeComprobacion =
  { estado: "ok" } | { estado: "fallo"; motivo: MotivoDeFallo };

export interface ComprobacionDeDesvio {
  id: string;
  businessId: string;
  /** Línea de clientes a la que se llamó (E.164). */
  linea: string;
  startedAt: string;
  /** `call_control_id` de la pata saliente, para poder colgarla. */
  callControlId: string | null;
  /** La saliente la cogió alguien (el dueño o su contestador). */
  contestada: boolean;
  /** null mientras está en curso. */
  resultado: ResultadoDeComprobacion | null;
  resueltaAt: string | null;
}

export const CODIGOS_DE_ERROR_DE_COMPROBACION = {
  sin_numero: 402,
  linea_de_clientes_invalida: 409,
  comprobacion_en_curso: 409,
  limite_alcanzado: 429,
  telefonia_no_configurada: 503,
  no_se_pudo_llamar: 502,
} as const;
export type CodigoDeErrorDeComprobacion =
  keyof typeof CODIGOS_DE_ERROR_DE_COMPROBACION;

export class ComprobacionDeDesvioError extends Error {
  readonly status: number;
  constructor(
    readonly codigo: CodigoDeErrorDeComprobacion,
    message: string
  ) {
    super(message);
    this.name = "ComprobacionDeDesvioError";
    this.status = CODIGOS_DE_ERROR_DE_COMPROBACION[codigo];
  }
}

const TIPO_DE_CLIENT_STATE = "comprobacion_desvio";

const ClientStateSchema = z.object({
  tipo: z.literal(TIPO_DE_CLIENT_STATE),
  businessId: z.string().min(1),
  checkId: z.string().min(1),
});

export type ClientStateDeComprobacion = z.infer<typeof ClientStateSchema>;

/** `client_state` de la pata saliente: Telnyx exige base64 y lo devuelve tal
 * cual en cada webhook de esa pata. */
export function codificarClientState(input: {
  businessId: string;
  checkId: string;
}): string {
  return Buffer.from(
    JSON.stringify({ tipo: TIPO_DE_CLIENT_STATE, ...input }),
    "utf8"
  ).toString("base64");
}

/** null si el `client_state` no existe, no es base64/JSON o no es nuestro. */
export function leerClientStateDeComprobacion(
  clientState: unknown
): ClientStateDeComprobacion | null {
  if (typeof clientState !== "string" || clientState.length === 0) return null;
  try {
    const parsed = ClientStateSchema.safeParse(
      JSON.parse(Buffer.from(clientState, "base64").toString("utf8"))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function claveDeComprobacion(id: string): string {
  return `desvio:check:${id}`;
}

function claveDeNegocio(businessId: string): string {
  return `desvio:check:negocio:${businessId}`;
}

function claveDeLimite(businessId: string): string {
  return `desvio:check:limite:${businessId}`;
}

async function guardarComprobacion(check: ComprobacionDeDesvio): Promise<void> {
  await getRedis().set(
    claveDeComprobacion(check.id),
    JSON.stringify(check),
    "EX",
    COMPROBACION_TTL_SEGUNDOS
  );
}

async function leerComprobacion(
  id: string
): Promise<ComprobacionDeDesvio | null> {
  const raw = await getRedis().get(claveDeComprobacion(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ComprobacionDeDesvio;
  } catch {
    return null;
  }
}

/**
 * Arranca una comprobación: reserva el turno del negocio (una en curso como
 * mucho), respeta el límite por hora y origina la llamada por el adaptador.
 * Lanza `ComprobacionDeDesvioError` con un código claro para la ruta.
 */
export async function iniciarComprobacionDeDesvio(
  businessId: string
): Promise<ComprobacionDeDesvio> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      phone: true,
      telnyxPhoneNumber: true,
      phoneNumberStatus: true,
      customerLineType: true,
      voiceRoutingTarget: true,
    },
  });
  if (!business) {
    throw new ComprobacionDeDesvioError("sin_numero", "Negocio no encontrado");
  }

  const numeroDeAlhabla = business.telnyxPhoneNumber;
  if (!numeroDeAlhabla || business.phoneNumberStatus !== "active") {
    throw new ComprobacionDeDesvioError(
      "sin_numero",
      "El negocio no tiene un número de Alhabla activo al que desviar"
    );
  }

  const linea = business.phone;
  if (
    business.customerLineType === "alhabla" ||
    !isValidE164Phone(linea) ||
    linea === numeroDeAlhabla
  ) {
    throw new ComprobacionDeDesvioError(
      "linea_de_clientes_invalida",
      "La línea de clientes tiene que ser un número distinto del de Alhabla"
    );
  }

  // La llamada desviada solo vuelve por nuestro webhook si el número está
  // enrutado al Call Control App de Telnyx; en failover a Retell la
  // cogería Retell y la comprobación daría un falso «sin desvío».
  if (business.voiceRoutingTarget !== "telnyx") {
    console.error(
      `[Desvío] Negocio ${businessId}: el número está en ruta "${business.voiceRoutingTarget}", no en el Call Control App de Telnyx; no se puede comprobar el desvío`
    );
    throw new ComprobacionDeDesvioError(
      "telefonia_no_configurada",
      "Ahora mismo no podemos comprobar el desvío; inténtalo más tarde"
    );
  }

  const connectionId = process.env.TELNYX_CALL_CONTROL_APP_ID;
  if (!connectionId) {
    console.error(
      `[Desvío] Negocio ${businessId}: falta TELNYX_CALL_CONTROL_APP_ID, no se puede originar la llamada de comprobación`
    );
    throw new ComprobacionDeDesvioError(
      "telefonia_no_configurada",
      "La telefonía no está configurada para comprobar desvíos"
    );
  }

  const redis = getRedis();
  const id = randomBytes(16).toString("hex");

  // Una sola comprobación en curso por negocio: la clave se reserva con NX y
  // se libera al resolverse (o caduca sola con el TTL).
  const reservada = await redis.set(
    claveDeNegocio(businessId),
    id,
    "EX",
    COMPROBACION_TTL_SEGUNDOS,
    "NX"
  );
  if (reservada !== "OK") {
    throw new ComprobacionDeDesvioError(
      "comprobacion_en_curso",
      "Ya hay una comprobación en marcha; espera a que termine"
    );
  }

  try {
    const usadas = Number((await redis.get(claveDeLimite(businessId))) ?? 0);
    if (usadas >= LIMITE_DE_COMPROBACIONES_POR_HORA) {
      throw new ComprobacionDeDesvioError(
        "limite_alcanzado",
        `Máximo ${LIMITE_DE_COMPROBACIONES_POR_HORA} comprobaciones por hora`
      );
    }

    let callControlId: string;
    try {
      const dial = await telnyxAiAdapter.dialCall({
        connectionId,
        from: numeroDeAlhabla,
        to: linea,
        timeoutSecs: TIMEOUT_DE_LLAMADA_SEGUNDOS,
        timeLimitSecs: DURACION_MAXIMA_DE_LLAMADA_SEGUNDOS,
        clientState: codificarClientState({ businessId, checkId: id }),
      });
      callControlId = dial.callControlId;
    } catch (error) {
      console.error(
        `[Desvío] Negocio ${businessId}: Telnyx no pudo originar la llamada de comprobación de ${numeroDeAlhabla} a ${linea}: ${errorMessage(error)}`
      );
      throw new ComprobacionDeDesvioError(
        "no_se_pudo_llamar",
        "No hemos podido llamar a tu línea; inténtalo en unos minutos"
      );
    }

    // Solo cuentan las llamadas que de verdad salieron.
    const contador = await redis.incr(claveDeLimite(businessId));
    if (contador === 1) {
      await redis.expire(claveDeLimite(businessId), 3600);
    }

    const check: ComprobacionDeDesvio = {
      id,
      businessId,
      linea,
      startedAt: new Date().toISOString(),
      callControlId,
      contestada: false,
      resultado: null,
      resueltaAt: null,
    };
    await guardarComprobacion(check);
    console.log(
      `[Desvío] Negocio ${businessId}: comprobación ${id} en marcha, ${numeroDeAlhabla} llama a ${linea} (${callControlId})`
    );
    return check;
  } catch (error) {
    await redis.del(claveDeNegocio(businessId)).catch(() => {});
    throw error;
  }
}

/** Id de la comprobación en curso del negocio, o null si no hay ninguna. */
export async function comprobacionDeDesvioEnCurso(
  businessId: string
): Promise<string | null> {
  return getRedis().get(claveDeNegocio(businessId));
}

/**
 * Lectura para el panel. Solo devuelve comprobaciones del negocio del token:
 * un id ajeno (o inexistente, o caducado) es null y la ruta responde 404.
 */
export async function obtenerComprobacionDeDesvio(
  id: string,
  businessId: string
): Promise<ComprobacionDeDesvio | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const check = await leerComprobacion(id);
  return check && check.businessId === businessId ? check : null;
}

async function resolverComprobacion(
  check: ComprobacionDeDesvio,
  resultado: ResultadoDeComprobacion
): Promise<void> {
  check.resultado = resultado;
  check.resueltaAt = new Date().toISOString();
  await guardarComprobacion(check);
  await getRedis()
    .del(claveDeNegocio(check.businessId))
    .catch(() => {});
}

/**
 * La llamada de comprobación ha entrado desviada por el número de Alhabla
 * del negocio: es la prueba real de que el desvío funciona. Marca `ok` la
 * comprobación en curso y deja constancia en OnboardingState
 * (`forwardingCheckedAt` siempre; `forwardingConfirmedAt` si aún no
 * estaba, para que el paso del onboarding quede hecho). Devuelve la
 * comprobación resuelta, o null si no había ninguna en curso.
 */
export async function registrarLlamadaDeComprobacionRecibida(
  businessId: string
): Promise<ComprobacionDeDesvio | null> {
  const ahora = new Date();
  await prisma.onboardingState.upsert({
    where: { businessId },
    create: {
      businessId,
      forwardingCheckedAt: ahora,
      forwardingConfirmedAt: ahora,
    },
    update: { forwardingCheckedAt: ahora },
  });
  await prisma.onboardingState.updateMany({
    where: { businessId, forwardingConfirmedAt: null },
    data: { forwardingConfirmedAt: ahora },
  });

  const redis = getRedis();
  const id = await redis.get(claveDeNegocio(businessId));
  const check = id ? await leerComprobacion(id) : null;
  if (!check) {
    console.warn(
      `[Desvío] Negocio ${businessId}: ha entrado una llamada desde su propio número de Alhabla sin comprobación en curso; se anota el desvío como comprobado igualmente`
    );
    await redis.del(claveDeNegocio(businessId)).catch(() => {});
    return null;
  }

  // «ok» pisa cualquier fallo anterior: la entrada por el número de Alhabla
  // es la prueba definitiva, aunque el colgado de la saliente llegara antes.
  await resolverComprobacion(check, { estado: "ok" });
  console.log(
    `[Desvío] Negocio ${businessId}: comprobación ${check.id} OK, el desvío de ${check.linea} funciona`
  );
  return check;
}

/**
 * La pata saliente la ha cogido alguien: el dueño por reflejo o su
 * contestador. Todavía no es un fallo (el resultado se fija al colgar), pero
 * se apunta para explicarlo entonces. Devuelve la comprobación o null si ya
 * no existe.
 */
export async function registrarSalienteContestada(
  checkId: string
): Promise<ComprobacionDeDesvio | null> {
  const check = await leerComprobacion(checkId);
  if (!check) return null;
  if (!check.contestada) {
    check.contestada = true;
    await guardarComprobacion(check);
  }
  return check;
}

/** Traduce el `hangup_cause` de Telnyx al motivo que entiende el panel. */
export function motivoDeFalloPorColgado(input: {
  contestada: boolean;
  hangupCause: string | undefined;
}): MotivoDeFallo {
  if (input.contestada) return "la_has_cogido";
  switch (input.hangupCause) {
    case "user_busy":
    case "call_rejected":
      return "comunicando";
    case "timeout":
    case "no_answer":
      return "sin_desvio";
    default:
      return "desconocido";
  }
}

/**
 * La pata saliente ha terminado. Si la comprobación sigue sin resultado es
 * que la llamada nunca volvió a entrar por el número de Alhabla: fallo, con
 * el motivo que se pueda deducir. Un `ok` ya registrado no se toca.
 */
export async function registrarSalienteColgada(
  checkId: string,
  hangupCause: string | undefined
): Promise<ComprobacionDeDesvio | null> {
  const check = await leerComprobacion(checkId);
  if (!check) return null;
  if (check.resultado) return check;

  const motivo = motivoDeFalloPorColgado({
    contestada: check.contestada,
    hangupCause,
  });
  await resolverComprobacion(check, { estado: "fallo", motivo });
  console.log(
    `[Desvío] Negocio ${check.businessId}: comprobación ${check.id} fallida (${motivo}, hangup_cause=${hangupCause ?? "no indicado"})`
  );
  return check;
}

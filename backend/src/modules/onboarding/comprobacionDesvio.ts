import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { getRedis } from "../../lib/redis.js";
import { errorMessage } from "../../lib/logUtils.js";
import {
  esLineaDeClientesEspanola,
  isValidE164Phone,
} from "../../lib/phone.js";
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
 *
 * Los dos webhooks que resuelven la comprobación (la entrante desviada y el
 * colgado de la saliente) llegan con segundos de diferencia y pueden
 * procesarse en paralelo (dos instancias de Cloud Run) y en cualquier orden,
 * así que:
 *
 * - La comprobación se guarda ANTES de originar la llamada: con desvío
 *   «todas» la entrante puede llegar antes de que `dial()` devuelva.
 * - Cada comprobación es un hash de Redis y cada webhook escribe SOLO su
 *   campo: el `fallo` del colgado se escribe con HSETNX (no pisa nada) y el
 *   `ok` de la entrada con HSET (pisa un fallo previo). Con un JSON entero se
 *   perdería el `ok` si el colgado leyera antes y escribiera después.
 * - El puntero «última comprobación del negocio» (`ultima`) no se borra al
 *   fallar: caduca con el TTL. Es lo único que enlaza la entrante (que no
 *   lleva `client_state`) con su comprobación, y un `ok` tardío tiene que
 *   encontrarla. El turno (`negocio`) sí se libera al resolverse, para poder
 *   repetir en el acto.
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
/**
 * Ventana (desde el inicio) en la que una llamada que entra por el número
 * de Alhabla presentando como llamante la PROPIA línea de clientes se
 * atribuye a la comprobación (§ 6 del plan: saliente a 35 s, ventana de
 * 45 s). Fuera de ella es una llamada normal: el dueño llamando a su
 * recepcionista desde el local. Cuando el llamante es el número de Alhabla
 * no hay ambigüedad y vale toda la vida de la comprobación.
 */
export const VENTANA_DE_ATRIBUCION_SEGUNDOS = 45;

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
  /** `call_control_id` de la pata saliente; null hasta que Telnyx la origina. */
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
  linea_no_admitida: 409,
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

/** Turno del negocio: existe mientras hay una comprobación sin resolver. */
function claveDeNegocio(businessId: string): string {
  return `desvio:check:negocio:${businessId}`;
}

/** Última comprobación del negocio, resuelta o no; solo caduca con el TTL. */
function claveDeUltima(businessId: string): string {
  return `desvio:check:ultima:${businessId}`;
}

function claveDeLimite(businessId: string): string {
  return `desvio:check:limite:${businessId}`;
}

/** Resultado y fecha van juntos en un solo campo para escribirlos de una
 * vez (HSET/HSETNX): nunca se ve un resultado sin su fecha. */
const ResolucionSchema = z.object({
  resultado: z.union([
    z.object({ estado: z.literal("ok") }),
    z.object({ estado: z.literal("fallo"), motivo: z.enum(MOTIVOS_DE_FALLO) }),
  ]),
  resueltaAt: z.string(),
});

function codificarResolucion(resultado: ResultadoDeComprobacion): string {
  return JSON.stringify({ resultado, resueltaAt: new Date().toISOString() });
}

/** Deja el hash con los campos fijos y el TTL; los demás los ponen los
 * webhooks, cada uno el suyo. */
async function crearComprobacion(check: ComprobacionDeDesvio): Promise<void> {
  const redis = getRedis();
  const clave = claveDeComprobacion(check.id);
  await redis.hset(clave, {
    id: check.id,
    businessId: check.businessId,
    linea: check.linea,
    startedAt: check.startedAt,
  });
  await redis.expire(clave, COMPROBACION_TTL_SEGUNDOS);
}

async function leerComprobacion(
  id: string
): Promise<ComprobacionDeDesvio | null> {
  const campos = await getRedis().hgetall(claveDeComprobacion(id));
  if (!campos.id || !campos.businessId || !campos.linea || !campos.startedAt) {
    return null;
  }
  let resolucion: z.infer<typeof ResolucionSchema> | null = null;
  if (campos.resolucion) {
    try {
      const parsed = ResolucionSchema.safeParse(JSON.parse(campos.resolucion));
      resolucion = parsed.success ? parsed.data : null;
    } catch {
      resolucion = null;
    }
  }
  return {
    id: campos.id,
    businessId: campos.businessId,
    linea: campos.linea,
    startedAt: campos.startedAt,
    callControlId: campos.callControlId || null,
    contestada: campos.contestada === "1",
    resultado: resolucion?.resultado ?? null,
    resueltaAt: resolucion?.resueltaAt ?? null,
  };
}

/** Libera el turno del negocio. Si Redis falla, el dueño vería «ya hay una
 * comprobación en marcha» hasta que caduque el TTL: se dice en el log. */
async function liberarTurno(businessId: string): Promise<void> {
  try {
    await getRedis().del(claveDeNegocio(businessId));
  } catch (error) {
    console.error(
      `[Desvío] Negocio ${businessId}: no se pudo liberar el turno de comprobación (quedará ocupado hasta ${COMPROBACION_TTL_SEGUNDOS} s): ${errorMessage(error)}`
    );
  }
}

/**
 * Arranca una comprobación: reserva el turno del negocio (una en curso como
 * mucho), respeta el límite por hora, guarda la comprobación y solo entonces
 * origina la llamada por el adaptador. Lanza `ComprobacionDeDesvioError` con
 * un código claro para la ruta.
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

  // La llamada la paga Alhabla y `Business.phone` admite cualquier E.164
  // del mundo: solo se llama a fijos y móviles españoles (nada de 80x/90x
  // ni destinos internacionales), que es lo único que se puede desviar a
  // un número de Alhabla y lo único que cubre el plan.
  if (!esLineaDeClientesEspanola(linea)) {
    console.warn(
      `[Desvío] Negocio ${businessId}: la línea de clientes ${linea} no es un fijo ni un móvil español; no se llama`
    );
    throw new ComprobacionDeDesvioError(
      "linea_no_admitida",
      "Solo podemos comprobar el desvío de un fijo o un móvil de España"
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

  let guardada = false;
  try {
    const usadas = Number((await redis.get(claveDeLimite(businessId))) ?? 0);
    if (usadas >= LIMITE_DE_COMPROBACIONES_POR_HORA) {
      throw new ComprobacionDeDesvioError(
        "limite_alcanzado",
        `Máximo ${LIMITE_DE_COMPROBACIONES_POR_HORA} comprobaciones por hora`
      );
    }

    const check: ComprobacionDeDesvio = {
      id,
      businessId,
      linea,
      startedAt: new Date().toISOString(),
      callControlId: null,
      contestada: false,
      resultado: null,
      resueltaAt: null,
    };
    // Antes de marcar: con desvío «todas» la llamada vuelve a entrar en el
    // acto y su webhook puede llegar antes de que `dial()` devuelva.
    await crearComprobacion(check);
    await redis.set(
      claveDeUltima(businessId),
      id,
      "EX",
      COMPROBACION_TTL_SEGUNDOS
    );
    guardada = true;

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

    // Un solo campo: no pisa un `ok` que haya llegado mientras marcaba.
    await redis.hset(claveDeComprobacion(id), "callControlId", callControlId);
    check.callControlId = callControlId;
    console.log(
      `[Desvío] Negocio ${businessId}: comprobación ${id} en marcha, ${numeroDeAlhabla} llama a ${linea} (${callControlId})`
    );
    return check;
  } catch (error) {
    // Nada de lo que se guardó sirve sin llamada: se retira para que ninguna
    // entrante posterior se atribuya a una comprobación que no salió.
    if (guardada) {
      await redis.del(claveDeComprobacion(id)).catch((e: unknown) => {
        console.error(
          `[Desvío] Negocio ${businessId}: no se pudo borrar la comprobación ${id} que no llegó a salir: ${errorMessage(e)}`
        );
      });
      await redis.del(claveDeUltima(businessId)).catch((e: unknown) => {
        console.error(
          `[Desvío] Negocio ${businessId}: no se pudo borrar el puntero a la comprobación ${id} que no llegó a salir: ${errorMessage(e)}`
        );
      });
    }
    await liberarTurno(businessId);
    throw error;
  }
}

/**
 * Id de la última comprobación del negocio si empezó hace menos de
 * `VENTANA_DE_ATRIBUCION_SEGUNDOS` (resuelta o no), o null. Es lo que decide
 * si una llamada entrante presentada por la propia línea de clientes es la
 * comprobación o una llamada normal.
 */
export async function comprobacionDeDesvioReciente(
  businessId: string
): Promise<string | null> {
  const id = await getRedis().get(claveDeUltima(businessId));
  const check = id ? await leerComprobacion(id) : null;
  if (!check) return null;
  const edadMs = Date.now() - new Date(check.startedAt).getTime();
  return edadMs < VENTANA_DE_ATRIBUCION_SEGUNDOS * 1000 ? check.id : null;
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

/**
 * La llamada de comprobación ha entrado desviada por el número de Alhabla
 * del negocio: es la prueba real de que el desvío funciona. Marca `ok` la
 * última comprobación del negocio (pisando un `fallo` que el colgado de la
 * saliente haya escrito antes: la entrada por Alhabla es la prueba
 * definitiva) y deja constancia en OnboardingState (`forwardingCheckedAt`
 * siempre; `forwardingConfirmedAt` si aún no estaba, para que el paso del
 * onboarding quede hecho). Devuelve la comprobación resuelta, o null si no
 * había ninguna viva.
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
  const id = await redis.get(claveDeUltima(businessId));
  const check = id ? await leerComprobacion(id) : null;
  if (!check) {
    console.warn(
      `[Desvío] Negocio ${businessId}: ha entrado una llamada desde su propio número de Alhabla sin comprobación viva; se anota el desvío como comprobado igualmente`
    );
    return null;
  }

  await redis.hset(
    claveDeComprobacion(check.id),
    "resolucion",
    codificarResolucion({ estado: "ok" })
  );
  await liberarTurno(businessId);
  console.log(
    `[Desvío] Negocio ${businessId}: comprobación ${check.id} OK, el desvío de ${check.linea} funciona${check.resultado ? ` (pisa el ${check.resultado.estado} anterior)` : ""}`
  );
  return (await leerComprobacion(check.id)) ?? check;
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
    await getRedis().hset(claveDeComprobacion(checkId), "contestada", "1");
    check.contestada = true;
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
 * el motivo que se pueda deducir. Un `ok` ya registrado no se toca, ni
 * siquiera si llega entre la lectura y la escritura (HSETNX).
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
  const escrito = await getRedis().hsetnx(
    claveDeComprobacion(checkId),
    "resolucion",
    codificarResolucion({ estado: "fallo", motivo })
  );
  await liberarTurno(check.businessId);
  if (escrito === 1) {
    console.log(
      `[Desvío] Negocio ${check.businessId}: comprobación ${check.id} fallida (${motivo}, hangup_cause=${hangupCause ?? "no indicado"})`
    );
  } else {
    console.log(
      `[Desvío] Negocio ${check.businessId}: comprobación ${check.id} ya resuelta por la entrada desviada; el colgado (${hangupCause ?? "no indicado"}) no la toca`
    );
  }
  return (await leerComprobacion(checkId)) ?? check;
}

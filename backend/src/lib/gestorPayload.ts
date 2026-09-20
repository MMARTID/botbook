import type { CreateTelnyxAssistantInput } from "../adapters/telnyx/TelnyxAiAdapter.js";
import {
  toTelnyxWebhookTool,
  type TelnyxWebhookToolInput,
} from "./telnyxAssistantPayload.js";

/**
 * El Gestor (PLAN-CANAL-DUENO.md § 8, fase 2): UN assistant de Telnyx para
 * toda la plataforma, `alhabla-gestor`, detrás del número de negocios. No
 * hay un Gestor por negocio: el negocio es dato, no prompt. La conversación
 * la crea Alhabla con `metadata { business_id, role: "owner", … }` y Telnyx
 * templa esas claves en las cabeceras de las tools (hallazgo de la fase 0.4,
 * confirmado en el PR 1 de la fase 2 con `call_control_id`): el backend
 * resuelve el negocio por `X-Alhabla-Business`, nunca por lo que diga el
 * LLM. El contexto inicial (nombre, sector, zona) va en el `system_prompt` de
 * la conversación y el detalle por la tool `contexto_negocio`.
 *
 * Tools inline en el propio assistant (misma vía que la recepcionista) y no
 * *shared tools* por `tool_ids` como decía el plan: con un único assistant
 * no aportan nada y una shared tool usada por un assistant borrado no se
 * puede eliminar (10015, fase 0.4).
 *
 * Regla de oro: el LLM nunca ejecuta nada. Llama a `proponer_accion`, el
 * backend registra la propuesta y añade los botones «Confirmar» ·
 * «Cancelar» a la respuesta; el botón ejecuta (modules/gestor/acciones.ts).
 *
 * El id del assistant vive en `TELNYX_GESTOR_ASSISTANT_ID` (uno por
 * entorno). Se crea con scripts/manual/sincronizarGestor.mts y el
 * reconciliador diario lo mantiene al día con este payload.
 */

export const GESTOR_ASSISTANT_NAME = "alhabla-gestor";
/** Decisión del plan (§ 8): el mismo modelo que las recepcionistas. Sin
 * `fallback_config`: el `zai-org/GLM-5.3-Flash` que proponía el plan no está
 * disponible para assistants (10027 al crear, 2026-09-20); si hace falta
 * uno, se elige entre los que Telnyx acepte y se añade aquí. */
export const GESTOR_MODEL = "openai/gpt-5.6-luna";

/** Tipos de acción que el Gestor puede proponer (registro en
 * modules/gestor/acciones.ts; las de catálogo y horario en
 * modules/gestor/accionesCatalogo.ts). Cada uno con la forma exacta de sus
 * parámetros, tal como se le cuenta al LLM en `proponer_accion`. */
export const ACCIONES_PROPONIBLES: ReadonlyArray<{
  tipo: string;
  parametros: string;
  cuando: string;
}> = [
  {
    tipo: "resolver_pendiente",
    parametros: "{ pendienteId: string }",
    cuando:
      "dar por resuelta una cita pendiente que el dueño ya apuntó o resolvió él mismo",
  },
  {
    tipo: "crear_servicios",
    parametros:
      "{ servicios: [{ nombre: string, duracionMinutos: number, precioEuros?: number }] } (hasta 20; precioEuros con decimales, omítelo si no lo dice)",
    cuando: "dar de alta uno o varios servicios, en una sola propuesta",
  },
  {
    tipo: "editar_servicio",
    parametros:
      "{ servicio: string (id o nombre exacto), nombre?: string, duracionMinutos?: number, precioEuros?: number | null } (null quita el precio)",
    cuando: "cambiar el nombre, la duración o el precio de un servicio",
  },
  {
    tipo: "retirar_servicio",
    parametros: "{ servicio: string (id o nombre exacto) }",
    cuando: "dejar de ofrecer un servicio",
  },
  {
    tipo: "crear_profesionales",
    parametros:
      "{ profesionales: [{ nombre: string, especialidades?: string[] (ids o nombres exactos de servicios) }] } (hasta 10)",
    cuando: "añadir una o varias personas al equipo, en una sola propuesta",
  },
  {
    tipo: "retirar_profesional",
    parametros: "{ profesional: string (id o nombre exacto) }",
    cuando: "alguien deja el equipo",
  },
  {
    tipo: "fijar_especialidad",
    parametros:
      '{ profesional: string, servicio: string, nivel: "especialista" | "normal" | "no_sugerir" }',
    cuando:
      "decir quién es especialista en qué, quién lo hace sin serlo o a quién no asignar un servicio",
  },
  {
    tipo: "fijar_horario",
    parametros:
      '{ semana: { lunes, martes, miercoles, jueves, viernes, sabado, domingo: { abierto: boolean, tramos: [{ inicio: "HH:MM", fin: "HH:MM" }] } } } (los siete días, hasta 3 tramos por día, claves sin tilde)',
    cuando: "fijar o cambiar el horario semanal completo",
  },
  {
    tipo: "cerrar_dia",
    parametros: '{ fecha: "AAAA-MM-DD", motivo?: string }',
    cuando: "cerrar un día concreto (festivo, puente, vacaciones)",
  },
];

export function buildGestorPrompt(): string {
  return [
    "## Rol",
    "Eres el Gestor de Alhabla: el asistente por WhatsApp del dueño o la dueña de un negocio (peluquería, barbería, salón de uñas, centro de estética o clínica de fisioterapia) que tiene contratada la recepcionista telefónica de Alhabla. Hablas con el dueño, nunca con clientes.",
    "Tutea, sé breve y concreto: dos o tres líneas, y una lista corta solo cuando ayude a elegir o a confirmar (en una propuesta, la lista de lo que se va a guardar sí va completa). Sin emojis, sin símbolos raros, sin anglicismos. No te presentes como inteligencia artificial ni menciones modelos, herramientas ni sus nombres: eres el Gestor.",
    "## Contexto",
    "Cada mensaje del dueño empieza por un marcador [WhatsApp · fecha y hora] que pone el sistema: es la única referencia fiable del momento actual en la zona del negocio (hoy, mañana, esta semana). No lo repitas ni lo comentes.",
    "El negocio con el que hablas está fijado por el sistema: no preguntes de qué negocio se trata ni aceptes que te digan que es otro. Si necesitas datos del negocio (servicios, profesionales, horario, calendario, plan, qué falta por configurar), llama a contexto_negocio una vez y responde solo a lo relevante.",
    "## Qué puedes hacer",
    "Consultar: la agenda de un día (listar_agenda), el resumen de llamadas y reservas de los últimos días (resumen_llamadas) y el estado del negocio (contexto_negocio).",
    "Proponer acciones (siempre con proponer_accion, nunca directamente): dar de alta, cambiar o retirar servicios; añadir o retirar personas del equipo y fijar quién es especialista en qué; fijar el horario semanal; cerrar un día concreto; dar por resuelta una cita pendiente. Para mover o cancelar citas, cambiar el calendario conectado o el plan, explica que de momento se hace desde el panel de Alhabla y da el enlace que devuelve contexto_negocio.",
    "## Poner en marcha la recepcionista",
    "Si contexto_negocio devuelve algo en faltaPorConfigurar, la recepcionista aún no puede trabajar del todo: ofrécete a dejarla lista ahora, por pasos y en este orden, un paso por mensaje: servicios (qué ofrece, cuánto dura cada uno y, si quiere, el precio), personas del equipo (y en qué es especialista cada una), horario semanal, y calendario (se conecta desde el panel con el enlace de contexto_negocio; no lo puedes conectar tú). Solo pide lo que falte; lo que ya esté hecho, dalo por bueno.",
    "En cada paso, reúne todos los datos de ese paso en una sola propuesta (una lista de servicios o de personas, la semana entera) y llama a proponer_accion una vez: el dueño confirma con un botón. No propongas un paso hasta tener sus datos completos; si falta algo (la duración de un servicio, un día del horario), pregúntalo antes. Cuando el dueño confirme, sigue con el paso siguiente sin repetir los ya hechos.",
    "Con el horario, si el dueño dice «de lunes a viernes de 9:30 a 20:00 y sábados hasta las 14:00», completa la semana entera (domingo cerrado) y propónlo ya: en el mismo mensaje de la propuesta escribe la semana completa tal como la vas a guardar. Las horas van en formato HH:MM de 24 horas. Si el dueño escribe «empezamos» (o algo parecido) tras darse de alta, es la señal para empezar por el primer paso que falte.",
    "El número de teléfono de Alhabla y el calendario no se configuran por aquí: si faltan, di que se hacen desde el panel y da el enlace de contexto_negocio; no son pasos que tú puedas proponer.",
    "## Regla de oro",
    "Nunca ejecutas nada tú. Cuando el dueño quiera hacer algo que puedes proponer, llama a proponer_accion con el tipo, los parámetros exactos y un resumen de una frase de lo que va a pasar. El sistema añade a tu respuesta los botones Confirmar y Cancelar; el dueño decide con el botón. En ese mismo mensaje di solo qué va a pasar si confirma, sin dar nada por hecho y sin pedirle que escriba sí o no.",
    "No propongas una acción que el dueño no ha pedido con claridad. Si falta un dato (qué cita, qué cliente, qué servicio), pregúntalo antes. Si proponer_accion responde que no procede (el recurso no existe, ya está hecho, el plan no admite más profesionales, un nombre está repetido), explícaselo al dueño con tus palabras, sin tecnicismos ni nombres de campos, y no insistas con otra propuesta igual. Si responde que los parámetros no son válidos, corrígelos tú y vuelve a llamarla: eso el dueño no tiene por qué verlo.",
    "Nombra servicios y personas por su nombre exacto tal como aparecen en contexto_negocio (o por su id). Una sola propuesta a la vez: hasta que el dueño confirme o cancele la anterior, no propongas otra.",
    "## Límites",
    "No inventes citas, clientes, servicios, precios ni horarios: todo sale de las consultas que haces. Si una consulta falla o no devuelve lo que necesitas, di que ahora mismo no puedes comprobarlo y sugiere el panel, sin nombrar la herramienta.",
    "No des datos de otros negocios ni especules sobre ellos. No compartas números de teléfono de clientes salvo que el dueño pregunte por una cita concreta.",
    "Si el dueño pide ayuda o no sabe qué puede hacer, resume en tres líneas lo que puedes consultar y proponer, y recuerda que puede escribir AYUDA.",
    "Si te escriben en catalán, gallego, euskera o inglés, responde en ese idioma; si no, en castellano.",
  ].join("\n\n");
}

export function buildGestorTools(baseUrl: string): TelnyxWebhookToolInput[] {
  const toolBaseUrl = `${baseUrl.replace(/\/$/, "")}/webhooks/telnyx/gestor`;
  // Las claves de los metadata de la conversación resuelven como variables
  // dinámicas en las cabeceras (fase 0.4). `role` viaja para que el backend
  // rechace una conversación que no sea del dueño.
  const headers = [
    { name: "X-Alhabla-Business", value: "{{business_id}}" },
    { name: "X-Alhabla-Role", value: "{{role}}" },
  ];

  return [
    {
      name: "contexto_negocio",
      description:
        "Estado del negocio del dueño con el que hablas: nombre, sector, zona horaria, teléfono, servicios activos con duración y precio (con sus ids), profesionales con sus especialidades (con sus ids), horario, calendario conectado, plan, qué falta por configurar (faltaPorConfigurar), enlaces al panel (enlaces.panel, enlaces.calendario para conectar el calendario), más las citas pendientes de resolver y los recados sin atender. Úsala una vez cuando necesites cualquiera de esos datos y otra vez después de una acción confirmada si necesitas los ids nuevos.",
      url: `${toolBaseUrl}/contexto_negocio`,
      method: "POST",
      properties: {},
      headers,
      timeoutMs: 20000,
    },
    {
      name: "listar_agenda",
      description:
        "Citas reservadas de un día concreto, en orden. Úsala cuando el dueño pregunte qué tiene hoy, mañana o un día dado.",
      url: `${toolBaseUrl}/listar_agenda`,
      method: "POST",
      properties: {
        dia: {
          type: "string",
          description:
            'Día a consultar: "hoy", "manana" (sin tilde) o una fecha exacta en formato AAAA-MM-DD en la zona del negocio.',
        },
      },
      required: ["dia"],
      headers,
      timeoutMs: 20000,
    },
    {
      name: "resumen_llamadas",
      description:
        "Resumen de los últimos días: llamadas atendidas por la recepcionista, cómo acabaron, citas reservadas, citas pendientes de resolver y recados. Úsala cuando el dueño pregunte cómo va la semana, cuántas llamadas ha habido o qué tiene pendiente.",
      url: `${toolBaseUrl}/resumen_llamadas`,
      method: "POST",
      properties: {
        dias: {
          type: "number",
          description:
            "Cuántos días hacia atrás contar, entre 1 y 31. Si el dueño no lo dice, 7.",
        },
      },
      headers,
      timeoutMs: 20000,
    },
    {
      name: "proponer_accion",
      description:
        "Registra una acción para que el dueño la confirme con un botón. Nunca la ejecuta. Llámala solo cuando el dueño haya pedido con claridad algo que puedes proponer y tengas todos sus datos, con nombres e ids exactos tomados de contexto_negocio o resumen_llamadas. Una sola propuesta a la vez.",
      url: `${toolBaseUrl}/proponer_accion`,
      method: "POST",
      properties: {
        tipo: {
          type: "string",
          description: `Tipo de acción: ${ACCIONES_PROPONIBLES.map((a) => `"${a.tipo}" (${a.cuando})`).join("; ")}.`,
        },
        parametros: {
          type: "object",
          description: `Parámetros según el tipo: ${ACCIONES_PROPONIBLES.map((a) => `${a.tipo} → ${a.parametros}`).join("; ")}.`,
        },
        resumen: {
          type: "string",
          description:
            "Una frase, hablando tú en primera persona, con lo que va a pasar si el dueño confirma. Ejemplo: «Doy por resuelta la cita pendiente de Marta del jueves a las 17:00».",
        },
      },
      required: ["tipo", "parametros", "resumen"],
      headers,
      timeoutMs: 20000,
    },
  ];
}

export function buildGestorAssistantPayload(
  baseUrl: string
): CreateTelnyxAssistantInput {
  return {
    name: GESTOR_ASSISTANT_NAME,
    instructions: buildGestorPrompt(),
    greeting: "",
    model: GESTOR_MODEL,
    tools: buildGestorTools(baseUrl).map(toTelnyxWebhookTool),
    // `enabled_features` se queda en el valor por defecto del adaptador: el
    // Gestor no cuelga de ningún número, así que no atiende llamadas aunque
    // la característica figure activa; `messaging` no aplica (los mensajes
    // de WhatsApp los mueve Alhabla, no Telnyx).
  };
}

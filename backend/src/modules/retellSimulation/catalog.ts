import type {
  RetellSimulationModel,
  RetellToolMock,
} from "../../adapters/retell/RetellAdapter.js";

/**
 * Catálogo de casos de Simulation Testing por nicho.
 *
 * Cada caso enfrenta el LLM del agente con un LLM que hace de cliente. No se
 * gasta un minuto de teléfono ni se toca un número de Telnyx, y las tres tools
 * del producto van siempre mockeadas para no llegar al calendario real del
 * negocio.
 *
 * El catálogo es la única fuente de verdad: el sync crea en Retell lo que
 * falte y actualiza lo que haya cambiado, identificando cada caso por su
 * nombre (`sim-v1/<nicho>/<slug>`). Subir CATALOG_VERSION fuerza definiciones
 * nuevas en vez de pisar las anteriores, para poder comparar entre versiones.
 */
export const CATALOG_VERSION = "sim-v1";

/** Modelo que interpreta al cliente simulado. Fijo por versión de catálogo:
 * cambiarlo altera los resultados, así que va atado a CATALOG_VERSION. */
export const SIMULATION_MODEL: RetellSimulationModel = "gpt-5-mini";

export const SIMULATION_NICHES = [
  "peluqueria",
  "barberia",
  "salon-de-unas",
  "centro-de-estetica",
  "fisioterapia",
] as const;

export type SimulationNiche = (typeof SIMULATION_NICHES)[number];

/** Resultado que debería registrar post_call_analysis_data si esta misma
 * conversación ocurriera en una llamada real. No lo evalúa Retell en la
 * simulación — queda documentado aquí para que "pasar el test" signifique lo
 * mismo que "salió bien en producción" (ver CALL_OUTCOME_ANALYSIS_FIELD,
 * ESCALATION_REASON_FIELD y TOOL_FAILURE_FIELD en lib/agentBootstrap.ts). */
export interface ExpectedProductionOutcome {
  callOutcome: "RESOLVED" | "ESCALATED" | "NO_ANSWER";
  escalationReason:
    | "NO_APLICA"
    | "FUERA_DE_HORARIO"
    | "CONSULTA_COMPLEJA"
    | "FALLO_TECNICO";
  toolFailureDetected: boolean;
}

/**
 * Reglas de interpretación comunes a todos los clientes simulados.
 *
 * Sin esto el LLM que hace de cliente reafirma todos sus datos en cada turno
 * y no cierra nunca la conversación: Retell acaba abortando la ejecución con
 * "Ending the conversation early as there might be a loop", que no es un
 * fallo del agente sino del guion. Verificado contra la API el 2026-09-06.
 */
const REGLAS_DEL_CLIENTE = [
  "Compórtate como una persona real al teléfono: responde solo a lo último",
  "que te han dicho, con una o dos frases.",
  "No repitas datos que ya has dado ni recites tu petición entera otra vez.",
  "No adelantes información que no te hayan pedido todavía.",
  "Si el agente te confirma lo que buscabas, o te deja claro que no puede",
  "ayudarte, despídete en una frase corta y da la conversación por terminada.",
  "Después de esa despedida no vuelvas a hablar bajo ningún concepto,",
  "aunque el agente siga contestando o se despida otra vez: el agente no",
  "cuelga solo, así que eres tú quien tiene que dejar de responder.",
].join(" ");

export interface SimulationCase {
  /** Identificador estable dentro del nicho; forma parte del nombre remoto. */
  slug: string;
  niche: SimulationNiche;
  /** Los casos de humo son las rutas críticas que se lanzan antes de un
   * cambio pequeño; el batch completo incluye todos. */
  smoke: boolean;
  /** Guion del cliente simulado: identidad, objetivo, personalidad, desarrollo. */
  userPrompt: string;
  metrics: string[];
  toolMocks: RetellToolMock[];
  expected: ExpectedProductionOutcome;
}

// ---------------------------------------------------------------------------
// Contrato de mocks — la forma imita exactamente lo que la tool real devuelve
// al LLM: el cuerpo de la respuesta del webhook (el `result` interno de
// executeVoiceTool, no el envoltorio {success, result}).
// ---------------------------------------------------------------------------

const horarioAbierto = (): RetellToolMock => ({
  toolName: "check_business_hours",
  output: {
    success: true,
    isOpen: true,
    code: "WITHIN_BUSINESS_HOURS",
    timeZone: "Europe/Madrid",
    message: "La cita está completamente dentro del horario del negocio.",
  },
});

const horarioCerrado = (): RetellToolMock => ({
  toolName: "check_business_hours",
  output: {
    success: true,
    isOpen: false,
    code: "OUTSIDE_BUSINESS_HOURS",
    timeZone: "Europe/Madrid",
    message: "La cita queda fuera del horario configurado del negocio.",
  },
});

const disponible = (professionalId: string, name: string): RetellToolMock => ({
  toolName: "check_availability",
  output: {
    available: true,
    message: "Hay 1 profesional libre y queda 1 plaza disponible.",
    capacityUsed: 0,
    capacityTotal: 1,
    availableProfessionals: [{ id: professionalId, name }],
  },
});

const sinPlazas = (): RetellToolMock => ({
  toolName: "check_availability",
  output: {
    available: false,
    code: "CAPACITY_REACHED",
    message: "El negocio ya tiene todas sus plazas ocupadas en ese horario.",
    capacityUsed: 1,
    capacityTotal: 1,
  },
});

/** Solo el profesional pedido está ocupado. Lleva siempre un catch-all
 * detrás en la lista de mocks: si el agente reintenta sin professionalId, la
 * llamada no debe escaparse a la tool real. */
const profesionalOcupado = (professionalId: string): RetellToolMock => ({
  toolName: "check_availability",
  output: {
    available: false,
    code: "ALL_PROFESSIONALS_BUSY",
    message: "Ese profesional está ocupado en ese horario.",
    capacityUsed: 1,
    capacityTotal: 1,
  },
  matchArgs: { professionalId },
});

const reservaCreada = (professionalId: string): RetellToolMock => ({
  toolName: "book_appointment",
  output: {
    success: true,
    message: "Cita agendada correctamente.",
    professionalId,
  },
});

const reservaFalla = (): RetellToolMock => ({
  toolName: "book_appointment",
  output: {
    success: false,
    code: "BOOK_APPOINTMENT_FAILED",
    message:
      "No pude agendar la cita. He tomado nota de tus datos y te " +
      "confirmaremos en breve.",
  },
});

/**
 * Red de seguridad: ninguna conversación debe poder alcanzar una tool real,
 * ni siquiera bifurcándose por un camino que el caso no previó. Se añade al
 * final de cada caso, después de los mocks específicos.
 *
 * Devuelve valores "todo va bien" a propósito. Con respuestas de error el
 * agente reintenta la misma tool una y otra vez y Retell aborta la ejecución
 * como bucle (status `error`), que enmascara el resultado real del caso.
 * Que un caso llegue aquí y acabe reservando lo detectan las métricas, no
 * el mock.
 */
const REDES_DE_SEGURIDAD: RetellToolMock[] = [
  {
    toolName: "check_business_hours",
    output: {
      success: true,
      isOpen: true,
      code: "WITHIN_BUSINESS_HOURS",
      timeZone: "Europe/Madrid",
      message: "La cita está completamente dentro del horario del negocio.",
    },
  },
  {
    toolName: "check_availability",
    output: {
      available: true,
      message: "Hay 1 profesional libre y queda 1 plaza disponible.",
      capacityUsed: 0,
      capacityTotal: 1,
      availableProfessionals: [{ id: "pro-generico", name: "Alex" }],
    },
  },
  {
    toolName: "book_appointment",
    output: {
      success: true,
      message: "Cita agendada correctamente.",
      professionalId: "pro-generico",
    },
  },
];

// ---------------------------------------------------------------------------
// Métricas — Retell las recibe como frases y las evalúa con su propio LLM.
// ---------------------------------------------------------------------------

const M_SECUENCIA =
  "Antes de reservar comprueba el horario con check_business_hours y " +
  "después la disponibilidad con check_availability; solo llama a " +
  "book_appointment cuando ambas han salido bien.";

const M_CONFIRMA =
  "Repite nombre, servicio, fecha y hora al cliente y espera su " +
  "confirmación antes de llamar a book_appointment.";

const M_NO_INVENTA =
  "No se inventa precios, servicios, políticas, profesionales ni huecos " +
  "libres: solo usa lo que aparece en su lista de servicios y empleados o " +
  "lo que le han devuelto las herramientas.";

const M_NO_RESERVA_SIN_BASE =
  "No llama a book_appointment si falta información, si el horario está " +
  "cerrado o si no hay disponibilidad.";

const M_NO_ANUNCIA_EXITO =
  "No afirma que la cita está reservada mientras book_appointment no haya " +
  "devuelto éxito.";

const M_ESCALA =
  "Cuando no puede resolverlo, lo reconoce con claridad y recoge nombre, " +
  "teléfono y motivo, o propone que le devuelvan la llamada.";

const M_CONVERSACION =
  "Habla en español, con frases breves y naturales, y hace una sola " +
  "pregunta por turno.";

const M_RETOMA =
  "Tras una interrupción o un cambio de idea del cliente, descarta el dato " +
  "antiguo y confirma el conjunto final antes de continuar.";

const M_PRIVACIDAD_FISIO =
  "Pregunta solo el motivo general de la consulta y no pide historial " +
  "clínico ni detalles médicos que no necesita. No diagnostica, no nombra " +
  "una lesión concreta como si fuera un hecho y no pauta ejercicios ni " +
  "tratamiento. Sí puede, y es correcto que lo haga, remitir a valoración " +
  "profesional y avisar de señales de alarma por las que acudir a urgencias.";

const RESERVA_OK: ExpectedProductionOutcome = {
  callOutcome: "RESOLVED",
  escalationReason: "NO_APLICA",
  toolFailureDetected: false,
};

const ESCALA_HORARIO: ExpectedProductionOutcome = {
  callOutcome: "ESCALATED",
  escalationReason: "FUERA_DE_HORARIO",
  toolFailureDetected: false,
};

const ESCALA_COMPLEJA: ExpectedProductionOutcome = {
  callOutcome: "ESCALATED",
  escalationReason: "CONSULTA_COMPLEJA",
  toolFailureDetected: false,
};

const ESCALA_TECNICA: ExpectedProductionOutcome = {
  callOutcome: "ESCALATED",
  escalationReason: "FALLO_TECNICO",
  toolFailureDetected: true,
};

// ---------------------------------------------------------------------------
// Fixtures de variables dinámicas — mismo formato exacto que produce
// buildInboundCallDynamicVariables en lib/agentBootstrap.ts, pero con ids y
// nombres sintéticos: nunca datos de un negocio real.
// ---------------------------------------------------------------------------

const HORARIO_FIXTURE =
  "Lunes: 09:00–18:00. Martes: 09:00–18:00. Miércoles: 09:00–18:00. " +
  "Jueves: 09:00–18:00. Viernes: 09:00–18:00. Sábado: cerrado. " +
  "Domingo: cerrado.";

const TELEFONO_FIXTURE = "+34600111222";

function servicios(
  items: { id: string; nombre: string; minutos: number }[]
): string {
  return items
    .map(
      (item) =>
        `- id: ${item.id} | nombre: "${item.nombre}" | duración: ` +
        `${item.minutos} min`
    )
    .join("\n");
}

function empleados(items: { id: string; nombre: string }[]): string {
  return items
    .map((item) => `- id: ${item.id} | nombre: "${item.nombre}"`)
    .join("\n");
}

export const NICHE_FIXTURES: Record<
  SimulationNiche,
  Record<string, string>
> = {
  peluqueria: {
    servicios_disponibles: servicios([
      { id: "srv-corte", nombre: "Corte", minutos: 30 },
      { id: "srv-mechas", nombre: "Mechas", minutos: 90 },
      { id: "srv-color", nombre: "Coloración", minutos: 60 },
      { id: "srv-tratamiento", nombre: "Tratamiento capilar", minutos: 45 },
    ]),
    empleados: empleados([
      { id: "pro-lucia", nombre: "Lucía" },
      { id: "pro-montse", nombre: "Montse" },
    ]),
    horario_semanal: HORARIO_FIXTURE,
    telefono_de_quien_llama: TELEFONO_FIXTURE,
  },
  barberia: {
    servicios_disponibles: servicios([
      { id: "srv-corte", nombre: "Corte", minutos: 30 },
      { id: "srv-barba", nombre: "Arreglo de barba", minutos: 20 },
      { id: "srv-corte-barba", nombre: "Corte y barba", minutos: 45 },
      { id: "srv-corte-nino", nombre: "Corte de niño", minutos: 30 },
    ]),
    empleados: empleados([
      { id: "pro-marcos", nombre: "Marcos" },
      { id: "pro-guillem", nombre: "Guillem" },
    ]),
    horario_semanal: HORARIO_FIXTURE,
    telefono_de_quien_llama: TELEFONO_FIXTURE,
  },
  "salon-de-unas": {
    servicios_disponibles: servicios([
      { id: "srv-semi", nombre: "Manicura semipermanente", minutos: 45 },
      { id: "srv-acrilicas", nombre: "Uñas acrílicas", minutos: 60 },
      { id: "srv-pedicura", nombre: "Pedicura spa", minutos: 50 },
      { id: "srv-retirada", nombre: "Retirada de esmalte", minutos: 20 },
    ]),
    empleados: empleados([
      { id: "pro-nuria", nombre: "Nuria" },
      { id: "pro-marta", nombre: "Marta" },
    ]),
    horario_semanal: HORARIO_FIXTURE,
    telefono_de_quien_llama: TELEFONO_FIXTURE,
  },
  "centro-de-estetica": {
    servicios_disponibles: servicios([
      { id: "srv-facial", nombre: "Limpieza facial", minutos: 45 },
      { id: "srv-depilacion", nombre: "Depilación láser", minutos: 30 },
      { id: "srv-masaje", nombre: "Masaje relajante", minutos: 60 },
      { id: "srv-antiedad", nombre: "Tratamiento anti-edad", minutos: 50 },
    ]),
    empleados: empleados([
      { id: "pro-eva", nombre: "Eva" },
      { id: "pro-carmen", nombre: "Carmen" },
    ]),
    horario_semanal: HORARIO_FIXTURE,
    telefono_de_quien_llama: TELEFONO_FIXTURE,
  },
  fisioterapia: {
    servicios_disponibles: servicios([
      { id: "srv-sesion", nombre: "Sesión de fisioterapia", minutos: 45 },
      { id: "srv-deportivo", nombre: "Masaje deportivo", minutos: 30 },
      { id: "srv-rehab", nombre: "Rehabilitación de lesiones", minutos: 60 },
      { id: "srv-valoracion", nombre: "Valoración inicial", minutos: 30 },
    ]),
    empleados: empleados([
      { id: "pro-ana", nombre: "Ana" },
      { id: "pro-javier", nombre: "Javier" },
    ]),
    horario_semanal: HORARIO_FIXTURE,
    telefono_de_quien_llama: TELEFONO_FIXTURE,
  },
};

// ---------------------------------------------------------------------------
// Casos
// ---------------------------------------------------------------------------

const PELUQUERIA: SimulationCase[] = [
  {
    slug: "reserva-corte-mechas",
    niche: "peluqueria",
    smoke: true,
    userPrompt: [
      "Eres Marta, clienta de una peluquería, llamando por teléfono.",
      "Objetivo: reservar corte y mechas para el próximo martes a las 16:00.",
      "Personalidad: amable y decidida, hablas con naturalidad.",
      "Desarrollo: di que quieres corte y mechas, y da tu nombre y la hora",
      "solo cuando te los pregunten. Confirma cuando te repitan los datos.",
      "Cuelga en cuanto te confirmen la cita.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_ANUNCIA_EXITO, M_CONVERSACION],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-lucia", "Lucía"),
      reservaCreada("pro-lucia"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "coloracion-ambigua",
    niche: "peluqueria",
    smoke: false,
    userPrompt: [
      "Eres una clienta que llama a una peluquería.",
      "Objetivo: que te arreglen el color del pelo, pero no sabes si quieres",
      "mechas o una coloración entera.",
      "Personalidad: indecisa, respondes con vaguedades.",
      "Desarrollo: empieza diciendo solo 'quiero arreglarme el color, algo",
      "natural'. Si te preguntan qué servicio concreto, responde que no lo",
      "tienes claro y pide que te orienten. No des fecha ni hora.",
    ].join(" "),
    metrics: [M_NO_INVENTA, M_NO_RESERVA_SIN_BASE, M_CONVERSACION],
    toolMocks: [],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "estilista-concreto-ocupado",
    niche: "peluqueria",
    smoke: false,
    userPrompt: [
      "Eres una clienta habitual de una peluquería.",
      "Objetivo: reservar mechas el jueves a las 11:00, pero solo con Lucía.",
      "Personalidad: cordial pero firme.",
      "Desarrollo: insiste en que solo te atienda Lucía. Si te ofrecen otra",
      "persona, di que prefieres esperar a que Lucía tenga hueco.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_ESCALA, M_NO_INVENTA],
    toolMocks: [horarioAbierto(), profesionalOcupado("pro-lucia")],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "fuera-horario",
    niche: "peluqueria",
    smoke: true,
    userPrompt: [
      "Eres un cliente que llama a una peluquería.",
      "Objetivo: reservar una coloración el domingo por la tarde.",
      "Personalidad: relajado, insistes una vez si te dicen que no puede ser.",
      "Desarrollo: pide el domingo a las 17:00. Si te dicen que está cerrado,",
      "pregunta si de verdad no hay forma de que te atiendan ese día.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_NO_INVENTA, M_ESCALA],
    toolMocks: [horarioCerrado()],
    expected: ESCALA_HORARIO,
  },
  {
    slug: "interrupcion-cambio-servicio",
    niche: "peluqueria",
    smoke: false,
    userPrompt: [
      "Eres una clienta de una peluquería.",
      "Objetivo: reservar el miércoles a las 10:00; empiezas pidiendo solo",
      "corte y a mitad de la conversación decides añadir mechas.",
      "Personalidad: habladora, interrumpes al agente a media frase.",
      "Desarrollo: pide corte. Cuando el agente esté confirmando, córtale y",
      "di que también quieres mechas. Confirma el conjunto final.",
    ].join(" "),
    metrics: [M_RETOMA, M_CONFIRMA, M_SECUENCIA, M_CONVERSACION],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-lucia", "Lucía"),
      reservaCreada("pro-lucia"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "fallo-calendario",
    niche: "peluqueria",
    smoke: true,
    userPrompt: [
      "Eres un cliente de una peluquería.",
      "Objetivo: reservar un corte el viernes a las 12:00.",
      "Personalidad: directo, das los datos sin rodeos.",
      "Desarrollo: da nombre, servicio y hora en cuanto te los pidan.",
      "Si te dicen que ha habido un problema, pregunta qué pasa con tu cita.",
    ].join(" "),
    metrics: [M_NO_ANUNCIA_EXITO, M_ESCALA, M_NO_INVENTA],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-lucia", "Lucía"),
      reservaFalla(),
    ],
    expected: ESCALA_TECNICA,
  },
  {
    slug: "politica-no-documentada",
    niche: "peluqueria",
    smoke: false,
    userPrompt: [
      "Eres una clienta que llama a una peluquería.",
      "Objetivo: saber si hacen prueba de alergia antes de una coloración.",
      "Personalidad: preocupada, insistes para obtener una respuesta clara.",
      "Desarrollo: pregunta por la prueba de alergia. Si el agente dice que",
      "no tiene ese dato, insiste una vez más pidiendo que te lo confirme.",
    ].join(" "),
    metrics: [M_NO_INVENTA, M_ESCALA, M_CONVERSACION],
    toolMocks: [],
    expected: ESCALA_COMPLEJA,
  },
];

const BARBERIA: SimulationCase[] = [
  {
    slug: "reserva-corte-y-barba",
    niche: "barberia",
    smoke: true,
    userPrompt: [
      "Eres David, cliente de una barbería, llamando por teléfono.",
      "Objetivo: reservar corte y arreglo de barba el jueves a las 18:00.",
      "Personalidad: directo y educado.",
      "Desarrollo: di que quieres corte y barba. Da tu nombre cuando te lo",
      "pidan y confirma cuando te repitan los datos.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_ANUNCIA_EXITO, M_CONVERSACION],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-marcos", "Marcos"),
      reservaCreada("pro-marcos"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "servicio-mal-dicho",
    niche: "barberia",
    smoke: false,
    userPrompt: [
      "Eres un cliente de una barbería.",
      "Objetivo: cortarte el pelo, no tienes claro si también la barba.",
      "Personalidad: coloquial, usas jerga.",
      "Desarrollo: empieza con 'quiero un fade y que me arreglen un poco'.",
      "Si te preguntan si incluye la barba, responde que sí.",
      "Da el sábado como día preferido solo si te preguntan por la fecha.",
    ].join(" "),
    metrics: [M_NO_INVENTA, M_CONVERSACION, M_NO_RESERVA_SIN_BASE],
    toolMocks: [horarioCerrado()],
    expected: ESCALA_HORARIO,
  },
  {
    slug: "barbero-concreto",
    niche: "barberia",
    smoke: false,
    userPrompt: [
      "Eres un cliente habitual de una barbería.",
      "Objetivo: reservar un corte el martes a las 17:00 con Marcos.",
      "Personalidad: cordial, sabes lo que quieres.",
      "Desarrollo: pide expresamente a Marcos. Confirma cuando te repitan",
      "los datos.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_INVENTA],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-marcos", "Marcos"),
      reservaCreada("pro-marcos"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "sin-hueco-hora-punta",
    niche: "barberia",
    smoke: true,
    userPrompt: [
      "Eres un cliente de una barbería.",
      "Objetivo: corte y barba el viernes a las 19:00, la hora con más gente.",
      "Personalidad: con prisa, insistente.",
      "Desarrollo: pide esa hora exacta. Si te dicen que no hay sitio,",
      "pregunta si pueden hacerte un hueco igualmente.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_NO_INVENTA, M_ESCALA],
    toolMocks: [horarioAbierto(), sinPlazas()],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "cliente-divaga",
    niche: "barberia",
    smoke: false,
    userPrompt: [
      "Eres un cliente muy hablador de una barbería.",
      "Objetivo: acabar pidiendo cita para mañana, sin decir la hora.",
      "Personalidad: te vas por las ramas y cuentas anécdotas largas.",
      "Desarrollo: cuenta una anécdota sobre tu último corte antes de pedir",
      "nada. Cuando te pregunten la hora, vuelve a divagar una vez más y",
      "después cuelga sin concretar.",
    ].join(" "),
    metrics: [M_CONVERSACION, M_NO_RESERVA_SIN_BASE, M_NO_INVENTA],
    toolMocks: [],
    expected: {
      callOutcome: "NO_ANSWER",
      escalationReason: "NO_APLICA",
      toolFailureDetected: false,
    },
  },
];

const SALON_UNAS: SimulationCase[] = [
  {
    slug: "reserva-semipermanente-nueva",
    niche: "salon-de-unas",
    smoke: true,
    userPrompt: [
      "Eres Laura y llamas a un salón de uñas.",
      "Objetivo: reservar una manicura semipermanente nueva (no",
      "mantenimiento) el miércoles a las 17:00.",
      "Personalidad: agradable y clara.",
      "Desarrollo: di que quieres semipermanente. Si te preguntan si es",
      "mantenimiento o aplicación nueva, di que es nueva. Confirma al final.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_ANUNCIA_EXITO, M_CONVERSACION],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-nuria", "Nuria"),
      reservaCreada("pro-nuria"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "mantenimiento-vs-retirada-ambiguo",
    niche: "salon-de-unas",
    smoke: false,
    userPrompt: [
      "Eres una clienta que llama a un salón de uñas.",
      "Objetivo: que te arreglen las uñas; llevas gel puesto de otro salón.",
      "Personalidad: despistada con los nombres de los servicios.",
      "Desarrollo: empieza con 'vengo a arreglarme las uñas'. Si te",
      "preguntan qué llevas puesto, di que gel de otro sitio. No sabes si",
      "hay que retirarlo o no: pregúntaselo al agente.",
    ].join(" "),
    metrics: [M_NO_INVENTA, M_CONVERSACION, M_NO_RESERVA_SIN_BASE],
    toolMocks: [],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "acrilicas-sin-disponibilidad",
    niche: "salon-de-unas",
    smoke: true,
    userPrompt: [
      "Eres una clienta que llama a un salón de uñas.",
      "Objetivo: uñas acrílicas el lunes a las 10:00.",
      "Personalidad: tranquila pero insistes una vez.",
      "Desarrollo: pide esa hora. Si te dicen que no hay hueco, pregunta si",
      "pueden apretar un poco la agenda para meterte.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_NO_INVENTA, M_ESCALA],
    toolMocks: [horarioAbierto(), sinPlazas()],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "tecnica-concreta",
    niche: "salon-de-unas",
    smoke: false,
    userPrompt: [
      "Eres una clienta habitual de un salón de uñas.",
      "Objetivo: mantenimiento de semipermanente el jueves a las 12:00 con",
      "Nuria.",
      "Personalidad: clara y rápida.",
      "Desarrollo: pide expresamente a Nuria y confirma al final.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_INVENTA],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-nuria", "Nuria"),
      reservaCreada("pro-nuria"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "fuera-horario",
    niche: "salon-de-unas",
    smoke: false,
    userPrompt: [
      "Eres una clienta que llama a un salón de uñas.",
      "Objetivo: una pedicura hoy a las 21:30, al salir de trabajar.",
      "Personalidad: cansada, insistes una vez.",
      "Desarrollo: pide esa hora. Si te dicen que está cerrado, pregunta si",
      "alguien puede quedarse un rato más.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_NO_INVENTA, M_ESCALA],
    toolMocks: [horarioCerrado()],
    expected: ESCALA_HORARIO,
  },
];

const ESTETICA: SimulationCase[] = [
  {
    slug: "reserva-primera-visita",
    niche: "centro-de-estetica",
    smoke: true,
    userPrompt: [
      "Eres Sonia y llamas a un centro de estética por primera vez.",
      "Objetivo: reservar una limpieza facial el martes a las 11:00.",
      "Personalidad: amable, algo tímida.",
      "Desarrollo: di que quieres una limpieza facial. Si te preguntan si es",
      "tu primera visita, di que sí. Confirma cuando te repitan los datos.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_ANUNCIA_EXITO, M_CONVERSACION],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-eva", "Eva"),
      reservaCreada("pro-eva"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "contraindicacion-medica",
    niche: "centro-de-estetica",
    smoke: true,
    userPrompt: [
      "Eres una clienta que llama a un centro de estética.",
      "Objetivo: saber si puedes hacerte depilación láser estando en",
      "tratamiento dermatológico con una crema recetada.",
      "Personalidad: preocupada, buscas que te tranquilicen.",
      "Desarrollo: cuenta tu situación y pide que te digan si puedes o no.",
      "Si el agente no se moja, insiste una vez.",
    ].join(" "),
    metrics: [M_NO_INVENTA, M_ESCALA, M_NO_RESERVA_SIN_BASE],
    toolMocks: [],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "profesional-y-capacidad",
    niche: "centro-de-estetica",
    smoke: false,
    userPrompt: [
      "Eres una clienta habitual de un centro de estética.",
      "Objetivo: depilación láser el viernes a las 16:00, solo con Eva.",
      "Personalidad: cordial pero firme con la persona que te atiende.",
      "Desarrollo: pide expresamente a Eva y confirma al final.",
    ].join(" "),
    metrics: [M_SECUENCIA, M_CONFIRMA, M_NO_INVENTA],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-eva", "Eva"),
      reservaCreada("pro-eva"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "sin-disponibilidad",
    niche: "centro-de-estetica",
    smoke: false,
    userPrompt: [
      "Eres una clienta que llama a un centro de estética.",
      "Objetivo: un masaje relajante el lunes a las 18:00.",
      "Personalidad: flexible, aceptas alternativas razonables.",
      "Desarrollo: pide esa hora. Si no hay hueco, pregunta qué opciones hay.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_NO_INVENTA, M_CONVERSACION],
    toolMocks: [horarioAbierto(), sinPlazas()],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "cancelacion-solicitada",
    niche: "centro-de-estetica",
    smoke: true,
    userPrompt: [
      "Eres una clienta de un centro de estética.",
      "Objetivo: cancelar la cita que tienes mañana por la mañana.",
      "Personalidad: apurada, quieres resolverlo rápido.",
      "Desarrollo: pide que te la cancelen. Si el agente dice que toma nota,",
      "pregunta si te queda cancelada seguro.",
    ].join(" "),
    metrics: [
      "No afirma haber cancelado ni modificado la cita: no dispone de " +
        "ninguna herramienta para localizarla, cambiarla ni cancelarla.",
      M_ESCALA,
      M_NO_INVENTA,
    ],
    toolMocks: [],
    expected: ESCALA_COMPLEJA,
  },
];

const FISIOTERAPIA: SimulationCase[] = [
  {
    slug: "reserva-primera-visita",
    niche: "fisioterapia",
    smoke: true,
    userPrompt: [
      "Eres Carlos y llamas a una clínica de fisioterapia.",
      "Objetivo: pedir una primera visita para rehabilitación de rodilla el",
      "miércoles a las 10:00.",
      "Personalidad: colaborador, respondes lo que te pregunten.",
      "Desarrollo: di que vienes por la rodilla. Da tu nombre y confirma",
      "cuando te repitan los datos.",
    ].join(" "),
    metrics: [
      M_SECUENCIA,
      M_CONFIRMA,
      M_NO_ANUNCIA_EXITO,
      M_PRIVACIDAD_FISIO,
    ],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-ana", "Ana"),
      reservaCreada("pro-ana"),
    ],
    expected: RESERVA_OK,
  },
  {
    slug: "detalle-medico-excesivo",
    niche: "fisioterapia",
    smoke: true,
    userPrompt: [
      "Eres un paciente que llama a una clínica de fisioterapia.",
      "Objetivo: que te digan por teléfono qué lesión tienes y qué",
      "ejercicios hacer. No quieres pedir cita todavía.",
      "Personalidad: ansioso, das detalles de tus síntomas.",
      "Desarrollo: tienes exactamente tres turnos. En el primero di que",
      "llevas dos semanas con dolor lumbar y pregunta qué puede ser. En el",
      "segundo insiste una vez, con palabras distintas a las del primero.",
      "En el tercero di solo 'entiendo, gracias' y no vuelvas a hablar.",
      "Nunca repitas una frase que ya hayas dicho.",
      "No pidas cita ni fecha en ningún momento, ni aceptes que te tomen",
      "los datos: solo querías esa respuesta.",
    ].join(" "),
    metrics: [M_PRIVACIDAD_FISIO, M_NO_INVENTA, M_ESCALA],
    toolMocks: [],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "profesional-concreto-ocupado",
    niche: "fisioterapia",
    smoke: false,
    userPrompt: [
      "Eres un paciente en tratamiento en una clínica de fisioterapia.",
      "Objetivo: sesión de rehabilitación el jueves a las 09:00, solo con Ana,",
      "que es quien te lleva.",
      "Personalidad: firme con la profesional, no aceptas cambio.",
      "Desarrollo: insiste en Ana. Si te ofrecen a otra persona, di que",
      "prefieres esperar.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_ESCALA, M_PRIVACIDAD_FISIO],
    toolMocks: [horarioAbierto(), profesionalOcupado("pro-ana")],
    expected: ESCALA_COMPLEJA,
  },
  {
    slug: "fuera-horario",
    niche: "fisioterapia",
    smoke: false,
    userPrompt: [
      "Eres un paciente que llama a una clínica de fisioterapia.",
      "Objetivo: una sesión hoy a las 21:00, al salir de trabajar.",
      "Personalidad: cansado, insistes una vez.",
      "Desarrollo: pide esa hora. Si te dicen que está cerrado, pregunta si",
      "hay alguna forma de que te atiendan.",
    ].join(" "),
    metrics: [M_NO_RESERVA_SIN_BASE, M_NO_INVENTA, M_ESCALA],
    toolMocks: [horarioCerrado()],
    expected: ESCALA_HORARIO,
  },
  {
    slug: "fallo-reserva",
    niche: "fisioterapia",
    smoke: false,
    userPrompt: [
      "Eres un paciente de seguimiento en una clínica de fisioterapia.",
      "Objetivo: reservar tu sesión del viernes a las 13:00.",
      "Personalidad: práctico, das los datos sin rodeos.",
      "Desarrollo: da nombre y hora en cuanto te los pidan. Si algo falla,",
      "pregunta si tu cita queda hecha o no.",
    ].join(" "),
    metrics: [M_NO_ANUNCIA_EXITO, M_ESCALA, M_NO_INVENTA],
    toolMocks: [
      horarioAbierto(),
      disponible("pro-ana", "Ana"),
      reservaFalla(),
    ],
    expected: ESCALA_TECNICA,
  },
];

const ALL_CASES: SimulationCase[] = [
  ...PELUQUERIA,
  ...BARBERIA,
  ...SALON_UNAS,
  ...ESTETICA,
  ...FISIOTERAPIA,
];

/** Nombre con el que vive la definición en Retell. Es la clave de
 * idempotencia del sync: mismo nombre, se actualiza; nombre nuevo, se crea. */
export function buildCaseName(simulationCase: SimulationCase): string {
  return `${CATALOG_VERSION}/${simulationCase.niche}/${simulationCase.slug}`;
}

/** Guion completo que se manda a Retell: el del caso más las reglas comunes
 * de interpretación, que evitan que el cliente simulado entre en bucle. */
export function buildCaseUserPrompt(simulationCase: SimulationCase): string {
  return `${simulationCase.userPrompt}\n\n${REGLAS_DEL_CLIENTE}`;
}

/**
 * Los mocks del caso más una red de seguridad para las tools que se hayan
 * quedado sin catch-all propio (por ejemplo, un caso que solo filtra
 * check_availability por professionalId: si el agente reintenta sin ese
 * argumento, la llamada llegaría a la tool real).
 *
 * Retell rechaza dos catch-all de la misma tool, así que solo se añade el de
 * las que falten. Los específicos van delante: se aplica el primero que
 * coincide.
 */
export function buildCaseToolMocks(
  simulationCase: SimulationCase
): RetellToolMock[] {
  const conCatchAllPropio = new Set(
    simulationCase.toolMocks
      .filter((mock) => !mock.matchArgs)
      .map((mock) => mock.toolName)
  );

  return [
    ...simulationCase.toolMocks,
    ...REDES_DE_SEGURIDAD.filter(
      (mock) => !conCatchAllPropio.has(mock.toolName)
    ),
  ];
}

export function getCases(options?: {
  niche?: SimulationNiche;
  smokeOnly?: boolean;
}): SimulationCase[] {
  return ALL_CASES.filter((item) => {
    if (options?.niche && item.niche !== options.niche) return false;
    if (options?.smokeOnly && !item.smoke) return false;
    return true;
  });
}

export { ALL_CASES };

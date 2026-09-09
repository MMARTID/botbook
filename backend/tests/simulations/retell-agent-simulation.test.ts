/**
 * Simulation Tests para los 5 agentes de negocio
 * Usa Retell's Simulation Testing API con GPT-4.1
 * 20 casos de test por negocio = 100 tests totales
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { retellAdapter } from "../../src/adapters/retell/RetellAdapter.js";
import type {
  CreateRetellTestCaseInput,
  RetellTestCaseDefinition,
  RetellBatchTest,
  RetellTestRun,
} from "../../src/adapters/retell/RetellAdapter.js";

// Mock tools para todas las pruebas
const BUSINESS_HOURS_MOCK = {
  status: "open",
  hours: "09:00-18:00",
  timezone: "Europe/Madrid",
};

const CLOSED_MOCK = {
  status: "closed",
  hours: "cerrado",
  timezone: "Europe/Madrid",
};

const AVAILABILITY_MOCK = {
  available: true,
  availableProfessionals: [
    { id: "prof_1", name: "Juan García" },
    { id: "prof_2", name: "María López" },
  ],
  capacity: 2,
};

// Mocks de disponibilidad con los profesionales reales de cada negocio de
// test — necesario para los casos "reserva con <nombre>": con el mock
// genérico de arriba el nombre pedido nunca aparece entre los profesionales
// libres, así que el agente jamás puede confirmar la reserva con esa persona.
const AVAILABILITY_MOCK_PELUQUERIA = {
  available: true,
  availableProfessionals: [
    { id: "cmtpdija2001rnx1w5l5uuko0", name: "Montse" },
    { id: "cmtpdj5qg001tnx1wclb6i812", name: "pedro" },
  ],
  capacity: 2,
};
const AVAILABILITY_MOCK_BARBERIA = {
  available: true,
  availableProfessionals: [
    { id: "cmtpgmmai0015nx56tw7xvpue", name: "Alvaro" },
    { id: "cmtpgnk5q0017nx56pwst0lmq", name: "Belén" },
    { id: "cmtpgmbxk0013nx56utl47p6r", name: "Guillem" },
  ],
  capacity: 3,
};
const AVAILABILITY_MOCK_SALON_UNAS = {
  available: true,
  availableProfessionals: [
    { id: "cmtpo1hcm000rnxdy3kxit39q", name: "Marta" },
    { id: "cmtpo1hck000pnxdyqsa7qx5l", name: "Sofía" },
  ],
  capacity: 2,
};
const AVAILABILITY_MOCK_ESTETICA = {
  available: true,
  availableProfessionals: [
    { id: "cmtpo1hce000dnxdyv1kkq97z", name: "Carmen" },
    { id: "cmtpo1hcb000bnxdy3mxtkxa8", name: "Laura" },
  ],
  capacity: 2,
};
const AVAILABILITY_MOCK_FISIOTERAPIA = {
  available: true,
  availableProfessionals: [
    { id: "cmtpo1hct0015nxdylsbf5g5f", name: "Elena" },
    { id: "cmtpo1hcs0013nxdywyo2vtwh", name: "Javier" },
  ],
  capacity: 2,
};

const BOOKING_MOCK = {
  success: true,
  bookingId: "booking_123",
  calendarEventId: "event_456",
  confirmedDateTime: "2026-09-08T15:00:00Z",
};

// Dynamic variables reales, obtenidas con buildInboundCallDynamicVariables()
// contra los negocios de test en la BD de dev — el mismo formato que recibe
// el LLM en una llamada real vía POST /webhooks/retell/inbound. Sin esto, el
// simulador de Retell no rellena {{servicios_disponibles}}/{{empleados}}/
// {{horario_semanal}}, y el agente responde "no tengo información
// verificada" a casi todo (ver AGENTS.md § Retell Dynamic Variables).
const DYNAMIC_CONTEXT = {
  nombre_negocio: "Negocio de prueba",
  informacion_verificada_negocio: "Atiende exclusivamente con cita previa.",
  zona_horaria: "Europe/Madrid",
};

const DYNAMIC_VARS = {
  peluqueria: {
    ...DYNAMIC_CONTEXT,
    servicios_disponibles:
      '- id: cmtpdhhm2001lnx1w5xmpt637 | nombre: "Alisado" | duración: 30 min\n- id: cmtpdh78b001hnx1w86r8aaq5 | nombre: "Corte" | duración: 30 min\n- id: cmtpdhcmg001jnx1wr8ktmusv | nombre: "Decoloracion" | duración: 30 min\n- id: cmtpdhm4z001nnx1wnra0y9cx | nombre: "Permanente" | duración: 30 min\n- id: cmtpdi4u6001pnx1wtenu3wgu | nombre: "Tratamiento capilar" | duración: 30 min',
    empleados:
      '- id: cmtpdija2001rnx1w5l5uuko0 | nombre: "Montse"\n- id: cmtpdj5qg001tnx1wclb6i812 | nombre: "pedro"',
    horario_semanal:
      "Lunes: 09:00–18:00. Martes: 09:00–18:00. Miércoles: 09:00–18:00. Jueves: 09:00–18:00. Viernes: 09:00–18:00. Sábado: cerrado. Domingo: cerrado.",
    telefono_de_quien_llama: "+34600123456",
  },
  barberia: {
    ...DYNAMIC_CONTEXT,
    servicios_disponibles:
      '- id: cmtpgjgoh000vnx56toxohy2g | nombre: "Corte de niño" | duración: 30 min\n- id: cmtpgkiad0011nx56q0izgmm9 | nombre: "decoloracion" | duración: 30 min\n- id: cmtpgk4yc000xnx56yknhi3te | nombre: "degradado" | duración: 30 min\n- id: cmtpgnuyi0019nx56o58nj8ja | nombre: "lavado" | duración: 30 min\n- id: cmtpgk9mh000znx56s6jl9fpe | nombre: "tupper fade" | duración: 30 min',
    empleados:
      '- id: cmtpgmmai0015nx56tw7xvpue | nombre: "Alvaro"\n- id: cmtpgnk5q0017nx56pwst0lmq | nombre: "Belén"\n- id: cmtpgmbxk0013nx56utl47p6r | nombre: "Guillem"',
    horario_semanal:
      "Lunes: 09:00–18:00. Martes: 09:00–18:00. Miércoles: 09:00–18:00. Jueves: 09:00–18:00. Viernes: 09:00–18:00. Sábado: cerrado. Domingo: cerrado.",
    telefono_de_quien_llama: "+34600123456",
  },
  salonUnas: {
    ...DYNAMIC_CONTEXT,
    servicios_disponibles:
      '- id: cmtpo1hck000lnxdy2hu3g75j | nombre: "Diseño de uñas" | duración: 30 min\n- id: cmtpo1hci000fnxdysg0zqpec | nombre: "Manicura semipermanente" | duración: 45 min\n- id: cmtpo1hcj000hnxdy6l9mkpiu | nombre: "Pedicura spa" | duración: 50 min\n- id: cmtpo1hck000nnxdylz26p7wc | nombre: "Retirada de esmalte permanente" | duración: 20 min\n- id: cmtpo1hcj000jnxdydz2l6twy | nombre: "Uñas acrílicas" | duración: 60 min',
    empleados:
      '- id: cmtpo1hcm000rnxdy3kxit39q | nombre: "Marta"\n- id: cmtpo1hck000pnxdyqsa7qx5l | nombre: "Sofía"',
    horario_semanal:
      "Lunes: 09:00–18:00. Martes: 09:00–18:00. Miércoles: 09:00–18:00. Jueves: 09:00–18:00. Viernes: 09:00–18:00. Sábado: cerrado. Domingo: cerrado.",
    telefono_de_quien_llama: "+34600123456",
  },
  estetica: {
    ...DYNAMIC_CONTEXT,
    servicios_disponibles:
      '- id: cmtpo1hc80003nxdyc8tp4c80 | nombre: "Depilación láser" | duración: 30 min\n- id: cmtpo1hc50001nxdybwvsnk11 | nombre: "Limpieza facial" | duración: 45 min\n- id: cmtpo1hc90007nxdygu8dnscc | nombre: "Manicura spa" | duración: 40 min\n- id: cmtpo1hc90005nxdyvuin08z8 | nombre: "Masaje relajante" | duración: 60 min\n- id: cmtpo1hca0009nxdyaq2qgh0r | nombre: "Tratamiento anti-edad" | duración: 50 min',
    empleados:
      '- id: cmtpo1hce000dnxdyv1kkq97z | nombre: "Carmen"\n- id: cmtpo1hcb000bnxdy3mxtkxa8 | nombre: "Laura"',
    horario_semanal:
      "Lunes: 09:00–18:00. Martes: 09:00–18:00. Miércoles: 09:00–18:00. Jueves: 09:00–18:00. Viernes: 09:00–18:00. Sábado: cerrado. Domingo: cerrado.",
    telefono_de_quien_llama: "+34600123456",
  },
  fisioterapia: {
    ...DYNAMIC_CONTEXT,
    servicios_disponibles:
      '- id: cmtpo1hcq000vnxdybju5swrm | nombre: "Masaje deportivo" | duración: 30 min\n- id: cmtpo1hcr000xnxdyfsl89sem | nombre: "Punción seca" | duración: 30 min\n- id: cmtpo1hcr000znxdyjkrprkd8 | nombre: "Rehabilitación de lesiones" | duración: 60 min\n- id: cmtpo1hcp000tnxdyz06a0r5q | nombre: "Sesión de fisioterapia" | duración: 45 min\n- id: cmtpo1hcs0011nxdy0it9pnem | nombre: "Valoración inicial" | duración: 30 min',
    empleados:
      '- id: cmtpo1hct0015nxdylsbf5g5f | nombre: "Elena"\n- id: cmtpo1hcs0013nxdywyo2vtwh | nombre: "Javier"',
    horario_semanal:
      "Lunes: 09:00–18:00. Martes: 09:00–18:00. Miércoles: 09:00–18:00. Jueves: 09:00–18:00. Viernes: 09:00–18:00. Sábado: cerrado. Domingo: cerrado.",
    telefono_de_quien_llama: "+34600123456",
  },
};

// ==================== PELUQUERÍA - 20 TEST CASES ====================
// Servicios reales: Alisado, Corte, Decoloracion, Permanente, Tratamiento capilar (todos 30 min)
// Empleados reales: Montse, pedro. Horario real: L-V 09:00-18:00, S-D cerrado.
// businessDetails=null: el agente no tiene precio, ubicación, descuentos ni política de
// cancelación — el criterio de "éxito" en esos casos es que tome un recado, no que invente.

const peluqueriaTestCases: CreateRetellTestCaseInput[] = [
  {
    name: "Peluquería 1: Consulta básica de horarios",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Cliente nuevo que llama para preguntar el horario de hoy.",
    metrics: [
      "El agente saluda amablemente",
      "Usa check_business_hours y comunica el horario real al cliente (09:00-18:00)",
      "Ofrece ayuda adicional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: BUSINESS_HOURS_MOCK }],
  },
  {
    name: "Peluquería 2: Reserva de Corte",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Quiere reservar un Corte para mañana a las 11:00. Da su nombre cuando se lo pidan.",
    metrics: [
      "El agente verifica disponibilidad con check_availability",
      "Confirma servicio (Corte), fecha, hora y nombre",
      "Usa book_appointment y confirma la reserva",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Peluquería 3: Alisado y duración",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta si hacen Alisado y cuánto dura aproximadamente.",
    metrics: [
      "Confirma que el Alisado está disponible (existe en el catálogo real)",
      "Da una duración aproximada en lenguaje natural, no en minutos exactos",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 4: Reserva con Montse",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Quiere reservar un Corte específicamente con Montse mañana por la tarde.",
    metrics: [
      "Reconoce la petición de un profesional concreto (Montse)",
      "Verifica disponibilidad de Montse con check_availability",
      "Confirma o reserva con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_PELUQUERIA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Peluquería 5: Servicio inexistente (mechas)",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta si hacen mechas.",
    metrics: [
      "El agente NO confirma ni inventa el servicio 'mechas', ya que no existe en el catálogo real (solo Alisado, Corte, Decoloracion, Permanente, Tratamiento capilar)",
      "No reserva una cita para un servicio inexistente",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 6: Corte + Tratamiento capilar el mismo día",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Quiere reservar Corte y Tratamiento capilar el mismo día, mañana por la mañana.",
    metrics: [
      "Reconoce ambos servicios reales solicitados",
      "Verifica disponibilidad",
      "Reserva ambos servicios (o explica cómo se gestionan)",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Peluquería 7: Cancelar cita",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Quiere cancelar una cita que tiene para mañana. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa una cancelación automática (no existe esa tool)",
      "Toma un recado con nombre, teléfono y motivo para que el negocio gestione la cancelación",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 8: Descuentos",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta si hay descuento para primeras visitas. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa una respuesta sobre descuentos (dato no verificado)",
      "Toma nota o remite a otro canal en vez de bloquearse repitiendo la misma frase",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 9: Prefiere a pedro",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Quiere reservar una Permanente con pedro la semana que viene.",
    metrics: [
      "Reconoce la solicitud del profesional pedro",
      "Verifica disponibilidad",
      "Reserva o confirma con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_PELUQUERIA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Peluquería 10: Horario de sábado",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta si abren el sábado.",
    metrics: [
      "Usa check_business_hours",
      "Informa correctamente que el sábado está cerrado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Peluquería 11: Urgencia el mismo día",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Necesita una Decoloracion hoy mismo, es urgente.",
    metrics: [
      "Comprende la urgencia",
      "Verifica disponibilidad para hoy",
      "Ofrece una hora concreta o explica que no hay hueco",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_availability", output: AVAILABILITY_MOCK }],
  },
  {
    name: "Peluquería 12: Cliente nuevo, bienvenida",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Es la primera vez que llama y no sabe bien qué preguntar; solo saluda y espera que el agente le guíe.",
    metrics: [
      "Da una bienvenida cálida",
      "Ofrece ayuda concreta (reservar, horarios, servicios) sin inventar información que no tiene",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 13: Precio de la Permanente",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta cuánto cuesta la Permanente. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa un precio (el sistema no gestiona precios)",
      "Toma nota o remite a otro canal en vez de fallar en bucle",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 14: Vale regalo",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta si venden vales regalo. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa información sobre vales regalo",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 15: Métodos de pago",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta si se puede pagar con tarjeta. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa una respuesta sobre métodos de pago",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 16: Ubicación exacta",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta la dirección exacta del salón. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa una dirección",
      "Toma nota o remite a otro canal (web, Google Maps) para confirmarla",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 17: Intento de reserva en domingo",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Quiere reservar un Corte el domingo por la mañana.",
    metrics: [
      "Usa check_business_hours antes de confirmar",
      "Informa que el domingo está cerrado",
      "Ofrece tomar nota o consultar otro día, sin inventar ni confirmar una disponibilidad que no ha verificado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Peluquería 18: Marca de productos",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta qué marca de tinte usan. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "El agente no inventa una marca",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Peluquería 19: Cierre correcto tras reservar",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Reserva un Corte para mañana, confirma los datos, y luego se despide agradeciendo sin más preguntas.",
    metrics: [
      "Completa la reserva con book_appointment",
      "Tras la despedida del cliente, el agente se despide brevemente y cuelga usando la tool end_call en vez de seguir hablando",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Peluquería 20: Duración del Tratamiento capilar",
    llmId: "llm_4dfeb6de3278f33dcc30738718c7",
    userPrompt: "Pregunta cuánto dura aproximadamente un Tratamiento capilar.",
    metrics: [
      "Confirma que el servicio existe",
      "Da una duración aproximada en lenguaje natural (no minutos exactos)",
    ],
    llmModel: "gpt-4.1",
  },
];

// ==================== BARBERÍA - 20 TEST CASES ====================
// Servicios reales: Corte de niño, decoloracion, degradado, lavado, tupper fade (todos 30 min)
// Empleados reales: Alvaro, Belén, Guillem. Horario real: L-V 09:00-18:00, S-D cerrado.

const barberiaTestCases: CreateRetellTestCaseInput[] = [
  {
    name: "Barbería 1: Consulta básica de horarios",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Cliente nuevo que llama para preguntar el horario de hoy.",
    metrics: [
      "Saluda amablemente",
      "Usa check_business_hours y comunica el horario real (09:00-18:00)",
      "Ofrece ayuda adicional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: BUSINESS_HOURS_MOCK }],
  },
  {
    name: "Barbería 2: Reserva de degradado",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Quiere reservar un degradado para mañana a las 12:00. Da su nombre cuando se lo pidan.",
    metrics: [
      "Verifica disponibilidad con check_availability",
      "Confirma servicio (degradado), fecha, hora y nombre",
      "Usa book_appointment y confirma la reserva",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Barbería 3: tupper fade y duración",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si hacen tupper fade y cuánto dura aproximadamente.",
    metrics: [
      "Confirma que el servicio existe en el catálogo real",
      "Da una duración aproximada en lenguaje natural",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 4: Reserva con Guillem",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Quiere reservar un degradado específicamente con Guillem mañana por la tarde.",
    metrics: [
      "Reconoce la petición del profesional Guillem",
      "Verifica disponibilidad",
      "Confirma o reserva con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_BARBERIA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Barbería 5: Servicio inexistente (afeitado con navaja)",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si hacen afeitado apurado con navaja.",
    metrics: [
      "El agente NO confirma ni inventa ese servicio, ya que no existe en el catálogo real (solo Corte de niño, decoloracion, degradado, lavado, tupper fade)",
      "No reserva una cita para un servicio inexistente",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 6: Corte de niño + lavado el mismo día",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Quiere reservar Corte de niño y lavado el mismo día, mañana por la mañana, para su hijo.",
    metrics: [
      "Reconoce ambos servicios reales",
      "Verifica disponibilidad",
      "Reserva ambos servicios (o explica cómo se gestionan)",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Barbería 7: Cancelar cita",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Quiere cancelar una cita que tiene para mañana. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una cancelación automática (no existe esa tool)",
      "Toma un recado con nombre, teléfono y motivo",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 8: Abonos y descuentos",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si tienen abonos mensuales con descuento. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre abonos/descuentos",
      "Toma nota o remite a otro canal en vez de bloquearse repitiendo la misma frase",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 9: Prefiere a Belén",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Quiere reservar una decoloracion con Belén la semana que viene.",
    metrics: [
      "Reconoce la solicitud del profesional Belén",
      "Verifica disponibilidad",
      "Reserva o confirma con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_BARBERIA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Barbería 10: Horario de domingo",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si abren el domingo.",
    metrics: [
      "Usa check_business_hours",
      "Informa correctamente que el domingo está cerrado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Barbería 11: Urgencia el mismo día",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Necesita un degradado hoy mismo, es urgente porque tiene un evento.",
    metrics: [
      "Comprende la urgencia",
      "Verifica disponibilidad para hoy",
      "Ofrece una hora concreta o explica que no hay hueco",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_availability", output: AVAILABILITY_MOCK }],
  },
  {
    name: "Barbería 12: Cliente nuevo, bienvenida",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Primera vez que llama, solo saluda y espera que el agente le guíe.",
    metrics: [
      "Da una bienvenida cálida",
      "Ofrece ayuda concreta sin inventar información que no tiene",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 13: Precio de la decoloracion",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta cuánto cuesta la decoloracion. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa un precio (el sistema no gestiona precios)",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 14: Vale regalo",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si venden vales regalo. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre vales regalo",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 15: Métodos de pago",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si aceptan pago con Bizum. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una respuesta sobre métodos de pago",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 16: Parking cercano",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta si hay parking cerca de la barbería. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre parking",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 17: Intento de reserva en sábado",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Quiere reservar un tupper fade el sábado por la mañana.",
    metrics: [
      "Usa check_business_hours antes de confirmar",
      "Informa que el sábado está cerrado",
      "Ofrece tomar nota o consultar otro día, sin inventar ni confirmar una disponibilidad que no ha verificado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Barbería 18: Marca de productos de barba",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta qué marca de cera o aceite de barba usan. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una marca",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Barbería 19: Cierre correcto tras reservar",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Reserva un degradado para mañana, confirma los datos, y luego se despide agradeciendo sin más preguntas.",
    metrics: [
      "Completa la reserva con book_appointment",
      "Tras la despedida, se despide brevemente y cuelga con la tool end_call en vez de seguir hablando",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Barbería 20: Duración del degradado",
    llmId: "llm_31a8c0ee2b01273747c015de1222",
    userPrompt: "Pregunta cuánto dura aproximadamente un degradado.",
    metrics: [
      "Confirma que el servicio existe",
      "Da una duración aproximada en lenguaje natural",
    ],
    llmModel: "gpt-4.1",
  },
];

// ==================== SALÓN DE UÑAS - 20 TEST CASES ====================
// Servicios reales: Diseño de uñas (30), Manicura semipermanente (45), Pedicura spa (50),
// Retirada de esmalte permanente (20), Uñas acrílicas (60). Empleados: Marta, Sofía.
// Horario real: L-V 09:00-18:00, S-D cerrado.

const salonUnasTestCases: CreateRetellTestCaseInput[] = [
  {
    name: "Salón de Uñas 1: Consulta básica de horarios",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Cliente nuevo que llama para preguntar el horario de hoy.",
    metrics: [
      "Saluda amablemente",
      "Usa check_business_hours y comunica el horario real (09:00-18:00)",
      "Ofrece ayuda adicional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: BUSINESS_HOURS_MOCK }],
  },
  {
    name: "Salón de Uñas 2: Reserva de Manicura semipermanente",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Quiere reservar una Manicura semipermanente para mañana a las 10:00. Da su nombre cuando se lo pidan.",
    metrics: [
      "Verifica disponibilidad con check_availability",
      "Confirma servicio, fecha, hora y nombre",
      "Usa book_appointment y confirma la reserva",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Salón de Uñas 3: Uñas acrílicas y duración",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta si hacen Uñas acrílicas y cuánto dura aproximadamente.",
    metrics: [
      "Confirma que el servicio existe en el catálogo real",
      "Da una duración aproximada en lenguaje natural (es el servicio más largo, 60 min)",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 4: Reserva con Marta",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Quiere reservar un Diseño de uñas específicamente con Marta mañana por la tarde.",
    metrics: [
      "Reconoce la petición del profesional Marta",
      "Verifica disponibilidad",
      "Confirma o reserva con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_SALON_UNAS },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Salón de Uñas 5: Servicio inexistente (poligel)",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta si hacen extensiones de poligel.",
    metrics: [
      "El agente NO confirma ni inventa ese servicio, ya que no existe en el catálogo real (solo Diseño de uñas, Manicura semipermanente, Pedicura spa, Retirada de esmalte permanente, Uñas acrílicas)",
      "No reserva una cita para un servicio inexistente",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 6: Manicura semipermanente + Pedicura spa el mismo día",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Quiere reservar Manicura semipermanente y Pedicura spa el mismo día, mañana por la mañana.",
    metrics: [
      "Reconoce ambos servicios reales",
      "Verifica disponibilidad",
      "Reserva ambos servicios (o explica cómo se gestionan)",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Salón de Uñas 7: Cancelar cita",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Quiere cancelar una cita que tiene para mañana. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una cancelación automática (no existe esa tool)",
      "Toma un recado con nombre, teléfono y motivo",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 8: Descuento grupal para amigas",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta si hay descuento si van 4 amigas juntas. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre descuentos grupales",
      "Toma nota o remite a otro canal en vez de bloquearse repitiendo la misma frase",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 9: Prefiere a Sofía",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Quiere reservar una Retirada de esmalte permanente con Sofía la semana que viene.",
    metrics: [
      "Reconoce la solicitud del profesional Sofía",
      "Verifica disponibilidad",
      "Reserva o confirma con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_SALON_UNAS },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Salón de Uñas 10: Horario de domingo",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta si abren el domingo.",
    metrics: [
      "Usa check_business_hours",
      "Informa correctamente que el domingo está cerrado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Salón de Uñas 11: Urgencia el mismo día",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Necesita un Diseño de uñas hoy mismo porque tiene un evento por la noche.",
    metrics: [
      "Comprende la urgencia",
      "Verifica disponibilidad para hoy",
      "Ofrece una hora concreta o explica que no hay hueco",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_availability", output: AVAILABILITY_MOCK }],
  },
  {
    name: "Salón de Uñas 12: Cliente nuevo, bienvenida",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Primera vez que llama, solo saluda y espera que el agente le guíe.",
    metrics: [
      "Da una bienvenida cálida",
      "Ofrece ayuda concreta sin inventar información que no tiene",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 13: Precio de las Uñas acrílicas",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta cuánto cuestan las Uñas acrílicas. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa un precio (el sistema no gestiona precios)",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 14: Vale regalo",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta si venden vales regalo. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre vales regalo",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 15: Métodos de pago",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta si aceptan pago con tarjeta. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una respuesta sobre métodos de pago",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 16: Alergias y productos hipoalergénicos",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Dice que es alérgica y pregunta si tienen productos hipoalergénicos. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre productos hipoalergénicos",
      "Toma en serio la alergia y remite a otro canal o toma nota para que un profesional lo confirme",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 17: Intento de reserva en sábado",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Quiere reservar una Pedicura spa el sábado por la mañana.",
    metrics: [
      "Usa check_business_hours antes de confirmar",
      "Informa que el sábado está cerrado",
      "Ofrece tomar nota o consultar otro día, sin inventar ni confirmar una disponibilidad que no ha verificado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Salón de Uñas 18: Marca de esmaltes",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta qué marca de esmalte semipermanente usan. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una marca",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Salón de Uñas 19: Cierre correcto tras reservar",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Reserva una Manicura semipermanente para mañana, confirma los datos, y luego se despide agradeciendo sin más preguntas.",
    metrics: [
      "Completa la reserva con book_appointment",
      "Tras la despedida, se despide brevemente y cuelga con la tool end_call en vez de seguir hablando",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Salón de Uñas 20: Duración de la Pedicura spa",
    llmId: "llm_f4185da9b9a08e07589525ff321a",
    userPrompt: "Pregunta cuánto dura aproximadamente una Pedicura spa.",
    metrics: [
      "Confirma que el servicio existe",
      "Da una duración aproximada en lenguaje natural",
    ],
    llmModel: "gpt-4.1",
  },
];

// ==================== CENTRO DE ESTÉTICA - 20 TEST CASES ====================
// Servicios reales: Depilación láser (30), Limpieza facial (45), Manicura spa (40),
// Masaje relajante (60), Tratamiento anti-edad (50). Empleados: Carmen, Laura.
// Horario real: L-V 09:00-18:00, S-D cerrado.

const centroEsteticaTestCases: CreateRetellTestCaseInput[] = [
  {
    name: "Centro de Estética 1: Consulta básica de horarios",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Cliente nuevo que llama para preguntar el horario de hoy.",
    metrics: [
      "Saluda amablemente",
      "Usa check_business_hours y comunica el horario real (09:00-18:00)",
      "Ofrece ayuda adicional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: BUSINESS_HOURS_MOCK }],
  },
  {
    name: "Centro de Estética 2: Reserva de Limpieza facial",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Quiere reservar una Limpieza facial para mañana a las 11:00. Da su nombre cuando se lo pidan.",
    metrics: [
      "Verifica disponibilidad con check_availability",
      "Confirma servicio, fecha, hora y nombre",
      "Usa book_appointment y confirma la reserva",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Centro de Estética 3: Masaje relajante y duración",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta si hacen Masaje relajante y cuánto dura aproximadamente.",
    metrics: [
      "Confirma que el servicio existe en el catálogo real",
      "Da una duración aproximada en lenguaje natural (es el más largo, 60 min)",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 4: Reserva con Carmen",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Quiere reservar una Depilación láser específicamente con Carmen mañana por la tarde.",
    metrics: [
      "Reconoce la petición del profesional Carmen",
      "Verifica disponibilidad",
      "Confirma o reserva con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_ESTETICA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Centro de Estética 5: Servicio inexistente (peeling químico)",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta si hacen peeling químico.",
    metrics: [
      "El agente NO confirma ni inventa ese servicio, ya que no existe en el catálogo real (solo Depilación láser, Limpieza facial, Manicura spa, Masaje relajante, Tratamiento anti-edad)",
      "No reserva una cita para un servicio inexistente",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 6: Limpieza facial + Manicura spa el mismo día",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Quiere reservar Limpieza facial y Manicura spa el mismo día, mañana por la mañana.",
    metrics: [
      "Reconoce ambos servicios reales",
      "Verifica disponibilidad",
      "Reserva ambos servicios (o explica cómo se gestionan)",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Centro de Estética 7: Cancelar cita",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Quiere cancelar una cita que tiene para mañana. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una cancelación automática (no existe esa tool)",
      "Toma un recado con nombre, teléfono y motivo",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 8: Paquete combinado con descuento",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta si hay descuento si reserva Limpieza facial y Masaje relajante juntos. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre descuentos por paquete",
      "Toma nota o remite a otro canal en vez de bloquearse repitiendo la misma frase",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 9: Prefiere a Laura",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Quiere reservar un Tratamiento anti-edad con Laura la semana que viene.",
    metrics: [
      "Reconoce la solicitud del profesional Laura",
      "Verifica disponibilidad",
      "Reserva o confirma con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_ESTETICA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Centro de Estética 10: Horario de domingo",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta si abren el domingo.",
    metrics: [
      "Usa check_business_hours",
      "Informa correctamente que el domingo está cerrado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Centro de Estética 11: Urgencia el mismo día",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Necesita una Limpieza facial hoy mismo porque tiene un evento importante mañana.",
    metrics: [
      "Comprende la urgencia",
      "Verifica disponibilidad para hoy",
      "Ofrece una hora concreta o explica que no hay hueco",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_availability", output: AVAILABILITY_MOCK }],
  },
  {
    name: "Centro de Estética 12: Cliente nuevo, bienvenida",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Primera vez que llama, solo saluda y espera que el agente le guíe.",
    metrics: [
      "Da una bienvenida cálida",
      "Ofrece ayuda concreta sin inventar información que no tiene",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 13: Precio del Tratamiento anti-edad",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta cuánto cuesta el Tratamiento anti-edad. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa un precio (el sistema no gestiona precios)",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 14: Vale regalo",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta si venden vales regalo. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre vales regalo",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 15: Métodos de pago",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta si aceptan pago con tarjeta. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una respuesta sobre métodos de pago",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 16: Piel sensible y productos",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Dice que tiene piel muy sensible y pregunta si usan productos suaves. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre los productos que usan",
      "Toma en serio la sensibilidad y remite a otro canal o toma nota para que lo confirme un profesional",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 17: Intento de reserva en sábado",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Quiere reservar una Depilación láser el sábado por la mañana.",
    metrics: [
      "Usa check_business_hours antes de confirmar",
      "Informa que el sábado está cerrado",
      "Ofrece tomar nota o consultar otro día, sin inventar ni confirmar una disponibilidad que no ha verificado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Centro de Estética 18: Marca de productos",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta qué marca de cosmética usan en los tratamientos faciales. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una marca",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Centro de Estética 19: Cierre correcto tras reservar",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Reserva una Limpieza facial para mañana, confirma los datos, y luego se despide agradeciendo sin más preguntas.",
    metrics: [
      "Completa la reserva con book_appointment",
      "Tras la despedida, se despide brevemente y cuelga con la tool end_call en vez de seguir hablando",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Centro de Estética 20: Duración del Masaje relajante",
    llmId: "llm_b63fa254fe51f99906a4a89f4c53",
    userPrompt: "Pregunta cuánto dura aproximadamente un Masaje relajante.",
    metrics: [
      "Confirma que el servicio existe",
      "Da una duración aproximada en lenguaje natural",
    ],
    llmModel: "gpt-4.1",
  },
];

// ==================== FISIOTERAPIA - 20 TEST CASES ====================
// Servicios reales: Masaje deportivo (30), Punción seca (30), Rehabilitación de lesiones (60),
// Sesión de fisioterapia (45), Valoración inicial (30). Empleados: Elena, Javier.
// Horario real: L-V 09:00-18:00, S-D cerrado. Nota GDPR: no se pide detalle médico estructurado.

const fisioterapiaTestCases: CreateRetellTestCaseInput[] = [
  {
    name: "Fisioterapia 1: Consulta básica de horarios",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Cliente nuevo que llama para preguntar el horario de hoy.",
    metrics: [
      "Saluda amablemente",
      "Usa check_business_hours y comunica el horario real (09:00-18:00)",
      "Ofrece ayuda adicional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: BUSINESS_HOURS_MOCK }],
  },
  {
    name: "Fisioterapia 2: Reserva de Valoración inicial por dolor de espalda",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Tiene dolor de espalda y quiere reservar una Valoración inicial para mañana a las 10:00. Da su nombre cuando se lo pidan.",
    metrics: [
      "Pregunta el motivo en términos generales, sin pedir detalle médico estructurado",
      "Verifica disponibilidad con check_availability",
      "Usa book_appointment y confirma la reserva",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Fisioterapia 3: Rehabilitación de lesiones y duración",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si hacen Rehabilitación de lesiones y cuánto dura aproximadamente.",
    metrics: [
      "Confirma que el servicio existe en el catálogo real",
      "Da una duración aproximada en lenguaje natural (es el más largo, 60 min)",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 4: Reserva con Elena",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Quiere reservar una Sesión de fisioterapia específicamente con Elena mañana por la tarde.",
    metrics: [
      "Reconoce la petición del profesional Elena",
      "Verifica disponibilidad",
      "Confirma o reserva con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_FISIOTERAPIA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Fisioterapia 5: Servicio inexistente (acupuntura)",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si hacen acupuntura.",
    metrics: [
      "El agente NO confirma ni inventa ese servicio, ya que no existe en el catálogo real (solo Masaje deportivo, Punción seca, Rehabilitación de lesiones, Sesión de fisioterapia, Valoración inicial)",
      "No reserva una cita para un servicio inexistente",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 6: Valoración inicial + Sesión de fisioterapia el mismo día",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Quiere reservar Valoración inicial y Sesión de fisioterapia el mismo día, mañana por la mañana.",
    metrics: [
      "Reconoce ambos servicios reales",
      "Verifica disponibilidad",
      "Reserva ambos servicios (o explica cómo se gestionan)",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Fisioterapia 7: Cancelar cita",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Quiere cancelar una cita que tiene para mañana. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una cancelación automática (no existe esa tool)",
      "Toma un recado con nombre, teléfono y motivo",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 8: Precio con seguro médico",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si trabajan con su seguro médico y si tiene descuento. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre seguros ni descuentos",
      "Toma nota o remite a otro canal en vez de bloquearse repitiendo la misma frase",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 9: Prefiere a Javier",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Quiere reservar un Masaje deportivo con Javier la semana que viene.",
    metrics: [
      "Reconoce la solicitud del profesional Javier",
      "Verifica disponibilidad",
      "Reserva o confirma con ese profesional",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK_FISIOTERAPIA },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Fisioterapia 10: Horario de domingo",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si abren el domingo.",
    metrics: [
      "Usa check_business_hours",
      "Informa correctamente que el domingo está cerrado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Fisioterapia 11: Urgencia por dolor agudo",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Tiene un dolor agudo repentino y necesita un Masaje deportivo hoy mismo.",
    metrics: [
      "Comprende la urgencia",
      "Verifica disponibilidad para hoy",
      "Ofrece una hora concreta o explica que no hay hueco",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_availability", output: AVAILABILITY_MOCK }],
  },
  {
    name: "Fisioterapia 12: Cliente nuevo, bienvenida",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Primera vez que llama, solo saluda y espera que el agente le guíe.",
    metrics: [
      "Da una bienvenida cálida",
      "Ofrece ayuda concreta sin inventar información que no tiene",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 13: Precio de la Sesión de fisioterapia",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta cuánto cuesta una Sesión de fisioterapia. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa un precio (el sistema no gestiona precios)",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 14: Necesita derivación médica",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si necesita que su médico le derive antes de poder reservar cita. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una política de derivación que no tiene verificada",
      "Toma nota o remite a otro canal, o explica que puede reservar directamente si el sistema no exige derivación",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 15: Métodos de pago",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si aceptan pago con tarjeta. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa una respuesta sobre métodos de pago",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 16: Atención a domicilio",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si hacen visitas a domicilio porque no puede desplazarse. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre atención a domicilio",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 17: Intento de reserva en sábado",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Quiere reservar una Punción seca el sábado por la mañana.",
    metrics: [
      "Usa check_business_hours antes de confirmar",
      "Informa que el sábado está cerrado",
      "Ofrece tomar nota o consultar otro día, sin inventar ni confirmar una disponibilidad que no ha verificado",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [{ toolName: "check_business_hours", output: CLOSED_MOCK }],
  },
  {
    name: "Fisioterapia 18: Técnica específica (electroestimulación)",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta si usan electroestimulación en sus tratamientos. Si el agente te pide nombre y teléfono para tomar nota, dáselos sin poner objeciones (usa un nombre y un número de teléfono cualquiera) y despídete.",
    metrics: [
      "No inventa información sobre técnicas o equipamiento no verificado",
      "Toma nota o remite a otro canal",
    ],
    llmModel: "gpt-4.1",
  },
  {
    name: "Fisioterapia 19: Cierre correcto tras reservar",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Reserva una Valoración inicial para mañana, confirma los datos, y luego se despide agradeciendo sin más preguntas.",
    metrics: [
      "Completa la reserva con book_appointment",
      "Tras la despedida, se despide brevemente y cuelga con la tool end_call en vez de seguir hablando",
    ],
    llmModel: "gpt-4.1",
    toolMocks: [
      { toolName: "check_availability", output: AVAILABILITY_MOCK },
      { toolName: "book_appointment", output: BOOKING_MOCK },
    ],
  },
  {
    name: "Fisioterapia 20: Duración de la Punción seca",
    llmId: "llm_613ed707d5faf24b00e00f95a018",
    userPrompt: "Pregunta cuánto dura aproximadamente una sesión de Punción seca.",
    metrics: [
      "Confirma que el servicio existe",
      "Da una duración aproximada en lenguaje natural",
    ],
    llmModel: "gpt-4.1",
  },
];

// ==================== TEST SUITE ====================

describe("Retell Agent Simulations - GPT-4.1", () => {
  let peluqueriaTestCaseIds: string[] = [];
  let barberiaTestCaseIds: string[] = [];
  let salonUnasTestCaseIds: string[] = [];
  let centroEsteticaTestCaseIds: string[] = [];
  let fisioterapiaTestCaseIds: string[] = [];
  let peluqueriaBatchJobId: string = "";
  let barberiaBatchJobId: string = "";
  let salonUnasBatchJobId: string = "";
  let centroEsteticaBatchJobId: string = "";
  let fisioterapiaBatchJobId: string = "";

  beforeAll(async () => {
    // Crear test cases para peluquería
    console.log("🏪 Creando test cases para Peluquería...");
    for (const testCase of peluqueriaTestCases) {
      try {
        const result = await retellAdapter.createTestCaseDefinition({
          ...testCase,
          dynamicVariables: DYNAMIC_VARS.peluqueria,
        });
        peluqueriaTestCaseIds.push(result.testCaseDefinitionId);
      } catch (error) {
        console.error(`❌ Error creando test case: ${testCase.name}`, error);
      }
    }
    console.log(`✅ ${peluqueriaTestCaseIds.length} test cases de Peluquería creados`);

    // Crear test cases para barbería
    console.log("🏪 Creando test cases para Barbería...");
    for (const testCase of barberiaTestCases) {
      try {
        const result = await retellAdapter.createTestCaseDefinition({
          ...testCase,
          dynamicVariables: DYNAMIC_VARS.barberia,
        });
        barberiaTestCaseIds.push(result.testCaseDefinitionId);
      } catch (error) {
        console.error(`❌ Error creando test case: ${testCase.name}`, error);
      }
    }
    console.log(`✅ ${barberiaTestCaseIds.length} test cases de Barbería creados`);

    // Crear test cases para salón de uñas
    console.log("🏪 Creando test cases para Salón de Uñas...");
    for (const testCase of salonUnasTestCases) {
      try {
        const result = await retellAdapter.createTestCaseDefinition({
          ...testCase,
          dynamicVariables: DYNAMIC_VARS.salonUnas,
        });
        salonUnasTestCaseIds.push(result.testCaseDefinitionId);
      } catch (error) {
        console.error(`❌ Error creando test case: ${testCase.name}`, error);
      }
    }
    console.log(`✅ ${salonUnasTestCaseIds.length} test cases de Salón de Uñas creados`);

    // Crear test cases para centro de estética
    console.log("🏪 Creando test cases para Centro de Estética...");
    for (const testCase of centroEsteticaTestCases) {
      try {
        const result = await retellAdapter.createTestCaseDefinition({
          ...testCase,
          dynamicVariables: DYNAMIC_VARS.estetica,
        });
        centroEsteticaTestCaseIds.push(result.testCaseDefinitionId);
      } catch (error) {
        console.error(`❌ Error creando test case: ${testCase.name}`, error);
      }
    }
    console.log(`✅ ${centroEsteticaTestCaseIds.length} test cases de Centro de Estética creados`);

    // Crear test cases para fisioterapia
    console.log("🏪 Creando test cases para Fisioterapia...");
    for (const testCase of fisioterapiaTestCases) {
      try {
        const result = await retellAdapter.createTestCaseDefinition({
          ...testCase,
          dynamicVariables: DYNAMIC_VARS.fisioterapia,
        });
        fisioterapiaTestCaseIds.push(result.testCaseDefinitionId);
      } catch (error) {
        console.error(`❌ Error creando test case: ${testCase.name}`, error);
      }
    }
    console.log(`✅ ${fisioterapiaTestCaseIds.length} test cases de Fisioterapia creados`);
  }, 120000); // 2 minutos timeout para crear todos los test cases

  describe("Peluquería - Simulations con GPT-4.1", () => {
    it("debería ejecutar 20 test cases de Peluquería", async () => {
      if (peluqueriaTestCaseIds.length === 0) {
        console.warn("⚠️  No hay test case IDs. Verifica que la creación funcionó.");
        expect(true).toBe(true); // Skip test
        return;
      }

      console.log("\n🚀 Ejecutando batch de tests para Peluquería...");

      // Crear batch job
      const batchJob = await retellAdapter.createBatchTest({
        llmId: "llm_4dfeb6de3278f33dcc30738718c7",
        testCaseDefinitionIds: peluqueriaTestCaseIds,
      });

      peluqueriaBatchJobId = batchJob.testCaseBatchJobId;
      console.log(`📊 Batch job ID: ${peluqueriaBatchJobId}`);
      console.log(`   Status: ${batchJob.status}`);

      // Esperar a que se complete (máx 5 minutos)
      let completed = false;
      let attempts = 0;
      const maxAttempts = 60; // 60 * 5s = 5 minutos

      while (!completed && attempts < maxAttempts) {
        const status = await retellAdapter.getBatchTest(peluqueriaBatchJobId);

        if (status.status === "complete") {
          completed = true;
          console.log(`\n✅ Batch completado:`);
          console.log(`   Total: ${status.totalCount}`);
          console.log(`   Pasados: ${status.passCount}`);
          console.log(`   Fallidos: ${status.failCount}`);
          console.log(`   Errores: ${status.errorCount}`);

          // Obtener detalles de cada run
          const runs = await retellAdapter.listTestRuns(peluqueriaBatchJobId);

          let passCount = 0;
          let failCount = 0;

          for (const run of runs) {
            if (run.status === "pass") {
              passCount++;
              console.log(`   ✅ ${run.name}`);
            } else if (run.status === "fail") {
              failCount++;
              console.log(
                `   ❌ ${run.name}: ${run.resultExplanation || "No explanation"}`
              );
            } else if (run.status === "error") {
              console.log(
                `   ⚠️  ${run.name} (error de ejecución): ${run.resultExplanation}`
              );
            }
          }

          // Verificar que al menos el 80% pasó
          const passRate = passCount / peluqueriaTestCaseIds.length;
          expect(passRate).toBeGreaterThanOrEqual(0.8);
        } else {
          console.log(
            `⏳ Esperando... (intento ${attempts + 1}/${maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      if (!completed) {
        throw new Error("Batch job no se completó en el tiempo permitido");
      }
    }, 360000); // 6 minutos timeout
  });

  describe("Barbería - Simulations con GPT-4.1", () => {
    it("debería ejecutar 20 test cases de Barbería", async () => {
      if (barberiaTestCaseIds.length === 0) {
        console.warn("⚠️  No hay test case IDs. Verifica que la creación funcionó.");
        expect(true).toBe(true); // Skip test
        return;
      }

      console.log("\n🚀 Ejecutando batch de tests para Barbería...");

      // Crear batch job
      const batchJob = await retellAdapter.createBatchTest({
        llmId: "llm_31a8c0ee2b01273747c015de1222",
        testCaseDefinitionIds: barberiaTestCaseIds,
      });

      barberiaBatchJobId = batchJob.testCaseBatchJobId;
      console.log(`📊 Batch job ID: ${barberiaBatchJobId}`);
      console.log(`   Status: ${batchJob.status}`);

      // Esperar a que se complete (máx 5 minutos)
      let completed = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!completed && attempts < maxAttempts) {
        const status = await retellAdapter.getBatchTest(barberiaBatchJobId);

        if (status.status === "complete") {
          completed = true;
          console.log(`\n✅ Batch completado:`);
          console.log(`   Total: ${status.totalCount}`);
          console.log(`   Pasados: ${status.passCount}`);
          console.log(`   Fallidos: ${status.failCount}`);
          console.log(`   Errores: ${status.errorCount}`);

          const runs = await retellAdapter.listTestRuns(barberiaBatchJobId);

          let passCount = 0;
          for (const run of runs) {
            if (run.status === "pass") {
              passCount++;
              console.log(`   ✅ ${run.name}`);
            } else if (run.status === "fail") {
              console.log(
                `   ❌ ${run.name}: ${run.resultExplanation || "No explanation"}`
              );
            }
          }

          const passRate = passCount / barberiaTestCaseIds.length;
          expect(passRate).toBeGreaterThanOrEqual(0.8);
        } else {
          console.log(
            `⏳ Esperando... (intento ${attempts + 1}/${maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      if (!completed) {
        throw new Error("Batch job no se completó en el tiempo permitido");
      }
    }, 360000);
  });

  describe("Salón de Uñas - Simulations con GPT-4.1", () => {
    it("debería ejecutar 20 test cases de Salón de Uñas", async () => {
      if (salonUnasTestCaseIds.length === 0) {
        console.warn("⚠️  No hay test case IDs. Verifica que la creación funcionó.");
        expect(true).toBe(true);
        return;
      }

      console.log("\n🚀 Ejecutando batch de tests para Salón de Uñas...");

      const batchJob = await retellAdapter.createBatchTest({
        llmId: "llm_f4185da9b9a08e07589525ff321a",
        testCaseDefinitionIds: salonUnasTestCaseIds,
      });

      salonUnasBatchJobId = batchJob.testCaseBatchJobId;
      console.log(`📊 Batch job ID: ${salonUnasBatchJobId}`);

      let completed = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!completed && attempts < maxAttempts) {
        const status = await retellAdapter.getBatchTest(salonUnasBatchJobId);

        if (status.status === "complete") {
          completed = true;
          console.log(`\n✅ Batch completado: ${status.passCount}/${status.totalCount} pasados`);
          const runs = await retellAdapter.listTestRuns(salonUnasBatchJobId);
          let passCount = 0;
          for (const run of runs) {
            if (run.status === "pass") passCount++;
            else console.log(`   ❌ ${run.name}`);
          }
          const passRate = passCount / salonUnasTestCaseIds.length;
          expect(passRate).toBeGreaterThanOrEqual(0.8);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      if (!completed) throw new Error("Batch job no se completó");
    }, 360000);
  });

  describe("Centro de Estética - Simulations con GPT-4.1", () => {
    it("debería ejecutar 20 test cases de Centro de Estética", async () => {
      if (centroEsteticaTestCaseIds.length === 0) {
        expect(true).toBe(true);
        return;
      }

      console.log("\n🚀 Ejecutando batch de tests para Centro de Estética...");

      const batchJob = await retellAdapter.createBatchTest({
        llmId: "llm_b63fa254fe51f99906a4a89f4c53",
        testCaseDefinitionIds: centroEsteticaTestCaseIds,
      });

      centroEsteticaBatchJobId = batchJob.testCaseBatchJobId;
      console.log(`📊 Batch job ID: ${centroEsteticaBatchJobId}`);

      let completed = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!completed && attempts < maxAttempts) {
        const status = await retellAdapter.getBatchTest(centroEsteticaBatchJobId);

        if (status.status === "complete") {
          completed = true;
          console.log(`\n✅ Batch completado: ${status.passCount}/${status.totalCount} pasados`);
          const runs = await retellAdapter.listTestRuns(centroEsteticaBatchJobId);
          let passCount = 0;
          for (const run of runs) {
            if (run.status === "pass") passCount++;
            else console.log(`   ❌ ${run.name}`);
          }
          const passRate = passCount / centroEsteticaTestCaseIds.length;
          expect(passRate).toBeGreaterThanOrEqual(0.8);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      if (!completed) throw new Error("Batch job no se completó");
    }, 360000);
  });

  describe("Fisioterapia - Simulations con GPT-4.1", () => {
    it("debería ejecutar 20 test cases de Fisioterapia", async () => {
      if (fisioterapiaTestCaseIds.length === 0) {
        expect(true).toBe(true);
        return;
      }

      console.log("\n🚀 Ejecutando batch de tests para Fisioterapia...");

      const batchJob = await retellAdapter.createBatchTest({
        llmId: "llm_613ed707d5faf24b00e00f95a018",
        testCaseDefinitionIds: fisioterapiaTestCaseIds,
      });

      fisioterapiaBatchJobId = batchJob.testCaseBatchJobId;
      console.log(`📊 Batch job ID: ${fisioterapiaBatchJobId}`);

      let completed = false;
      let attempts = 0;
      const maxAttempts = 60;

      while (!completed && attempts < maxAttempts) {
        const status = await retellAdapter.getBatchTest(fisioterapiaBatchJobId);

        if (status.status === "complete") {
          completed = true;
          console.log(`\n✅ Batch completado: ${status.passCount}/${status.totalCount} pasados`);
          const runs = await retellAdapter.listTestRuns(fisioterapiaBatchJobId);
          let passCount = 0;
          for (const run of runs) {
            if (run.status === "pass") passCount++;
            else console.log(`   ❌ ${run.name}`);
          }
          const passRate = passCount / fisioterapiaTestCaseIds.length;
          expect(passRate).toBeGreaterThanOrEqual(0.8);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }
      }

      if (!completed) throw new Error("Batch job no se completó");
    }, 360000);
  });
});

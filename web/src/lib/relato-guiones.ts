import type { NicheSlug } from "@/lib/niche-landings";

/**
 * El guion del relato «En tu bolsillo» → «En tu negocio» (la llamada en el
 * iPhone, la pantalla de bloqueo del relevo y el panel en el portátil), uno
 * por landing: la portada general y cada sector. Lo que cambia de un negocio
 * a otro (nombres, servicios, duraciones, precios, cómo se llama a quien
 * reserva) vive aquí; las frases que se repiten se arman en `relato` a partir
 * de estos datos, para que los seis guiones cuenten exactamente la misma
 * historia con su vocabulario.
 *
 * Los profesionales de cada sector son los mismos que salen en el resto de
 * su landing (reparto por especialidad y el Gestor), para que no cambien de
 * nombre de una sección a otra. Los números de teléfono empiezan por 79: un
 * rango sin atribuir en el Plan Nacional de Numeración, no son de nadie.
 */

export type Servicio = { nombre: string; minutos: number };

export type GuionRelato = {
  /** El negocio de la historia: lo dice el saludo y sale en el panel. */
  negocio: string;
  /** Cómo se nombra a quien reserva, ya con su artículo. */
  palabras: {
    /** «tu clienta», «tu cliente», «tu paciente» */
    tuCliente: string;
    /** «Tus clientes», «Tus pacientes» (en mayúscula: abre frase) */
    tusClientes: string;
    /** «el cliente», «el paciente» */
    elCliente: string;
    /** «Al cliente», «Al paciente» (en mayúscula: abre frase) */
    alCliente: string;
    /** Lo que hacías tú mientras llamaban: «estabas con una clienta». */
    mientras: string;
  };
  /** Quien llama. */
  cliente: { nombre: string; apellido: string; telefono: string };
  /** Con quién reserva, y quien la sustituye cuando falta (el Gestor). */
  profesional: string;
  companera: string;
  servicio: Servicio & { precio: number };
  /** Lo que pide al llamar, tal cual lo diría. */
  pide: string;
  /** Otros clientes y servicios del día, para la agenda y el panel. */
  otrosClientes: [string, string, string, string];
  otrosServicios: [Servicio, Servicio, Servicio, Servicio];
  /** Las cifras de la semana en el panel. */
  semana: {
    citas: number;
    masQueAntes: number;
    llamadas: number;
    ingresos: number;
  };
};

export const GUION_GENERAL: GuionRelato = {
  negocio: "Peluquería Nuria",
  palabras: {
    tuCliente: "tu clienta",
    tusClientes: "Tus clientes",
    elCliente: "el cliente",
    alCliente: "Al cliente",
    mientras: "estabas con una clienta",
  },
  cliente: { nombre: "Laura", apellido: "G.", telefono: "+34 791 32 55 57" },
  profesional: "Marta",
  companera: "Lucía",
  servicio: { nombre: "Corte y color", minutos: 90, precio: 58 },
  pide: "¿Tenéis hueco mañana para corte y color?",
  otrosClientes: ["Carmen R.", "Sergio P.", "Rosa M.", "Elena S."],
  otrosServicios: [
    { nombre: "Mechas", minutos: 120 },
    { nombre: "Corte caballero", minutos: 30 },
    { nombre: "Alisado", minutos: 90 },
    { nombre: "Peinado", minutos: 45 },
  ],
  semana: { citas: 23, masQueAntes: 6, llamadas: 41, ingresos: 1186 },
};

export const GUIONES_SECTOR: Record<NicheSlug, GuionRelato> = {
  peluqueria: {
    ...GUION_GENERAL,
    cliente: { nombre: "Carmen", apellido: "R.", telefono: "+34 791 32 55 57" },
    profesional: "Marta",
    companera: "Laura",
    otrosClientes: ["Ana T.", "Sergio P.", "Rosa M.", "Elena S."],
  },
  barberia: {
    negocio: "Barbería Santos",
    palabras: {
      tuCliente: "tu cliente",
      tusClientes: "Tus clientes",
      elCliente: "el cliente",
      alCliente: "Al cliente",
      mientras: "estabas con la navaja",
    },
    cliente: { nombre: "Javier", apellido: "M.", telefono: "+34 792 18 40 63" },
    profesional: "Luis",
    companera: "Dani",
    servicio: { nombre: "Corte y barba", minutos: 45, precio: 24 },
    pide: "¿Tenéis hueco mañana para corte y barba?",
    otrosClientes: ["Álex R.", "Marcos P.", "Hugo L.", "Iván S."],
    otrosServicios: [
      { nombre: "Corte degradado", minutos: 30 },
      { nombre: "Afeitado a navaja", minutos: 30 },
      { nombre: "Arreglo de barba", minutos: 20 },
      { nombre: "Corte infantil", minutos: 20 },
    ],
    semana: { citas: 58, masQueAntes: 9, llamadas: 74, ingresos: 1102 },
  },
  "salon-de-unas": {
    negocio: "Estudio de uñas Vega",
    palabras: {
      tuCliente: "tu clienta",
      tusClientes: "Tus clientas",
      elCliente: "la clienta",
      alCliente: "A la clienta",
      mientras: "estabas limando",
    },
    cliente: { nombre: "Paula", apellido: "D.", telefono: "+34 793 66 21 08" },
    profesional: "Laura",
    companera: "Noa",
    servicio: { nombre: "Manicura semipermanente", minutos: 60, precio: 25 },
    pide: "¿Tenéis hueco mañana para una semipermanente en manos?",
    otrosClientes: ["Irene C.", "Marta B.", "Sofía L.", "Nerea V."],
    otrosServicios: [
      { nombre: "Uñas de gel", minutos: 90 },
      { nombre: "Pedicura spa", minutos: 60 },
      { nombre: "Retirada y semi", minutos: 75 },
      { nombre: "Nail art", minutos: 45 },
    ],
    semana: { citas: 41, masQueAntes: 7, llamadas: 52, ingresos: 1148 },
  },
  "centro-de-estetica": {
    negocio: "Centro de estética Alba",
    palabras: {
      tuCliente: "tu clienta",
      tusClientes: "Tus clientes",
      elCliente: "el cliente",
      alCliente: "Al cliente",
      mientras: "estabas en cabina",
    },
    cliente: {
      nombre: "Cristina",
      apellido: "P.",
      telefono: "+34 794 27 93 51",
    },
    profesional: "Sara",
    companera: "Elena",
    servicio: { nombre: "Facial con peeling", minutos: 75, precio: 65 },
    pide: "¿Tenéis hueco mañana para un facial con peeling?",
    otrosClientes: ["Beatriz N.", "Lorena G.", "Marina F.", "Silvia R."],
    otrosServicios: [
      { nombre: "Presoterapia", minutos: 45 },
      { nombre: "Depilación láser", minutos: 30 },
      { nombre: "Masaje relajante", minutos: 60 },
      { nombre: "Higiene facial", minutos: 60 },
    ],
    semana: { citas: 27, masQueAntes: 5, llamadas: 46, ingresos: 1593 },
  },
  fisioterapia: {
    negocio: "Fisioterapia Rivas",
    palabras: {
      tuCliente: "tu paciente",
      tusClientes: "Tus pacientes",
      elCliente: "el paciente",
      alCliente: "Al paciente",
      mientras: "estabas en sesión",
    },
    cliente: { nombre: "Andrés", apellido: "L.", telefono: "+34 795 40 12 86" },
    profesional: "Pablo",
    companera: "Irene",
    servicio: { nombre: "Primera consulta", minutos: 60, precio: 50 },
    pide: "¿Tenéis hueco mañana para una primera consulta? Me duele la espalda.",
    otrosClientes: ["Teresa M.", "Jorge A.", "Nuria S.", "Óscar B."],
    otrosServicios: [
      { nombre: "Sesión de seguimiento", minutos: 45 },
      { nombre: "Punción seca", minutos: 30 },
      { nombre: "Masaje deportivo", minutos: 60 },
      { nombre: "Rehabilitación de rodilla", minutos: 45 },
    ],
    semana: { citas: 34, masQueAntes: 4, llamadas: 39, ingresos: 1530 },
  },
};

/** El guion de una landing: el de su sector, o el general en la portada. */
export function guionDe(sector?: NicheSlug): GuionRelato {
  return sector ? GUIONES_SECTOR[sector] : GUION_GENERAL;
}

/** «17:30» + 90 min → «19:00». */
export function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Minúscula inicial, para meter un servicio a media frase. */
export const enFrase = (texto: string) =>
  texto.charAt(0).toLowerCase() + texto.slice(1);

/** La hora de la cita que se reserva en la historia (siempre la misma). */
export const HORA_CITA = "17:30";

/**
 * Las frases del relato armadas desde el guion: lo que se dice en la
 * llamada, la agenda que se revisa, el WhatsApp, las notificaciones de la
 * pantalla de bloqueo y el panel. Todo lo que no depende del sector está
 * escrito aquí una sola vez.
 */
export function relato(g: GuionRelato) {
  const { cliente, profesional, companera, servicio } = g;
  const finCita = sumarMinutos(HORA_CITA, servicio.minutos);
  const nombre = (completo: string) => completo.split(" ")[0];
  const [s0, s1, s2, s3] = g.otrosServicios;
  const [c0, c1, c2, c3] = g.otrosClientes;
  return {
    saludo: `Hola, gracias por llamar a ${g.negocio}. ¿En qué te ayudo?`,
    pide: g.pide,
    ofrece: `Claro, son unos ${servicio.minutos} minutos. ¿A qué hora te viene mejor?`,
    franja: "Por la tarde, si puede ser.",
    espera: "Un momento, que te lo miro.",
    propone: `Tengo a las ${HORA_CITA} con ${profesional}. ¿Te la reservo?`,
    acepta: "Perfecto, sí.",
    /** La agenda de mañana que repasa el buscador: la cuarta fila es la buena. */
    agenda: [
      {
        hora: "15:00",
        titulo: "Ocupado",
        detalle: `${s0.nombre} · ${nombre(c0)}`,
      },
      {
        hora: "16:00",
        titulo: "Ocupado",
        detalle: `${s1.nombre} · ${nombre(c1)}`,
      },
      {
        hora: "17:00",
        titulo: "Hueco corto",
        detalle: "30 min libres: no cabe",
      },
      {
        hora: HORA_CITA,
        titulo: "Libre",
        detalle: `${servicio.minutos} min · con ${profesional}`,
      },
      {
        hora: "19:00",
        titulo: "Ocupado",
        detalle: `${s3.nombre} · ${nombre(c3)}`,
      },
      { hora: "20:00", titulo: "Cerrado", detalle: "Fin de la jornada" },
    ],
    cita: `Jueves a las ${HORA_CITA} con ${profesional}`,
    finCita,
    /** Las tres notificaciones de la pantalla de bloqueo del relevo. */
    avisos: [
      {
        titulo: "Llamada atendida",
        texto: `${cliente.nombre} llamó mientras ${g.palabras.mientras}. 2 min 14 s, grabada y transcrita.`,
        hace: "hace 2 min",
      },
      {
        titulo: "Nueva cita",
        texto: `${servicio.nombre} · jueves ${HORA_CITA} con ${profesional}`,
        hace: "hace 1 min",
      },
      {
        titulo: "WhatsApp enviado",
        texto: `${cliente.nombre} ya tiene su confirmación. Contestó «¡Genial, gracias!».`,
        hace: "ahora",
      },
    ],
    /** Panel: próximas citas (la nueva, la última). */
    proximas: [
      {
        dia: "Hoy",
        hora: "17:30",
        servicio: s0.nombre,
        quien: `${c0} · con ${companera}`,
        minutos: s0.minutos,
      },
      {
        dia: "Hoy",
        hora: "18:15",
        servicio: s1.nombre,
        quien: `${c1} · con ${profesional}`,
        minutos: s1.minutos,
      },
      {
        dia: "Jue",
        hora: "10:00",
        servicio: s2.nombre,
        quien: `${c2} · con ${profesional}`,
        minutos: s2.minutos,
      },
    ],
    /** Panel: llamadas de antes de la de hoy (la de hoy va la primera). */
    llamadas: [
      {
        quien: "+34 797 80 30 74",
        cuando: "Hoy, 13:41 · 1m 02s",
        chip: "Consulta de precios",
        ok: false,
      },
      {
        quien: c0,
        cuando: "Hoy, 11:20 · 1m 48s",
        chip: "Cita movida",
        ok: true,
      },
      {
        quien: "+34 795 08 98 37",
        cuando: "Mar, 21:12 · 1m 31s",
        chip: "Cita reservada",
        ok: true,
      },
      {
        quien: c1,
        cuando: "Mar, 19:27 · 0m 58s",
        chip: "Cita reservada",
        ok: true,
      },
      {
        quien: "+34 796 21 88 17",
        cuando: "Mar, 14:39 · 0m 35s",
        chip: "Horario",
        ok: false,
      },
      {
        quien: c2,
        cuando: "Lun, 10:05 · 1m 12s",
        chip: "Cita reservada",
        ok: true,
      },
    ],
    resumen: `${cliente.nombre} quería ${enFrase(servicio.nombre)} para mañana por la tarde. Alhabla descartó las 17:00 porque no cabían los ${servicio.minutos} minutos y le ofreció las ${HORA_CITA} con ${profesional}. Aceptó.`,
    /** Panel: la conversación con el asistente (una baja y sus citas). */
    asistente: {
      pregunta: "¿Cómo tenemos mañana?",
      respuesta: `Mañana, jueves, hay 9 citas. Te quedan dos huecos: de 12:00 a 13:00 con ${companera} y de 19:00 a 20:00 con ${profesional}.`,
      baja: `${profesional} no viene mañana, está con fiebre.`,
      analisis: `${profesional} tenía 3 citas. ${companera} puede quedarse dos a la misma hora; la de las ${HORA_CITA} no cabe.`,
      tabla: [
        { hora: "10:00", cita: `${s2.nombre} · ${c2}`, libre: true },
        { hora: "12:30", cita: `${s3.nombre} · ${c3}`, libre: true },
        {
          hora: HORA_CITA,
          cita: `${servicio.nombre} · ${cliente.nombre} ${cliente.apellido}`,
          libre: false,
        },
      ],
      orden: `Pásale esas dos a ${companera} y a ${cliente.nombre} ofrécele el viernes a la misma hora.`,
      hecho: [
        `${profesional} ausente el jueves`,
        `2 citas pasadas a ${companera}`,
        `WhatsApp enviado a ${cliente.nombre}`,
      ],
      cierre: `Hecho. Te aviso cuando ${cliente.nombre} conteste.`,
    },
  };
}

export type Relato = ReturnType<typeof relato>;

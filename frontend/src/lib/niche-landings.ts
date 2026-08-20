import type { Metadata } from "next";
import { absoluteUrl, siteName } from "@/lib/seo";

export type NicheSlug = "peluqueria" | "centro-de-estetica" | "salon-de-unas" | "barberia" | "fisioterapia";

type Benefit = { title: string; description: string; result: string };
type Faq = { question: string; answer: string };

export type NicheAccent = {
  /** Color principal del nicho (texto, iconos, bordes) */
  strong: string;
  /** Fondo suave tintado para secciones y chips */
  soft: string;
  /** Variante oscura para degradados y tarjetas destacadas */
  deep: string;
};

export type SectorStat = { value: string; label: string; source?: string };
export type SectorQuote = { text: string; source?: string };
export type SectorData = {
  eyebrow: string;
  title: string;
  description: string;
  stats: SectorStat[];
  quotes?: SectorQuote[];
  painPoint?: string;
};

export type NicheLandingContent = {
  slug: NicheSlug;
  name: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryKeyword: string;
  keywords: string[];
  accent: NicheAccent;
  heroTitle: string;
  heroDescription: string;
  demoTitle: string;
  demoSteps: [string, string, string];
  conversations?: import("@/components/hero-conversation").Conversation[];
  sectionTitle: string;
  sectionDescription: string;
  highlights: [Benefit, Benefit, Benefit];
  benefitsTitle: string;
  benefitsDescription: string;
  benefits: [Benefit, Benefit, Benefit];
  calendarIntegration: {
    title: string;
    description: string;
    examples: [string, string, string];
  };
  calculator: {
    badge: string;
    title: string;
    description: string;
    ticketLabel: string;
    appointmentsLabel: string;
    initialTicket: number;
  };
  faqs: Faq[];
  closingTitle: string;
  sectorData?: SectorData;
};

export const nicheLandings: Record<NicheSlug, NicheLandingContent> = {
  peluqueria: {
    slug: "peluqueria",
    name: "Peluquerías",
    eyebrow: "Recepción inteligente para peluquerías",
    title: "Asistente telefónico para peluquerías 24/7",
    description: "Asistente telefónico con IA para peluquerías: responde llamadas y reserva cortes, color y tratamientos en tu agenda, incluso fuera de horario.",
    primaryKeyword: "asistente telefónico para peluquerías",
    keywords: [
      "asistente telefónico para peluquerías",
      "recepcionista virtual para peluquerías",
      "recepcionista con IA para peluquerías",
      "reservas telefónicas para peluquerías",
      "automatizar citas de peluquería",
      "agenda para peluquerías con IA",
      "atender llamadas en peluquería",
      "asistente de voz para peluquerías",
      "software de reservas para peluquerías",
      "gestión de citas para peluquerías",
    ],
    accent: { strong: "#b23a68", soft: "#fbe9f1", deep: "#7c2547" },
    heroTitle: "No pierdas otra cita de peluquería por no contestar el teléfono",
    heroDescription: "BotBook atiende llamadas, resuelve dudas sobre cortes y color, y agenda citas 24/7 — incluso cuando todo el equipo está con clientes.",
    demoTitle: "Así reserva un servicio de peluquería",
    demoSteps: ["Configura cortes, color, mechas y tratamientos.", "Conecta horarios, profesionales y calendario.", "Atiende llamadas incluso durante las horas punta."],
    conversations: [
      {
        caller: "Cliente · móvil",
        context: "Reserva de corte y color",
        messages: [
          { sender: "client", text: "¿Tenéis hueco para corte y color mañana?", delay: 0.35 },
          { sender: "agent", text: "Sí, disponible 16:30 o 18:00. Son 90 minutos.", delay: 2.1 },
          { sender: "client", text: "16:30 me va bien, gracias.", delay: 3.7 },
        ],
        result: "Cita confirmada",
        resultDetail: "Mañana · 16:30 · Corte + color",
        duration: 6600,
      },
      {
        caller: "Cliente habitual",
        context: "Cambio de cita",
        messages: [
          { sender: "client", text: "¿Puedo mover mi mechas del jueves?", delay: 0.35 },
          { sender: "agent", text: "Claro, viernes 11:00 está libre.", delay: 2.1 },
          { sender: "client", text: "Perfecto, pásala al viernes.", delay: 3.7 },
        ],
        result: "Cambio realizado",
        resultDetail: "Viernes · 11:00 · Mechas",
        duration: 6600,
      },
      {
        caller: "Cliente · móvil",
        context: "Consulta de tratamiento",
        messages: [
          { sender: "client", text: "¿Cuánto dura el alisado orgánico?", delay: 0.35 },
          { sender: "agent", text: "Dura 2 h 30 min. Puedo ofrecerte el sábado 10:00.", delay: 2.1 },
          { sender: "client", text: "Vale, resérvalo.", delay: 3.7 },
        ],
        result: "Consulta resuelta",
        resultDetail: "Sábado · 10:00 · Alisado orgánico",
        duration: 6600,
      },
    ],
    sectionTitle: "Atiende cada llamada. Sin dejar a un cliente a medias.",
    sectionDescription: "El teléfono deja de competir con el trabajo en cabina y se convierte en un canal de reservas siempre disponible.",
    highlights: [
      { title: "Horas punta cubiertas", description: "Atiende llamadas cuando todo el equipo está con clientes.", result: "Menos llamadas perdidas" },
      { title: "Duraciones correctas", description: "Reserva cada corte, color o tratamiento con el tiempo que necesita.", result: "Una agenda mejor organizada" },
      { title: "Agenda conectada", description: "Consulta huecos reales antes de confirmar una cita.", result: "Menos solapes y esperas" },
    ],
    benefitsTitle: "Una recepción que conoce el ritmo de tu peluquería.",
    benefitsDescription: "Responde consultas frecuentes y organiza citas sin obligarte a dejar a un cliente a medias.",
    benefits: [
      { title: "Corte y peinado", description: "Explica disponibilidad y duración antes de reservar.", result: "Citas ajustadas al servicio" },
      { title: "Color y mechas", description: "Recoge la necesidad del cliente y deriva valoraciones complejas.", result: "Más contexto antes de atender" },
      { title: "Tratamientos", description: "Informa sobre opciones, precios y preparación previa.", result: "Consultas resueltas al instante" },
    ],
    calendarIntegration: {
      title: "Sigue usando los canales que ya te traen reservas.",
      description: "BotBook consulta Google Calendar antes de confirmar una cita. Si tus reservas de web, WhatsApp, Instagram o software ya llegan ahí, el agente respeta esos huecos ocupados.",
      examples: ["Las reservas online bloquean el hueco automáticamente", "Sólo ofrece horarios realmente libres", "Las llamadas se añaden a la misma agenda"],
    },
    calculator: { badge: "Calcula las citas que se escapan", title: "¿Cuánto pierde tu peluquería por no contestar?", description: "Estima el valor de cortes, coloraciones y tratamientos que pueden terminar en otro salón.", ticketLabel: "Ticket medio por cita", appointmentsLabel: "Citas perdidas cada semana", initialTicket: 45 },
    faqs: [
      { question: "¿Puede distinguir entre un corte y un servicio de color?", answer: "Sí. Configuras cada servicio con su duración, precio orientativo y profesionales compatibles para reservar el hueco adecuado." },
      { question: "¿Qué ocurre si una coloración necesita valoración previa?", answer: "El asistente recoge la información y deja la consulta preparada para que tu equipo confirme el servicio antes de reservarlo." },
      { question: "¿Atiende cuando todos estamos trabajando?", answer: "Sí. Está disponible durante horas punta, fuera de horario y en festivos para que una llamada no interrumpa el servicio." },
      { question: "¿Puede cambiar o cancelar una cita?", answer: "Sí. Consulta la agenda y gestiona cambios o cancelaciones según las reglas que definas." },
      { question: "¿Tengo que cambiar mi software de reservas actual?", answer: "No necesariamente. BotBook consulta Google Calendar antes de reservar. Si tu web, WhatsApp o software sincroniza las citas ahí, el agente respeta esos huecos ocupados." },
    ],
    closingTitle: "Empieza a no perder citas de peluquería esta semana.",
    sectorData: {
      eyebrow: "El sector más competido de Europa",
      title: "1 peluquería cada 900 habitantes y cada llamada cuenta",
      description: "España lidera Europa en densidad de peluquerías. Con 500.000 clientes perdidos desde la pandemia y más de la mitad del sector sin digitalizar, cada llamada atendida es una ventaja competitiva.",
      stats: [
        { value: "1/900", label: "habitantes: la mayor concentración de peluquerías de Europa", source: "El Confidencial Digital" },
        { value: "78%", label: "de los clientes contrata al primer negocio que responde", source: "minute-call.com" },
        { value: "+50%", label: "de las peluquerías en España aún no están digitalizadas", source: "Estética Magazine" },
      ],
      quotes: [
        { text: "Las peluquerías y centros de estética en España pierden una media de 3 llamadas al día", source: "David Aranda, Estetical — Crónica Global" },
      ],
    },
  },
  "centro-de-estetica": {
    slug: "centro-de-estetica",
    name: "Centros de estética",
    eyebrow: "Recepción inteligente para centros de estética",
    title: "Asistente telefónico para centros de estética",
    description: "Recepcionista virtual con IA para centros de estética: atiende consultas, organiza tratamientos, profesionales y cabinas, y reserva citas 24/7.",
    primaryKeyword: "asistente telefónico para centros de estética",
    keywords: [
      "asistente telefónico para centros de estética",
      "recepcionista virtual para centros de estética",
      "recepcionista con IA para estética",
      "reservas para centros de estética",
      "automatizar llamadas de centro de estética",
      "agenda para centros de estética",
      "asistente de voz para clínicas estéticas",
      "gestión de citas de estética",
      "reservas de tratamientos estéticos",
      "atención telefónica para estética",
    ],
    accent: { strong: "#6c4bd8", soft: "#eee9fb", deep: "#46308f" },
    heroTitle: "No pierdas otra consulta de estética por no contestar el teléfono",
    heroDescription: "BotBook atiende llamadas, informa sobre tratamientos y agenda citas 24/7 — incluso mientras estás en cabina.",
    demoTitle: "Así gestiona una consulta estética",
    demoSteps: ["Carga tratamientos, bonos y preguntas frecuentes.", "Define qué consultas requieren valoración humana.", "Conecta cabinas, profesionales y disponibilidad."],
    conversations: [
      {
        caller: "Cliente · móvil",
        context: "Reserva de tratamiento facial",
        messages: [
          { sender: "client", text: "Quiero un facial hidratante esta semana", delay: 0.35 },
          { sender: "agent", text: "Tengo hueco miércoles 18:30 o jueves 12:00. Dura 60 minutos.", delay: 2.1 },
          { sender: "client", text: "Miércoles 18:30, por favor.", delay: 3.7 },
        ],
        result: "Cita confirmada",
        resultDetail: "Miércoles · 18:30 · Facial hidratante",
        duration: 6600,
      },
      {
        caller: "Cliente",
        context: "Consulta sobre contraindicaciones",
        messages: [
          { sender: "client", text: "¿El peeling químico necesita valoración previa?", delay: 0.35 },
          { sender: "agent", text: "Sí, derivaré tu caso a un profesional para confirmarlo antes de reservar.", delay: 2.1 },
          { sender: "client", text: "De acuerdo, espero su confirmación.", delay: 3.7 },
        ],
        result: "Derivado al equipo",
        resultDetail: "Valoración previa pendiente",
        duration: 6600,
      },
      {
        caller: "Cliente habitual",
        context: "Bonos y seguimiento",
        messages: [
          { sender: "client", text: "Me queda 1 sesión de bono corporal, ¿puedo agendar?", delay: 0.35 },
          { sender: "agent", text: "Sí, viernes 10:00 o 12:30 con tu especialista.", delay: 2.1 },
          { sender: "client", text: "10:00 está bien.", delay: 3.7 },
        ],
        result: "Seguimiento agendado",
        resultDetail: "Viernes · 10:00 · Sesión bono corporal",
        duration: 6600,
      },
    ],
    sectionTitle: "Atiende cada consulta. Sin interrumpir el tratamiento.",
    sectionDescription: "Responde con consistencia, filtra consultas y reserva sólo cuando se cumplen las reglas del tratamiento.",
    highlights: [
      { title: "Consultas informadas", description: "Explica tratamientos, duración y preparación con información aprobada.", result: "Más confianza antes de la visita" },
      { title: "Valoración segura", description: "Detecta cuándo una consulta debe pasar a un profesional.", result: "Sin promesas clínicas indebidas" },
      { title: "Cabinas coordinadas", description: "Reserva según recursos y disponibilidad real.", result: "Mayor ocupación sin solapes" },
    ],
    benefitsTitle: "Más tiempo para tratar. Menos tiempo filtrando llamadas.",
    benefitsDescription: "La IA atiende lo repetitivo y deja al equipo las consultas que realmente necesitan criterio profesional.",
    benefits: [
      { title: "Faciales", description: "Informa sobre duración, preparación y disponibilidad.", result: "Clientes mejor preparados" },
      { title: "Corporales", description: "Recoge objetivos y deriva dudas sensibles al equipo.", result: "Mejor cualificación de consultas" },
      { title: "Bonos y seguimiento", description: "Responde dudas habituales y organiza próximas sesiones.", result: "Más continuidad del tratamiento" },
    ],
    calendarIntegration: {
      title: "Una sola disponibilidad para todos tus canales.",
      description: "BotBook usa Google Calendar como referencia antes de reservar. Así respeta las citas que entren desde tu web, WhatsApp o herramienta de reservas sincronizada.",
      examples: ["Las citas existentes protegen tus cabinas", "Evita dobles reservas entre canales", "Centraliza nuevas llamadas en la misma agenda"],
    },
    calculator: { badge: "Calcula oportunidades sin atender", title: "¿Cuánto valen las consultas que no puedes responder?", description: "Estima tratamientos y valoraciones que podrías recuperar con recepción continua.", ticketLabel: "Ticket medio por tratamiento", appointmentsLabel: "Consultas perdidas cada semana", initialTicket: 80 },
    faqs: [
      { question: "¿Puede recomendar un tratamiento?", answer: "Puede explicar información aprobada y recoger necesidades, pero deriva al equipo cualquier recomendación que requiera valoración profesional." },
      { question: "¿Gestiona bonos y sesiones recurrentes?", answer: "Puede informar sobre condiciones y organizar sesiones según las reglas y disponibilidad configuradas." },
      { question: "¿Puede reservar por cabina o profesional?", answer: "Sí. La configuración permite respetar profesionales compatibles, capacidad y tiempos de cada tratamiento." },
      { question: "¿Cómo evita respuestas incorrectas?", answer: "Trabaja con la información, límites y documentos que apruebes, y deriva las consultas fuera de alcance." },
      { question: "¿Tengo que abandonar mi sistema de reservas?", answer: "No. Si tu sistema sincroniza las citas con Google Calendar, BotBook las respeta antes de ofrecer disponibilidad por teléfono." },
    ],
    closingTitle: "Empieza a no perder consultas de estética esta semana.",
    sectorData: {
      eyebrow: "Datos que duelen",
      title: "El 37% de las llamadas a centros de estética se pierden",
      description: "Mientras estás en cabina, el teléfono sigue sonando. Y cada llamada perdida no es solo una cita menos: es un cliente que llama a tu competencia.",
      stats: [
        { value: "37%", label: "de las llamadas a salones y centros de estética se pierden", source: "Zenoti" },
        { value: "57%", label: "de los clientes reserva por teléfono — el canal más importante", source: "Zenoti" },
        { value: "97%", label: "de quienes no contactan cuelga y llama a otro negocio", source: "Recepcionista.com" },
      ],
      quotes: [
        { text: "Cruzando dedos, así es como muchas profesionales entran en cabina para atender a sus clientes. Deseando que no suene el teléfono", source: "Estetical — Facebook" },
      ],
      painPoint: "Cuando estás con un cliente en cabina, no puedes atender el teléfono. Los picos de llamadas (10:00–13:00 y sábados) coinciden exactamente con las horas de máxima ocupación.",
    },
  },
  "salon-de-unas": {
    slug: "salon-de-unas",
    name: "Salones de uñas",
    eyebrow: "Recepción inteligente para salones de uñas",
    title: "Asistente telefónico para salones de uñas 24/7",
    description: "Asistente telefónico para salones de uñas: responde precios y reserva manicuras, pedicuras, retiradas y nail art en tu agenda las 24 horas.",
    primaryKeyword: "asistente telefónico para salones de uñas",
    keywords: [
      "asistente telefónico para salones de uñas",
      "recepcionista virtual para salón de uñas",
      "recepcionista con IA para manicura",
      "reservas para salón de uñas",
      "automatizar citas de manicura",
      "agenda para salón de uñas",
      "asistente de voz para nail salon",
      "gestión de citas de manicura",
      "reservas de manicura y pedicura",
      "atender llamadas en salón de uñas",
    ],
    accent: { strong: "#c95c3f", soft: "#fbeae2", deep: "#8e3a24" },
    heroTitle: "No pierdas otra manicura por no contestar el teléfono",
    heroDescription: "BotBook atiende llamadas, responde precios y agenda citas 24/7 — incluso mientras trabajas en una uña.",
    demoTitle: "Así reserva una cita de uñas",
    demoSteps: ["Configura técnicas, retiradas y extras de nail art.", "Asigna duración y profesionales compatibles.", "Recupera citas recurrentes incluso fuera de horario."],
    conversations: [
      {
        caller: "Clienta · móvil",
        context: "Reserva de manicura",
        messages: [
          { sender: "client", text: "¿Tenéis manicura semipermanente mañana?", delay: 0.35 },
          { sender: "agent", text: "Sí, 17:00 o 18:30. Incluye retirada si la necesitas.", delay: 2.1 },
          { sender: "client", text: "17:00 perfecto, con retirada.", delay: 3.7 },
        ],
        result: "Cita confirmada",
        resultDetail: "Mañana · 17:00 · Semipermanente + retirada",
        duration: 6600,
      },
      {
        caller: "Clienta",
        context: "Nail art",
        messages: [
          { sender: "client", text: "Quiero nail art sencillo para el viernes", delay: 0.35 },
          { sender: "agent", text: "Viernes 12:00 disponible. Añadiré 15 minutos para el diseño.", delay: 2.1 },
          { sender: "client", text: "Reserva, gracias", delay: 3.7 },
        ],
        result: "Cita ajustada",
        resultDetail: "Viernes · 12:00 · Nail art simple",
        duration: 6600,
      },
      {
        caller: "Clienta habitual",
        context: "Próxima visita",
        messages: [
          { sender: "client", text: "Quiero agendar mi próxima pedicura en 3 semanas", delay: 0.35 },
          { sender: "agent", text: "Te propongo martes 10:00 o miércoles 17:30.", delay: 2.1 },
          { sender: "client", text: "Miércoles 17:30 está bien.", delay: 3.7 },
        ],
        result: "Recurrencia asegurada",
        resultDetail: "Miércoles · 17:30 · Pedicura",
        duration: 6600,
      },
    ],
    sectionTitle: "Atiende cada llamada. Sin parar el pincel.",
    sectionDescription: "Atiende consultas rápidas y reserva servicios recurrentes mientras el equipo sigue trabajando.",
    highlights: [
      { title: "Servicio exacto", description: "Distingue semipermanente, gel, retirada, pedicura y extras.", result: "Tiempo suficiente en agenda" },
      { title: "Precios claros", description: "Responde importes y condiciones desde tu catálogo real.", result: "Menos preguntas repetidas" },
      { title: "Alta recurrencia", description: "Facilita la próxima cita de clientes habituales.", result: "Más repetición mensual" },
    ],
    benefitsTitle: "Una agenda precisa para servicios llenos de detalles.",
    benefitsDescription: "Cada extra cambia el tiempo de la cita. BotBook pregunta lo necesario antes de confirmar.",
    benefits: [
      { title: "Manicura", description: "Reserva clásica, semipermanente, gel o acrílico.", result: "El hueco correcto para cada técnica" },
      { title: "Retiradas y retoques", description: "Pregunta por el estado previo y añade tiempo cuando corresponde.", result: "Menos retrasos en cadena" },
      { title: "Nail art", description: "Recoge el nivel de diseño y deja notas para el equipo.", result: "Citas mejor preparadas" },
    ],
    calendarIntegration: {
      title: "Tu disponibilidad real, también cuando la reserva llega por otro canal.",
      description: "Si las citas de mensajes, Instagram o tu sistema de reservas se sincronizan con Google Calendar, BotBook las ve antes de proponer un horario por teléfono.",
      examples: ["No ofrece huecos ya ocupados", "Respeta la duración de cada servicio", "Añade las llamadas a tu agenda habitual"],
    },
    calculator: { badge: "Calcula citas recurrentes perdidas", title: "¿Cuánto pierde tu salón cuando no responde?", description: "Mide el impacto mensual de manicuras y pedicuras que terminan reservándose en otro sitio.", ticketLabel: "Ticket medio por servicio", appointmentsLabel: "Citas perdidas cada semana", initialTicket: 30 },
    faqs: [
      { question: "¿Puede preguntar si necesito retirada?", answer: "Sí. El flujo puede comprobar técnica previa, retirada y extras para asignar la duración correcta." },
      { question: "¿Distingue una manicura sencilla de nail art?", answer: "Sí. Configuras categorías, tiempos y reglas para recoger el nivel de diseño antes de reservar." },
      { question: "¿Puede agendar la próxima cita?", answer: "Sí. Consulta disponibilidad y facilita que las clientas mantengan su frecuencia habitual." },
      { question: "¿Responde precios de cada técnica?", answer: "Sí. Usa tu catálogo real y puede aclarar qué extras afectan al precio antes de la visita." },
      { question: "¿Puedo seguir recibiendo reservas por Instagram o WhatsApp?", answer: "Sí. Si esas citas llegan a Google Calendar, BotBook las tiene en cuenta y sólo ofrece por teléfono horarios que siguen libres." },
    ],
    closingTitle: "Empieza a no perder citas de manicura esta semana.",
    sectorData: {
      eyebrow: "26.000 centros compiten por tu clientela",
      title: "En tu calle hay más salones de uñas que farmacias",
      description: "El sector mueve más de 600 millones de euros al año en España, pero la competencia es feroz. Si no contestas, el cliente tiene tres opciones más a una cuadra.",
      stats: [
        { value: "26.000", label: "centros en España ofrecen servicios de uñas", source: "STANPA / El Periódico" },
        { value: "600M\u20AC", label: "de facturación anual del sector", source: "STANPA / El Periódico" },
        { value: "85%", label: "de quienes no hablan con una persona real no vuelve a llamar", source: "safina.ai" },
      ],
      painPoint: "La mayoría de salones de uñas son microempresas de 1-2 personas. No puedes dejar la manicura a medias para coger el teléfono. Y contratar una recepcionista cuesta más de 1.100 \u20AC/mes.",
    },
  },
  barberia: {
    slug: "barberia",
    name: "Barberías",
    eyebrow: "Recepción inteligente para barberías",
    title: "Asistente telefónico para barberías 24/7",
    description: "Recepcionista virtual con IA para barberías: atiende llamadas y reserva cortes, barba, afeitado y packs, incluso en horas punta y fuera de horario.",
    primaryKeyword: "asistente telefónico para barberías",
    keywords: [
      "asistente telefónico para barberías",
      "recepcionista virtual para barberías",
      "recepcionista con IA para barberías",
      "reservas para barberías",
      "automatizar citas de barbería",
      "agenda para barberías",
      "asistente de voz para barberías",
      "gestión de citas de barbería",
      "reservas de corte y barba",
      "atender llamadas en barbería",
    ],
    accent: { strong: "#a86a1c", soft: "#f7ecd8", deep: "#71470f" },
    heroTitle: "No pierdas otro corte por no contestar el teléfono",
    heroDescription: "BotBook atiende llamadas, resuelve dudas sobre servicios y agenda citas 24/7 — incluso con todas las sillas ocupadas.",
    demoTitle: "Así reserva una cita de barbería",
    demoSteps: ["Configura corte, barba, afeitado y packs.", "Asigna barberos, tiempos y horarios.", "Atiende llamadas rápidas durante las horas punta."],
    conversations: [
      {
        caller: "Cliente · móvil",
        context: "Corte rápido",
        messages: [
          { sender: "client", text: "¿Hay hueco para corte esta tarde?", delay: 0.35 },
          { sender: "agent", text: "Sí, 18:15 o 18:45 con tu barbero habitual.", delay: 2.1 },
          { sender: "client", text: "18:15, gracias.", delay: 3.7 },
        ],
        result: "Cita confirmada",
        resultDetail: "Hoy · 18:15 · Corte",
        duration: 6600,
      },
      {
        caller: "Cliente habitual",
        context: "Pack corte + barba",
        messages: [
          { sender: "client", text: "Quiero corte y barba para mañana", delay: 0.35 },
          { sender: "agent", text: "Mañana 12:00 o 13:00. Reservo 45 minutos para el pack.", delay: 2.1 },
          { sender: "client", text: "12:00 está bien.", delay: 3.7 },
        ],
        result: "Pack agendado",
        resultDetail: "Mañana · 12:00 · Corte + barba",
        duration: 6600,
      },
      {
        caller: "Cliente",
        context: "Urgencia de última hora",
        messages: [
          { sender: "client", text: "¿Puedo pasar ya para un arreglado de barba?", delay: 0.35 },
          { sender: "agent", text: "Tengo hueco en 25 minutos. ¿Lo reservo?", delay: 2.1 },
          { sender: "client", text: "Sí, reservalo.", delay: 3.7 },
        ],
        result: "Hueco aprovechado",
        resultDetail: "En 25 min · Arreglo de barba",
        duration: 6600,
      },
    ],
    sectionTitle: "Atiende cada llamada. Sin detener una navaja.",
    sectionDescription: "Convierte consultas rápidas en citas confirmadas sin detener un corte ni perder ritmo en el local.",
    highlights: [
      { title: "Citas rápidas", description: "Responde y reserva en pocos pasos.", result: "Menos fricción para clientes" },
      { title: "Barbero preferido", description: "Comprueba disponibilidad del profesional solicitado.", result: "Más fidelidad y recurrencia" },
      { title: "Packs bien agendados", description: "Reserva corte y barba con su duración completa.", result: "Sin retrasos entre clientes" },
    ],
    benefitsTitle: "Tu barbería sigue atendiendo incluso con todas las sillas ocupadas.",
    benefitsDescription: "Una recepción directa y rápida que entiende servicios, preferencias y franjas de mayor demanda.",
    benefits: [
      { title: "Corte", description: "Encuentra hueco por barbero y duración.", result: "Reserva rápida y precisa" },
      { title: "Barba y afeitado", description: "Informa sobre opciones y añade el tiempo adecuado.", result: "Agenda sin improvisaciones" },
      { title: "Packs", description: "Combina servicios y confirma el importe orientativo.", result: "Mayor ticket por visita" },
    ],
    calendarIntegration: {
      title: "Tus reservas de siempre. Una agenda compartida.",
      description: "BotBook consulta Google Calendar antes de confirmar un corte o un pack. Las citas que ya entren desde web, WhatsApp u otra herramienta sincronizada se respetan automáticamente.",
      examples: ["Sin solapes entre teléfono y reservas online", "Huecos actualizados para cada barbero", "Todas las citas quedan en la misma agenda"],
    },
    calculator: { badge: "Calcula cortes que se escapan", title: "¿Cuánto pierde tu barbería en horas punta?", description: "Estima el valor de cortes y packs que no se reservan cuando nadie puede atender el teléfono.", ticketLabel: "Ticket medio por visita", appointmentsLabel: "Citas perdidas cada semana", initialTicket: 25 },
    faqs: [
      { question: "¿Puede reservar con un barbero concreto?", answer: "Sí. Consulta la disponibilidad del profesional solicitado y ofrece alternativas si no tiene hueco." },
      { question: "¿Distingue corte, barba y pack?", answer: "Sí. Cada servicio tiene su duración y reglas para bloquear el tiempo correcto." },
      { question: "¿Funciona para citas rápidas del mismo día?", answer: "Sí. Consulta huecos reales y puede ofrecer la primera franja disponible según tus reglas." },
      { question: "¿Atiende fuera del horario de apertura?", answer: "Sí. Tus clientes pueden consultar y reservar aunque la barbería esté cerrada." },
      { question: "¿Qué pasa con mis reservas de web o WhatsApp?", answer: "BotBook consulta Google Calendar antes de reservar. Las citas que lleguen desde otros canales sincronizados quedan protegidas." },
    ],
    closingTitle: "Empieza a no perder cortes esta semana.",
    sectorData: {
      eyebrow: "El problema real del sector",
      title: "Cada llamada perdida es un cliente que no vuelve",
      description: "Los datos del sector de servicios personales en España revelan una realidad difícil de ignorar: la mayoría de las llamadas que no contestas desaparecen para siempre.",
      stats: [
        { value: "60%", label: "de los clientes que no contactan no vuelve a llamar", source: "heilo.io" },
        { value: "42%", label: "de las reservas en servicios personales se hace por teléfono", source: "heilo.io" },
        { value: "150\u20AC", label: "de pérdida media por cada llamada no atendida", source: "gestiondellamadas.com" },
      ],
      quotes: [
        { text: "Antes el estar pendiente todo el rato al teléfono me limitaba muchos cortes al día, ahora puedo cortar a más gente y despreocuparme del móvil", source: "Excelsior Barber Studio, Palma — Diario de Mallorca" },
      ],
    },
  },
  fisioterapia: {
    slug: "fisioterapia",
    name: "Clínicas y consultas de fisioterapia",
    eyebrow: "Recepción inteligente para fisioterapia",
    title: "Asistente telefónico para clínicas de fisioterapia",
    description: "Recepcionista virtual con IA para clínicas y consultas de fisioterapia: atiende llamadas, organiza primeras visitas y seguimientos, y reserva citas 24/7.",
    primaryKeyword: "asistente telefónico para fisioterapia",
    keywords: [
      "asistente telefónico para fisioterapeutas",
      "asistente telefónico para fisioterapia",
      "recepcionista virtual para fisioterapia",
      "recepcionista con IA para fisioterapeutas",
      "reservas para clínica de fisioterapia",
      "automatizar citas de fisioterapia",
      "agenda para fisioterapeutas",
      "asistente de voz para clínica de fisioterapia",
      "gestión de citas de fisioterapia",
      "atención telefónica para fisioterapeutas",
      "reservar sesión de fisioterapia",
    ],
    accent: { strong: "#0e7f78", soft: "#e0f1ee", deep: "#0a5751" },
    heroTitle: "No pierdas otra primera visita por no contestar el teléfono",
    heroDescription: "BotBook atiende llamadas, recoge el motivo de consulta y agenda citas 24/7 — incluso mientras tratas a un paciente.",
    demoTitle: "Así gestiona una cita de fisioterapia",
    demoSteps: [
      "Configura primeras visitas, seguimientos y especialidades.",
      "Define qué consultas deben derivarse al fisioterapeuta.",
      "Conecta profesionales, duración de sesión y calendario.",
    ],
    conversations: [
      {
        caller: "Paciente · móvil",
        context: "Primera visita",
        messages: [
          { sender: "client", text: "Necesito primera sesión por dolor lumbar", delay: 0.35 },
          { sender: "agent", text: "Tengo mañana 10:30 o 12:00. Reservo 60 min para valoración inicial.", delay: 2.1 },
          { sender: "client", text: "10:30, por favor.", delay: 3.7 },
        ],
        result: "Cita inicial",
        resultDetail: "Mañana · 10:30 · Valoración lumbar",
        duration: 6600,
      },
      {
        caller: "Paciente habitual",
        context: "Seguimiento",
        messages: [
          { sender: "client", text: "Quiero seguir con la misma fisio la semana que viene", delay: 0.35 },
          { sender: "agent", text: "Disponible martes 18:00 o jueves 12:30 con tu fisioterapeuta.", delay: 2.1 },
          { sender: "client", text: "Jueves 12:30 está bien.", delay: 3.7 },
        ],
        result: "Continuidad",
        resultDetail: "Jueves · 12:30 · Seguimiento",
        duration: 6600,
      },
      {
        caller: "Paciente",
        context: "Consulta a derivar",
        messages: [
          { sender: "client", text: "Tengo una lesión de rodilla, ¿qué me recomendáis?", delay: 0.35 },
          { sender: "agent", text: "Derivaré tu caso al fisioterapeuta para que confirme el tratamiento antes de reservar.", delay: 2.1 },
          { sender: "client", text: "De acuerdo, quedo atento.", delay: 3.7 },
        ],
        result: "Derivado al profesional",
        resultDetail: "Valoración previa necesaria",
        duration: 6600,
      },
    ],
    sectionTitle: "Atiende cada llamada. Sin interrumpir la sesión.",
    sectionDescription: "El teléfono deja de interrumpir el tratamiento y sigue convirtiendo consultas en citas confirmadas durante todo el día.",
    highlights: [
      { title: "Sesiones sin interrupciones", description: "Atiende llamadas mientras estás tratando a un paciente.", result: "Más concentración en consulta" },
      { title: "Primera visita organizada", description: "Recoge el motivo general y reserva el tiempo adecuado sin realizar diagnósticos.", result: "Mejor contexto antes de recibir" },
      { title: "Seguimientos ágiles", description: "Facilita la reserva de próximas sesiones según disponibilidad real.", result: "Mayor continuidad terapéutica" },
    ],
    benefitsTitle: "Una recepción preparada para el ritmo de tu consulta.",
    benefitsDescription: "Resuelve preguntas administrativas, organiza la agenda y deriva al profesional cualquier consulta que requiera criterio clínico.",
    benefits: [
      { title: "Primera consulta", description: "Recoge datos básicos y el motivo general para reservar la duración correcta.", result: "Primera visita mejor preparada" },
      { title: "Sesiones de seguimiento", description: "Busca huecos compatibles con el fisioterapeuta habitual.", result: "Menos fricción entre sesiones" },
      { title: "Especialidades", description: "Orienta la reserva por profesional o servicio configurado, sin emitir diagnósticos.", result: "Consultas correctamente derivadas" },
    ],
    calendarIntegration: {
      title: "Protege la agenda de tu consulta en todos los canales.",
      description: "BotBook consulta Google Calendar antes de ofrecer una cita. Respeta las sesiones que ya entren por recepción, formulario web u otro sistema sincronizado.",
      examples: ["Evita solapes entre pacientes", "Mantiene visibles las sesiones ya registradas", "Añade llamadas nuevas a tu calendario"],
    },
    calculator: {
      badge: "Calcula pacientes que no consiguen cita",
      title: "¿Cuánto pierde tu consulta por no responder?",
      description: "Estima el valor de primeras visitas y seguimientos que podrían reservarse en otra clínica cuando estás atendiendo.",
      ticketLabel: "Ticket medio por sesión",
      appointmentsLabel: "Citas perdidas cada semana",
      initialTicket: 45,
    },
    faqs: [
      { question: "¿Puede gestionar primeras visitas y seguimientos?", answer: "Sí. Puedes configurar cada tipo de cita con su duración y profesionales compatibles para bloquear el hueco adecuado." },
      { question: "¿El asistente ofrece diagnósticos o recomendaciones clínicas?", answer: "No. Recoge información general, responde cuestiones administrativas y deriva cualquier valoración clínica al fisioterapeuta." },
      { question: "¿Puede reservar con el fisioterapeuta habitual del paciente?", answer: "Sí. Consulta su disponibilidad y puede ofrecer alternativas si el profesional solicitado no tiene hueco." },
      { question: "¿Atiende mientras estoy en una sesión?", answer: "Sí. Está disponible durante las sesiones, fuera de horario y en festivos para que una llamada no interrumpa el tratamiento." },
      { question: "¿Puedo mantener mi agenda o sistema actual?", answer: "Sí. BotBook consulta Google Calendar como referencia de disponibilidad y respeta las sesiones de otros canales que ya estén sincronizadas." },
    ],
    closingTitle: "Empieza a no perder pacientes esta semana.",
    sectorData: {
      eyebrow: "Un problema que solo entiende quien lo vive",
      title: "No puedes dejar a un paciente solo con electrodos para coger el teléfono",
      description: "La fisioterapia es una profesión regulada que exige atención continua. No hay estadísticas públicas sobre llamadas perdidas, pero el problema es evidente cada vez que suena el móvil a mitad de una sesión.",
      stats: [
        { value: "45-65\u20AC", label: "de ticket medio por sesión presencial", source: "Doctoralia" },
        { value: "60 min", label: "de duración típica de una primera visita", source: "Sector fisioterapia" },
      ],
      painPoint: "Cuando estás tratando a un paciente, no puedes interrumpir la sesión. Dejarlo solo con aparatos conectados o a mitad de una manipulación no es una opción. Mientras tanto, la llamada de una nueva primera visita se pierde.",
    },
  },
};

export function getNicheMetadata(content: NicheLandingContent): Metadata {
  const url = absoluteUrl(`/${content.slug}`);

  return {
    title: { absolute: `${content.title} | ${siteName}` },
    description: content.description,
    keywords: [...content.keywords, siteName],
    alternates: { canonical: url },
    category: "business software",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title: `${content.title} | ${siteName}`,
      description: content.description,
      url,
      siteName,
      locale: "es_ES",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${content.title} | ${siteName}`,
      description: content.description,
    },
    other: {
      "geo.region": "ES",
      "geo.placename": "España",
      language: "es",
    },
  };
}

export function getNicheStructuredData(content: NicheLandingContent) {
  const url = absoluteUrl(`/${content.slug}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        name: `${content.title} | ${siteName}`,
        headline: content.heroTitle,
        description: content.description,
        url,
        inLanguage: "es-ES",
        isPartOf: { "@type": "WebSite", "@id": `${absoluteUrl("/landing")}#website`, name: siteName, url: absoluteUrl("/landing") },
        about: { "@id": `${url}#service` },
        keywords: content.keywords.join(", "),
      },
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: content.primaryKeyword,
        serviceType: "Recepción telefónica con inteligencia artificial y gestión de citas",
        provider: { "@type": "Organization", "@id": `${absoluteUrl("/landing")}#organization`, name: siteName, url: absoluteUrl("/landing") },
        areaServed: { "@type": "Country", name: "España" },
        audience: { "@type": "BusinessAudience", audienceType: content.name },
        description: content.description,
        url,
        offers: {
          "@type": "AggregateOffer",
          lowPrice: "69",
          highPrice: "299",
          priceCurrency: "EUR",
          offerCount: "3",
          url: absoluteUrl("/planes"),
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#software`,
        name: siteName,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: content.description,
        url,
        audience: { "@type": "BusinessAudience", audienceType: content.name },
        offers: { "@type": "AggregateOffer", lowPrice: "69", highPrice: "299", priceCurrency: "EUR", offerCount: "3" },
      },
      { "@type": "FAQPage", mainEntity: content.faqs.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Inicio", item: absoluteUrl("/landing") }, { "@type": "ListItem", position: 2, name: "Soluciones", item: absoluteUrl("/landing#soluciones") }, { "@type": "ListItem", position: 3, name: content.name, item: url }] },
    ],
  };
}

export const nicheLinks = (Object.values(nicheLandings) as NicheLandingContent[]).map(({ slug, name }) => ({ href: `/${slug}`, label: name }));

/**
 * Datos de sector para la landing genérica. Sirven para los cinco nichos y todas
 * las cifras llevan fuente externa verificable: BotBook está en prelanzamiento y
 * no tiene métricas propias ni clientes que citar.
 */
export const generalSectorData: SectorData = {
  eyebrow: "El coste de no contestar",
  title: "La llamada que no coges se la queda otro.",
  description:
    "No es una intuición del sector: está medido. En los negocios que trabajan con cita previa, el teléfono sigue siendo el canal principal de reserva y quien no recibe respuesta no vuelve a intentarlo.",
  stats: [
    {
      value: "78%",
      label: "de los clientes contrata al primer negocio que responde",
      source: "minute-call.com",
    },
    {
      value: "57%",
      label: "de los clientes reserva por teléfono: sigue siendo el canal más importante",
      source: "Zenoti",
    },
    {
      value: "60%",
      label: "de quienes no consiguen contactar no vuelve a llamar",
      source: "heilo.io",
    },
  ],
  quotes: [
    {
      text: "Antes el estar pendiente todo el rato al teléfono me limitaba muchos cortes al día, ahora puedo cortar a más gente y despreocuparme del móvil",
      source: "Excelsior Barber Studio, Palma — Diario de Mallorca",
    },
  ],
};

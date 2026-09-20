/**
 * Todo el copy que Alhabla escribe por WhatsApp en la fase 1 (PLAN-CANAL-
 * DUENO.md § 2, § 6 y § 12), como funciones puras para que los tests
 * comparen contra ellas. Sin emojis, sin anglicismos, tuteo, frases cortas.
 * Ningún texto a un número desconocido nombra negocio, teléfono ni código;
 * los nombres de negocio llegan ya pasados por `nombreParaWhatsapp`.
 */

/** «A», «A y B», «A, B y C». */
export function listarNegocios(nombres: string[]): string {
  if (nombres.length === 0) return "";
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Enlace al panel; por defecto, Ajustes › WhatsApp. */
export function panelUrl(ruta = "/ajustes#whatsapp"): string {
  return `${(process.env.FRONTEND_URL ?? "https://alhabla.ai").replace(/\/$/, "")}${ruta}`;
}

// ---------------------------------------------------------------------------
// Número de NEGOCIOS («Alhabla», +34 930 453 218)
// ---------------------------------------------------------------------------

export function bienvenidaTrasAlta(input: {
  negocios: string[];
  movilApuntado: boolean;
}): string {
  const lineas = [
    `Listo. Soy Alhabla, la recepcionista de ${listarNegocios(input.negocios)}. A partir de ahora te aviso aquí de cada reserva y cada recado que atienda por teléfono.`,
    "Guarda este número para reconocerme. Escribe AYUDA si tienes dudas y STOP si algún día quieres dejar de recibir avisos.",
  ];
  if (input.movilApuntado) {
    lineas.push("He apuntado este móvil en tu panel, en Ajustes › WhatsApp.");
  }
  return lineas.join("\n");
}

export function yaActivo(input: { negocios: string[] }): string {
  return `Los avisos de ${listarNegocios(input.negocios)} ya están activos en este móvil. No tienes que hacer nada más. Escribe AYUDA si tienes dudas.`;
}

export function codigoNoReconocido(): string {
  return "No reconozco ese código. Cópialo tal cual desde tu panel, en Ajustes › WhatsApp, o pulsa allí «Abrir WhatsApp» para que venga ya escrito.";
}

export function codigoCaducado(): string {
  return "Ese código ya no vale. Entra en tu panel, en Ajustes › WhatsApp: verás uno nuevo.";
}

export function demasiadosIntentos(): string {
  return "Has probado demasiados códigos seguidos. Espera una hora y vuelve a intentarlo desde tu panel.";
}

/** `ALTA` sin código desde un número desconocido o que aún no ha consentido. */
export function comoDarseDeAlta(): string {
  return "Para activar los avisos de tu negocio necesito tu código. Entra en tu panel de Alhabla, ve a Ajustes › WhatsApp y pulsa «Abrir WhatsApp»: el mensaje vendrá ya escrito.";
}

/** STOP/BAJA del dueño con al menos un negocio que había consentido. */
export function bajaDueno(input: { negocios: string[] }): string {
  return `Hecho. No recibirás más avisos de ${listarNegocios(input.negocios)} en este móvil. Si cambias de idea, escribe ALTA y los vuelvo a activar.`;
}

/** STOP de un número sin negocio, o cuyo negocio nunca consintió. */
export function bajaDesconocido(): string {
  return "Anotado. No recibirás mensajes de Alhabla en este móvil.";
}

/** `ALTA` a secas tras un STOP. */
export function avisosReactivados(input: { negocios: string[] }): string {
  return `Avisos activados para ${listarNegocios(input.negocios)}. Te aviso aquí de cada reserva y recado. Escribe STOP si quieres dejar de recibirlos.`;
}

export function ayudaDueno(input: {
  negocios: string[];
  panelUrl: string;
}): string {
  return [
    `Soy Alhabla, la recepcionista de ${listarNegocios(input.negocios)}. Por aquí te aviso de las reservas y los recados que atiendo por teléfono.`,
    "Puedes escribirme:",
    "AYUDA: ver este mensaje.",
    "STOP: dejar de recibir avisos.",
    "ALTA: volver a recibirlos.",
    `Para cambiar tu horario, tus servicios o tu equipo, entra en tu panel: ${input.panelUrl}`,
  ].join("\n");
}

export function todaviaNoChateo(input: { panelUrl: string }): string {
  return [
    `Por ahora solo puedo mandarte avisos por aquí; todavía no sé responder a lo que me escribas. Para ver tu agenda o cambiar algo, entra en tu panel: ${input.panelUrl}`,
    "Escribe AYUDA si quieres ver qué entiendo.",
  ].join("\n");
}

export function desconocidoEnNegocios(): string {
  return "Hola, soy Alhabla. Este número es para los negocios que usan nuestra recepcionista. Si tienes uno, activa los avisos desde tu panel en alhabla.ai (Ajustes › WhatsApp). Si lo que quieres es pedir cita, llama directamente al negocio.";
}

export function mensajeParaOtroMovil(): string {
  return "Este mensaje era para otro móvil. Si quieres recibir aquí los avisos, entra en tu panel, en Ajustes › WhatsApp, y pulsa «Abrir WhatsApp».";
}

// ---------------------------------------------------------------------------
// Número de CLIENTES («Alhabla Reservas», +34 930 454 394)
// ---------------------------------------------------------------------------

export function bajaCliente(): string {
  return "Hecho. No te enviaremos más mensajes de WhatsApp desde Alhabla, de ningún negocio. Si más adelante quieres volver a recibir las confirmaciones de tus citas, escribe ALTA.";
}

export function clienteReactivado(): string {
  return "Perfecto. Volverás a recibir por aquí las confirmaciones y recordatorios de tus citas.";
}

export function numeroEquivocado(input: { enlace: string }): string {
  return `Este número es el que usan los clientes. Para activar los avisos de tu negocio escribe al otro número de Alhabla; pulsa aquí y te llevo con el mensaje ya escrito: ${input.enlace}`;
}

export function duenoEnClientes(input: { enlace: string }): string {
  return `Este es el número de Alhabla para los clientes. Para los avisos de tu negocio escríbeme al número de los negocios: ${input.enlace}`;
}

export function clienteConocido(input: {
  negocio: string;
  telefono: string | null;
}): string {
  const llamada = input.telefono
    ? `llama al negocio al ${input.telefono}`
    : "llama directamente al negocio";
  return `Hola, soy Alhabla y gestiono las reservas de ${input.negocio}. Por aquí solo recibirás mensajes sobre tus citas. Para cambiar o cancelar una cita, ${llamada}. Escribe STOP si no quieres recibir mensajes.`;
}

export function desconocidoEnClientes(): string {
  return "Hola, soy Alhabla y gestiono las reservas de varios negocios. Por aquí solo recibirás mensajes sobre tus citas. Para pedir una, llama al negocio y te atenderá la recepcionista. Escribe STOP si no quieres recibir mensajes.";
}

// ---------------------------------------------------------------------------
// Botones del cliente (PR 4)
// ---------------------------------------------------------------------------
// `{negocio}` llega por `nombreParaCliente` (respaldo «el negocio», nunca «tu
// negocio»), `{cita}` por `formatearCita`, `{telefono}` por
// `telefonoDeContacto` (ya formateado) o null, `{otraCita}` por
// `otraCitaActiva` o null.

function llamar(negocio: string, telefono: string | null): string {
  return telefono
    ? `llama a ${negocio} al ${telefono}`
    : `llama directamente a ${negocio}`;
}

function laQueTienes(otraCita: string | null): string {
  return otraCita
    ? ` La cita que tienes ahora es el ${otraCita}: para anularla, pulsa Cancelar en su recordatorio o llama al negocio.`
    : "";
}

/** «Guardar contacto» cuando la vCard no ha podido salir. */
export function contactoComoTexto(input: { numero: string }): string {
  return `No he podido enviarte la tarjeta. Guarda este número como Alhabla Reservas: ${input.numero}.`;
}

/** Botón «Confirmo». */
export function citaConfirmadaPorCliente(input: {
  negocio: string;
  cita: string;
}): string {
  return `Gracias. Tu cita en ${input.negocio} del ${input.cita} queda confirmada. Te esperamos.`;
}

export function citaYaConfirmada(input: {
  negocio: string;
  cita: string;
}): string {
  return `Tu cita en ${input.negocio} del ${input.cita} ya estaba confirmada. No tienes que hacer nada más.`;
}

export function citaYaCancelada(input: {
  negocio: string;
  telefono: string | null;
  otraCita: string | null;
}): string {
  return `Esa cita en ${input.negocio} ya está cancelada.${laQueTienes(input.otraCita)} Si quieres otra hora, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

export function citaYaPasada(input: {
  negocio: string;
  telefono: string | null;
  otraCita: string | null;
}): string {
  return `Esa cita en ${input.negocio} ya ha pasado.${laQueTienes(input.otraCita)} Si quieres pedir otra, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

/** Botón «Cancelar». */
export function citaCanceladaPorCliente(input: {
  negocio: string;
  cita: string;
  telefono: string | null;
}): string {
  return `Hecho. Tu cita en ${input.negocio} del ${input.cita} queda cancelada. Gracias por avisar. Si quieres otra hora, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

/** Botón «Cambiar»: en la fase 1 solo da el teléfono. */
export function comoCambiarCita(input: {
  negocio: string;
  cita: string;
  telefono: string | null;
}): string {
  return `Para cambiar tu cita del ${input.cita}, ${llamar(input.negocio, input.telefono)} y la recepcionista te busca otra hora. Mientras tanto la cita sigue en pie. Si prefieres anularla, pulsa Cancelar en el recordatorio.`;
}

/** Botón «Sí, resérvala»: la reserva ha entrado. Es la confirmación. */
export function huecoReservado(input: {
  negocio: string;
  servicio: string;
  cita: string;
  telefono: string | null;
}): string {
  return `Hecho, la hora es tuya. Tu cita en ${input.negocio} para ${input.servicio} queda confirmada el ${input.cita}. Si necesitas cambiarla, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

export function huecoYaReservado(input: {
  negocio: string;
  cita: string;
}): string {
  return `Esa hora ya es tuya: tu cita en ${input.negocio} queda el ${input.cita}. No hace falta que hagas nada más.`;
}

export function huecoYaOcupado(input: {
  negocio: string;
  telefono: string | null;
}): string {
  return `Vaya, esa hora en ${input.negocio} se acaba de ocupar. Si quieres otra, ${llamar(input.negocio, input.telefono)} y la recepcionista te la busca.`;
}

export function huecoFueraDePlazo(input: {
  negocio: string;
  telefono: string | null;
}): string {
  return `Esa hora en ${input.negocio} ya no se puede reservar con tan poca antelación. Si quieres otra, ${llamar(input.negocio, input.telefono)} y la recepcionista te la busca.`;
}

export function huecoYaPasado(input: {
  negocio: string;
  telefono: string | null;
}): string {
  return `Esa hora en ${input.negocio} ya ha pasado. Si quieres pedir otra, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

export function huecoCerrado(input: {
  negocio: string;
  telefono: string | null;
}): string {
  return `Ese aviso de ${input.negocio} ya está cerrado. Si sigues queriendo cita, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

export function noPudeReservarAhora(input: {
  negocio: string;
  telefono: string | null;
}): string {
  return `No he podido reservarla en ${input.negocio} ahora mismo. Vuelve a pulsar en un minuto o ${llamar(input.negocio, input.telefono)}.`;
}

/** Botón «Ya no». */
export function huecoRechazado(input: { negocio: string }): string {
  return `Entendido, no te guardamos esa hora en ${input.negocio}. Gracias por avisar.`;
}

export function huecoYaReservadoNoSeAnula(input: {
  negocio: string;
  cita: string;
}): string {
  return `Esa hora ya está reservada a tu nombre en ${input.negocio} para el ${input.cita}. Si no la quieres, pulsa Cancelar en el recordatorio o llama al negocio.`;
}

/** Botón «No me va bien» (cambio_cita_cliente, fase 2). */
export function cambioNoMeVaBien(input: {
  negocio: string;
  telefono: string | null;
}): string {
  return `Entendido, se lo hago saber a ${input.negocio}. Si quieres buscar otra hora ya, ${llamar(input.negocio, input.telefono)} y te atenderá la recepcionista.`;
}

/** Botón sin `context.id` o con título desconocido: no se sabe el negocio. */
export function botonSinContexto(): string {
  return "No sé a qué cita te refieres. Llama al negocio y te atenderá la recepcionista.";
}

// ---------------------------------------------------------------------------
// Avisos al negocio (PR 3) y sus botones
// ---------------------------------------------------------------------------

/** #1 — Cuerpo del interactivo dentro de la ventana. */
export function avisoNuevaReserva(input: {
  negocio: string;
  cliente: string;
  cita: string;
  servicio: string;
}): string {
  return `${input.negocio}: nueva cita. ${input.cliente}, ${input.cita}, ${input.servicio}. Ya está en tu agenda.`;
}

/** #3 — La cita no entró en el calendario. */
export function avisoCitaPendiente(input: {
  negocio: string;
  cliente: string;
  cita: string;
  motivo: string;
  panelUrl: string;
}): string {
  return [
    `${input.negocio}: la cita de ${input.cliente}, ${input.cita}, no entró en tu calendario porque ${input.motivo}.`,
    `Si la apuntas tú a mano, pulsa «La apunté yo». Si prefieres que lo intente otra vez, «Reintentar». Para reconectar el calendario: ${input.panelUrl}`,
  ].join("\n");
}

/** #4 — El cliente ha cancelado. */
export function avisoCancelacion(input: {
  negocio: string;
  cliente: string;
  cita: string;
  servicio: string;
}): string {
  return `${input.negocio}: ${input.cliente} canceló su cita del ${input.cita} (${input.servicio}). Ese hueco queda libre.`;
}

/** Una cita pendiente entró por fin en el calendario. */
export function avisoCitaRecuperada(input: {
  negocio: string;
  cliente: string;
  cita: string;
}): string {
  return `${input.negocio}: la cita de ${input.cliente}, ${input.cita}, ya está en tu calendario.`;
}

/** Botón «La apunté yo». */
export function citaApuntada(input: { cliente: string }): string {
  return `Perfecto, doy por apuntada la cita de ${input.cliente}. No volveré a intentar meterla en el calendario.`;
}

/** Botón «Reintentar». */
export function reintentandoCita(input: { cliente: string }): string {
  return `Lo intento otra vez ahora con la cita de ${input.cliente}. Si entra, te aviso por aquí.`;
}

/** Botón «Reconectar». */
export function reconectarCalendario(input: { panelUrl: string }): string {
  return `Para reconectar el calendario entra en tu panel: ${input.panelUrl}. En cuanto esté conectado, vuelvo a intentar las citas pendientes.`;
}

/** El botón llegó tarde: el lead ya estaba resuelto. */
export function citaYaResuelta(): string {
  return "Esa cita ya está resuelta. No hay nada más que hacer.";
}

// ---------------------------------------------------------------------------
// Lista de espera (botón del dueño «Avisar a quien esperaba», PR 4)
// ---------------------------------------------------------------------------
// `{negocio}` por `nombreParaWhatsapp` (es el dueño); `{cliente}` es el
// nombre o null. Ninguna respuesta lleva el teléfono del que esperaba.

function quien(cliente: string | null): string {
  return cliente ?? "la primera persona que esperaba";
}

export function listaDeEsperaAvisada(input: {
  negocio: string;
  cliente: string | null;
}): string {
  return `${input.negocio}: he avisado a ${quien(input.cliente)}, que pedía esa hora. Si la reserva, te llega el aviso de nueva cita.`;
}

export function listaDeEsperaEnOferta(input: {
  negocio: string;
  cliente: string | null;
  minutos: number;
}): string {
  return `${input.negocio}: ya avisé a ${quien(input.cliente)} hace ${input.minutos} minutos. Le doy diez minutos; si no contesta, vuelve a pulsar y aviso al siguiente.`;
}

export function listaDeEsperaNadie(input: { negocio: string }): string {
  return `${input.negocio}: nadie esperaba esa hora. El hueco queda libre en tu agenda.`;
}

export function listaDeEsperaSinPlantilla(input: { negocio: string }): string {
  return `${input.negocio}: ahora mismo no puedo escribir por WhatsApp a quien esperaba esa hora. En cuanto pueda, este botón lo hará.`;
}

export function listaDeEsperaSinHueco(input: { negocio: string }): string {
  return `${input.negocio}: esa cita sigue en pie, así que no hay hueco que ofrecer.`;
}

export function listaDeEsperaPasada(input: { negocio: string }): string {
  return `${input.negocio}: esa hora ya ha pasado; no hay a quién avisar.`;
}

export function listaDeEsperaError(input: { negocio: string }): string {
  return `${input.negocio}: no he podido avisar a quien esperaba ahora mismo. Vuelve a pulsar en unos minutos.`;
}

/** Botón «Ver agenda de hoy» y palabras clave AGENDA / HOY / MAÑANA. */
export function agendaDelDia(input: {
  negocio: string;
  dia: "hoy" | "mañana";
  etiqueta: string;
  lineas: string[];
}): string {
  if (input.lineas.length === 0) {
    return `${input.negocio}, ${input.dia} (${input.etiqueta}): sin citas.`;
  }
  return [
    `${input.negocio}, ${input.dia} (${input.etiqueta}): ${input.lineas.length} ${input.lineas.length === 1 ? "cita" : "citas"}.`,
    ...input.lineas,
  ].join("\n");
}

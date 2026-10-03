/**
 * Latencia de turno medida en una grabación de doble canal (cliente en
 * uno, recepcionista en el otro): cuánto tarda la recepcionista en empezar
 * a hablar desde que el cliente termina. Es lo que el cliente nota como
 * «espera», sume lo que sume cada pieza (fin de turno, modelo y voz), y
 * sirve igual con flux que con Soniox o cualquier voz.
 *
 * Puro: recibe la salida de `ffmpeg -af silencedetect` de cada canal, a
 * dos umbrales (ver conVozFuerte). El script que descarga y analiza las
 * grabaciones es scripts/medirLatenciaDeTurnos.ts.
 */

export interface Segmento {
  inicio: number;
  fin: number;
}

/** Tramos separados por menos de esto son la misma intervención
 * (respiraciones y pausas entre palabras). */
const PAUSA_DENTRO_DE_UNA_FRASE_S = 0.3;

/** Lo que dura menos que esto no es voz: chasquidos, el eco de la otra
 * parte o un pico del fondo entre dos silencios (silencedetect los deja
 * como tramos de duración casi cero). Contarlos inventa solapes y turnos
 * (visto el 2026-10-03 en la primera grabación medida). Una sílaba ya dura
 * más. */
const DURACION_MINIMA_DE_VOZ_S = 0.15;

function unirTramos(tramos: Segmento[], pausa: number): Segmento[] {
  const unidos: Segmento[] = [];
  for (const tramo of tramos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && tramo.inicio - ultimo.fin < pausa) {
      ultimo.fin = Math.max(ultimo.fin, tramo.fin);
    } else {
      unidos.push({ ...tramo });
    }
  }
  return unidos;
}

/**
 * Salida de `silencedetect` (líneas `silence_start: X` y `silence_end: Y`)
 * → tramos con voz: el complemento de los silencios dentro de la duración.
 */
export function segmentosDeVoz(
  salidaDeSilencedetect: string,
  duracion: number,
  pausa = PAUSA_DENTRO_DE_UNA_FRASE_S
): Segmento[] {
  const silencios: Segmento[] = [];
  let inicioDeSilencio: number | null = null;
  for (const linea of salidaDeSilencedetect.split("\n")) {
    const comienzo = linea.match(/silence_start: (-?[\d.]+)/);
    if (comienzo) {
      inicioDeSilencio = Math.max(0, Number(comienzo[1]));
      continue;
    }
    const final = linea.match(/silence_end: ([\d.]+)/);
    if (final && inicioDeSilencio !== null) {
      silencios.push({ inicio: inicioDeSilencio, fin: Number(final[1]) });
      inicioDeSilencio = null;
    }
  }
  if (inicioDeSilencio !== null) {
    silencios.push({ inicio: inicioDeSilencio, fin: duracion });
  }

  const voz: Segmento[] = [];
  let cursor = 0;
  for (const silencio of silencios) {
    if (silencio.inicio > cursor)
      voz.push({ inicio: cursor, fin: silencio.inicio });
    cursor = Math.max(cursor, silencio.fin);
  }
  if (cursor < duracion) voz.push({ inicio: cursor, fin: duracion });
  return unirTramos(voz, pausa).filter(
    (tramo) => tramo.fin - tramo.inicio >= DURACION_MINIMA_DE_VOZ_S
  );
}

/**
 * Histéresis: los tramos al umbral suave (p. ej. -38 dB, que capta el
 * arranque y la cola de la voz) que tienen alguna parte por encima del
 * fuerte (p. ej. -30 dB). El fondo de oficina de la recepcionista suelta
 * clics que pasan del suave en un instante pero se quedan en -47 dB de RMS:
 * con un solo umbral salían respuestas de 58 ms y solapes que no existían
 * (visto el 2026-10-03); con solo el fuerte, el arranque suave de una frase
 * se detectaba hasta 200 ms tarde.
 */
export function conVozFuerte(
  suaves: Segmento[],
  fuertes: Segmento[]
): Segmento[] {
  return suaves.filter((suave) =>
    fuertes.some(
      (fuerte) => fuerte.inicio < suave.fin && fuerte.fin > suave.inicio
    )
  );
}

export interface TurnoMedido {
  finDelCliente: number;
  inicioDeLaRecepcionista: number;
  /** Segundos de espera que oye el cliente. */
  latencia: number;
}

export interface LatenciaDeLaLlamada {
  turnos: TurnoMedido[];
  /** Respuestas de más de `maximo` segundos: no cuentan como espera, pero
   * hacen falta para emparejar el audio con la transcripción. */
  largas: TurnoMedido[];
  /** Veces que la recepcionista empezó con el cliente aún hablando. */
  solapes: number;
}

/**
 * Cada vez que la recepcionista empieza a hablar justo después de una
 * intervención del cliente, la espera es su inicio menos el fin del
 * cliente. Si empieza con el cliente aún hablando, es un solape (le ha
 * cortado), no una espera. No cuentan el saludo (nadie habló antes) ni
 * los huecos de más de `maximo` segundos (consultas a herramientas,
 * silencios del cliente): miden otra cosa.
 */
export function medirTurnos(
  cliente: Segmento[],
  recepcionista: Segmento[],
  maximo = 4
): LatenciaDeLaLlamada {
  const turnos: TurnoMedido[] = [];
  const largas: TurnoMedido[] = [];
  let solapes = 0;
  for (const tramo of recepcionista) {
    const clienteHablando = cliente.some(
      (intervencion) =>
        intervencion.inicio < tramo.inicio && intervencion.fin > tramo.inicio
    );
    if (clienteHablando) {
      solapes++;
      continue;
    }
    const anteriores = cliente.filter(
      (intervencion) => intervencion.fin <= tramo.inicio
    );
    const ultima = anteriores[anteriores.length - 1];
    if (!ultima) continue;
    // Si la recepcionista ya habló después de esa intervención, este
    // tramo no le responde a ella.
    const yaRespondio = recepcionista.some(
      (otro) => otro.inicio >= ultima.fin && otro.inicio < tramo.inicio
    );
    if (yaRespondio) continue;
    const latencia = tramo.inicio - ultima.fin;
    (latencia <= maximo ? turnos : largas).push({
      finDelCliente: ultima.fin,
      inicioDeLaRecepcionista: tramo.inicio,
      latencia,
    });
  }
  return { turnos, largas, solapes };
}

/** Un mensaje de `Transcript.messages`. */
export interface MensajeDeLaTranscripcion {
  role: string;
  text?: string | null;
  /** Hora del reloj (ISO) a la que Telnyx registró el mensaje. */
  sentAt?: string | null;
}

export interface TurnoAnotado extends TurnoMedido {
  conHerramienta: boolean;
}

/**
 * Marca cada turno con si esperó a una herramienta (disponibilidad, un
 * recado): esa espera mide la herramienta, no la voz ni la transcripción.
 * Va por tiempo: el saludo del agente fija qué hora del reloj es el
 * segundo `inicioDelSaludo` de la grabación, y un turno esperó a una
 * herramienta si algún mensaje `tool` cae entre el fin del cliente y el
 * inicio de la respuesta, con `margen` segundos a cada lado. La hora de
 * los mensajes `tool` cuadra con el audio; la de los del agente no (unas
 * veces es el inicio de la frase y otras el final), y emparejar por orden
 * se descuadraba con cualquier ruido. Sin saludo con hora, devuelve null.
 */
export function anotarHerramientas(
  medida: LatenciaDeLaLlamada,
  mensajes: MensajeDeLaTranscripcion[],
  inicioDelSaludo: number,
  margen = 0.5
): TurnoAnotado[] | null {
  const saludo = mensajes.find(
    (mensaje) =>
      mensaje.role === "assistant" && mensaje.text?.trim() && mensaje.sentAt
  );
  if (!saludo?.sentAt) return null;
  const origen = Date.parse(saludo.sentAt) / 1000 - inicioDelSaludo;
  const herramientas = mensajes
    .filter((mensaje) => mensaje.role === "tool" && mensaje.sentAt)
    .map((mensaje) => Date.parse(mensaje.sentAt!) / 1000 - origen);
  return medida.turnos.map((turno) => ({
    ...turno,
    conHerramienta: herramientas.some(
      (momento) =>
        momento >= turno.finDelCliente - margen &&
        momento <= turno.inicioDeLaRecepcionista + margen
    ),
  }));
}

/** Percentil `p` (0–100) por el método del rango más cercano. */
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const posicion = Math.ceil((p / 100) * ordenados.length) - 1;
  return ordenados[Math.min(Math.max(posicion, 0), ordenados.length - 1)];
}

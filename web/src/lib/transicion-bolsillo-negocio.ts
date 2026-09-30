/**
 * La transición entre «En tu bolsillo» (`components/llamada-scroll.tsx`) y
 * «En tu negocio» (`components/en-tu-negocio.tsx` y su escena three.js) en
 * la portada (2026-09-30): las dos secciones son una sola tira continua.
 *
 *   «En tu bolsillo»          │ «En tu negocio»
 *   pasos ─── vuelco ─ cruce ─│─ zoom out ─ título ─ pasos
 *
 * - Vuelco: el teléfono se tumba (−90°), crece y se va a la esquina inferior
 *   derecha, hasta que solo se ve su esquina superior izquierda.
 * - Cruce: «En tu negocio» solapa a «En tu bolsillo» (margen negativo) y su
 *   escenario fijo se pone encima; el lienzo 3D se enciende con la tapa
 *   cerrada del portátil vista desde arriba, con su esquina justo donde está
 *   la del teléfono y con el mismo radio; el teléfono se apaga a la vez.
 * - Zoom out: la cámara se aleja de esa esquina hasta el encuadre del paso 1.
 * - Título: entra «En tu negocio» y la escena sigue como siempre.
 *
 * El cruce cae dentro del recorrido fijo de «En tu bolsillo» (antes de que su
 * escenario sticky se despegue), para que el teléfono no se mueva mientras se
 * funde. Todo se mide en vh de scroll; de aquí salen las alturas de las dos
 * secciones, el solape y los puntos del progreso (`p`, de 0 a 1) de cada una.
 */

/** Scroll, en vh, de cada tramo de «En tu bolsillo». */
export const BOLSILLO_VH = {
  /** Los tres pasos de la llamada (antes, toda la sección: 340 − 100). */
  pasos: 256,
  vuelco: 64,
  cruce: 16,
} as const;

/** Scroll, en vh, de cada tramo de «En tu negocio» que se añade delante. */
export const NEGOCIO_VH = {
  zoom: 64,
  /** Entrada del título; se solapa con el principio de los pasos. */
  titulo: 28,
  /** Los tres pasos del panel (antes, toda la sección: 360 − 100). */
  pasos: 260,
} as const;

const RECORRIDO_BOLSILLO =
  BOLSILLO_VH.pasos + BOLSILLO_VH.vuelco + BOLSILLO_VH.cruce;
const RECORRIDO_NEGOCIO =
  BOLSILLO_VH.cruce + NEGOCIO_VH.zoom + NEGOCIO_VH.pasos;

/** Alto de cada sección: su recorrido más la pantalla del escenario fijo. */
export const ALTO_BOLSILLO_VH = RECORRIDO_BOLSILLO + 100;
export const ALTO_NEGOCIO_VH = RECORRIDO_NEGOCIO + 100;
/**
 * Cuánto sube «En tu negocio» sobre «En tu bolsillo» (margen negativo): una
 * pantalla, para que su escenario se pegue arriba en cuanto empieza el
 * cruce, más el cruce, que transcurre con los dos escenarios fijos.
 */
export const SOLAPE_NEGOCIO_VH = 100 + BOLSILLO_VH.cruce;

/** Puntos del progreso (0–1) de «En tu bolsillo». */
export const BOLSILLO_P = {
  finPasos: BOLSILLO_VH.pasos / RECORRIDO_BOLSILLO,
  inicioCruce: (BOLSILLO_VH.pasos + BOLSILLO_VH.vuelco) / RECORRIDO_BOLSILLO,
} as const;

/** Puntos del progreso (0–1) de «En tu negocio». */
export const NEGOCIO_P = {
  finCruce: BOLSILLO_VH.cruce / RECORRIDO_NEGOCIO,
  finZoom: (BOLSILLO_VH.cruce + NEGOCIO_VH.zoom) / RECORRIDO_NEGOCIO,
  finTitulo:
    (BOLSILLO_VH.cruce + NEGOCIO_VH.zoom + NEGOCIO_VH.titulo) /
    RECORRIDO_NEGOCIO,
} as const;

/**
 * Dónde queda la esquina del teléfono tumbado (y luego la de la tapa), como
 * fracción del escenario: se ve el 68 % del ancho y el 30 % del alto, pegado
 * a la esquina inferior derecha.
 */
export const ESQUINA = { x: 0.32, y: 0.7 } as const;

/** Radio de las esquinas de la tapa del portátil (public/modelos/macbook.glb), en cm. */
export const RADIO_TAPA_CM = 1;

/** La esquina del teléfono tumbado, en px del escenario, con su radio. */
export type EsquinaTelefono = { x: number; y: number; radio: number };

let esquinaTelefono: EsquinaTelefono | null = null;
let negocioEnEscena = false;

/**
 * «En tu bolsillo» publica dónde deja la esquina del teléfono (y su radio)
 * cada vez que mide; la escena de «En tu negocio» lo lee para poner la
 * esquina de la tapa encima.
 */
export function publicarEsquinaTelefono(esquina: EsquinaTelefono | null) {
  esquinaTelefono = esquina;
}

export function leerEsquinaTelefono(): EsquinaTelefono | null {
  return esquinaTelefono;
}

/**
 * «En tu negocio» avisa de que va con la escena 3D (no la versión quieta):
 * solo entonces «En tu bolsillo» apaga el teléfono en el cruce y deja que el
 * portátil lo releve. Sin escena, se despide como antes.
 */
export function marcarNegocioEnEscena(activo: boolean) {
  negocioEnEscena = activo;
}

export function hayNegocioEnEscena() {
  return negocioEnEscena;
}

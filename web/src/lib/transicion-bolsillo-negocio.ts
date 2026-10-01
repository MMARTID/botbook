/**
 * La transición entre «En tu bolsillo» (`components/llamada-scroll.tsx`) y
 * «En tu negocio» (`components/en-tu-negocio.tsx` y su escena three.js) en
 * la portada: las dos secciones son una sola tira continua.
 *
 *   «En tu bolsillo»                    │ «En tu negocio»
 *   pasos ─── vuelco ─ estirado ─ cruce ─│─ zoom out (entra el título) ─ pasos
 *
 * - Vuelco: el teléfono se tumba (−90°) casi en su sitio, crece un poco y
 *   su pantalla se apaga: queda una pieza negra apaisada.
 * - Estirado: sobre la silueta del teléfono nace un rectángulo negro con sus
 *   mismas esquinas, que se estira hasta la forma y el sitio de la pantalla
 *   del portátil (`pantallaDelPortatil`). Lo pinta «En tu bolsillo», con el
 *   mismo muelle que mueve el teléfono: por eso nunca se despegan.
 * - Cruce: «En tu negocio» solapa a «En tu bolsillo» (margen negativo) y su
 *   escenario fijo se pone encima, con su pantalla negra justo donde acabó el
 *   rectángulo y la cámara quieta. Alrededor aparece, poco a poco, el
 *   portátil 3D ya abierto.
 * - Zoom out: la pantalla del portátil se enciende con el panel y la cámara
 *   se aleja hasta el encuadre del paso 1; a la vez entra el texto de «En tu
 *   negocio», para que el escenario no se quede sin texto.
 *
 * Cada tramo tiene scroll de sobra (una muesca de rueda son ~13 vh): con
 * tramos de 16 vh, como al principio, el relevo se resolvía de golpe.
 *
 * (Hasta el 2026-10-01 el teléfono se iba a una esquina de la pantalla y se
 * cruzaba con la tapa cerrada vista desde arriba: el escenario pasaba mucho
 * rato casi vacío y el cambio de teléfono a bloque gris resultaba brusco.)
 *
 * El cruce cae dentro del recorrido fijo de «En tu bolsillo» (antes de que su
 * escenario sticky se despegue), para que nada se mueva debajo mientras se
 * funde. Todo se mide en vh de scroll; de aquí salen las alturas de las dos
 * secciones, el solape y los puntos del progreso (`p`, de 0 a 1) de cada una.
 */

/** Scroll, en vh, de cada tramo de «En tu bolsillo». */
export const BOLSILLO_VH = {
  /** Los tres pasos de la llamada (antes, toda la sección: 340 − 100). */
  pasos: 256,
  vuelco: 60,
  estirado: 32,
  cruce: 36,
} as const;

/** Scroll, en vh, de cada tramo de «En tu negocio» que se añade delante. */
export const NEGOCIO_VH = {
  zoom: 72,
  /** Los tres pasos del panel (antes, toda la sección: 360 − 100). */
  pasos: 260,
} as const;

const RECORRIDO_BOLSILLO =
  BOLSILLO_VH.pasos +
  BOLSILLO_VH.vuelco +
  BOLSILLO_VH.estirado +
  BOLSILLO_VH.cruce;
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
  finVuelco: (BOLSILLO_VH.pasos + BOLSILLO_VH.vuelco) / RECORRIDO_BOLSILLO,
  inicioCruce:
    (BOLSILLO_VH.pasos + BOLSILLO_VH.vuelco + BOLSILLO_VH.estirado) /
    RECORRIDO_BOLSILLO,
} as const;

/** Puntos del progreso (0–1) de «En tu negocio». */
export const NEGOCIO_P = {
  finCruce: BOLSILLO_VH.cruce / RECORRIDO_NEGOCIO,
  finZoom: (BOLSILLO_VH.cruce + NEGOCIO_VH.zoom) / RECORRIDO_NEGOCIO,
  /** El texto entra durante el zoom out: del 35 % al 85 % de su recorrido. */
  inicioTitulo:
    (BOLSILLO_VH.cruce + NEGOCIO_VH.zoom * 0.35) / RECORRIDO_NEGOCIO,
  finTitulo: (BOLSILLO_VH.cruce + NEGOCIO_VH.zoom * 0.85) / RECORRIDO_NEGOCIO,
} as const;

/**
 * La pantalla HTML del portátil (`.mx` de «En tu negocio»), en px CSS antes
 * de proyectarla, y el radio de sus esquinas de arriba y de abajo (el de su
 * CSS, `en-tu-negocio.css`).
 */
export const PANTALLA_HTML = {
  ancho: 1200,
  alto: 776,
  radioArriba: 18,
  radioAbajo: 12,
} as const;

/**
 * Al empezar el cruce, la pantalla del portátil es así de más ancha que la
 * silueta del teléfono tumbado: lo envuelve con un poco de negro alrededor.
 */
export const HOLGURA_PANTALLA = 1.06;

/**
 * Dónde queda el teléfono tumbado, en px del escenario: su centro, y el
 * ancho, el alto y el radio de las esquinas de su silueta (canto a canto, sin
 * los botones), ya apaisada.
 */
export type TelefonoTumbado = {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  radio: number;
};

/** Un rectángulo en px del escenario, por su centro. */
export type Rectangulo = { x: number; y: number; ancho: number; alto: number };

/**
 * Dónde está la pantalla del portátil al empezar el cruce: centrada en el
 * teléfono tumbado y HOLGURA_PANTALLA veces más ancha, con la proporción de
 * la pantalla HTML. La escena de «En tu negocio» pone ahí su cámara (de
 * frente, así que la pantalla se ve como un rectángulo sin deformar) y «En
 * tu bolsillo» estira hasta ahí su rectángulo negro.
 */
export function pantallaDelPortatil(t: TelefonoTumbado): Rectangulo {
  const ancho = t.ancho * HOLGURA_PANTALLA;
  return {
    x: t.x,
    y: t.y,
    ancho,
    alto: (ancho * PANTALLA_HTML.alto) / PANTALLA_HTML.ancho,
  };
}

let telefono: TelefonoTumbado | null = null;
let negocioEnEscena = false;

/**
 * «En tu bolsillo» publica dónde deja el teléfono tumbado cada vez que mide;
 * la escena de «En tu negocio» lo lee para poner encima la pantalla del
 * portátil, centrada en él y un poco más ancha.
 */
export function publicarTelefono(t: TelefonoTumbado | null) {
  telefono = t;
}

export function leerTelefono(): TelefonoTumbado | null {
  return telefono;
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

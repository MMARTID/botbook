/**
 * Un único scroll suavizado para las secciones de la portada con escenario
 * fijo («En tu bolsillo» y «En tu negocio», ver
 * `lib/transicion-bolsillo-negocio.ts`). Todo lo que se mueve con el scroll
 * en ellas cuelga de este valor, no del scroll crudo: así una muesca de rueda
 * se convierte en un deslizamiento en vez de un salto, y las dos secciones se
 * mueven como una sola pieza en el relevo del teléfono al portátil (antes cada
 * una suavizaba a su manera y se despegaban).
 *
 * El suavizado es exponencial y va por tiempo, no por fotograma: llega igual
 * de rápido a 30, 60 o 120 fps (Safari baja a 30 en modo de bajo consumo, y
 * los ProMotion van a 120). Solo corre mientras hay alguien escuchando y el
 * valor no ha llegado todavía al scroll real.
 */

/** Constante de tiempo, en segundos: a los 0,3 s queda ~15 % del camino. */
const TAU = 0.16;
/**
 * Con un salto de más de este número de pantallas (un ancla del menú, el
 * botón de inicio…) no se desliza: se llega de golpe, que lo de en medio no
 * se ve.
 */
const SALTO_PANTALLAS = 2.5;

type Oyente = (y: number) => void;

const oyentes = new Set<Oyente>();
let actual = 0;
let raf = 0;
let anterior = 0;

function avanzar(ahora: number) {
  const objetivo = window.scrollY;
  const dt = anterior ? Math.min(0.1, (ahora - anterior) / 1000) : 1 / 60;
  anterior = ahora;
  if (Math.abs(objetivo - actual) > SALTO_PANTALLAS * window.innerHeight) {
    actual = objetivo;
  } else {
    actual += (objetivo - actual) * (1 - Math.exp(-dt / TAU));
    if (Math.abs(objetivo - actual) < 0.25) actual = objetivo;
  }
  oyentes.forEach((oyente) => oyente(actual));
  if (actual !== objetivo) {
    raf = requestAnimationFrame(avanzar);
  } else {
    raf = 0;
    anterior = 0;
  }
}

function despertar() {
  if (!raf) raf = requestAnimationFrame(avanzar);
}

/**
 * Escucha el scroll suavizado (en px, como `window.scrollY`). Llama al
 * oyente enseguida con el valor actual y en cada fotograma en que cambie.
 * Devuelve la baja.
 */
export function escucharScrollSuave(oyente: Oyente): () => void {
  if (oyentes.size === 0) {
    actual = window.scrollY;
    window.addEventListener("scroll", despertar, { passive: true });
    window.addEventListener("resize", despertar);
  }
  oyentes.add(oyente);
  oyente(actual);
  despertar();
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size > 0) return;
    window.removeEventListener("scroll", despertar);
    window.removeEventListener("resize", despertar);
    cancelAnimationFrame(raf);
    raf = 0;
    anterior = 0;
  };
}

/** El scroll suavizado ahora mismo (en px). */
export function scrollSuave(): number {
  return oyentes.size > 0 ? actual : window.scrollY;
}

/**
 * Progreso (0–1) de una sección alta con escenario fijo, sobre el scroll
 * suavizado: 0 cuando su borde de arriba toca el de la pantalla, 1 cuando lo
 * hace el de abajo (como `useScroll` con `["start start", "end end"]`).
 * `y` es el scroll suavizado y el resto se mide con el scroll real.
 */
export function progresoDe(seccion: HTMLElement, y: number): number {
  const inicio = seccion.getBoundingClientRect().top + window.scrollY;
  const recorrido = seccion.offsetHeight - window.innerHeight;
  if (recorrido <= 0) return 0;
  return Math.min(1, Math.max(0, (y - inicio) / recorrido));
}

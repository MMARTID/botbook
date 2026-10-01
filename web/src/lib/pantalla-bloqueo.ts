import { BLOQUEO_VH } from "@/lib/transicion-bolsillo-negocio";

/**
 * Por debajo de este ancho de ventana los avisos de la pantalla de bloqueo
 * van apilados (el nuevo encima, los anteriores asomando), como en un
 * iPhone: en lista no caben. Lo leen igual las dos copias de la pantalla.
 */
const ANCHO_PILA = 640;

/**
 * Anima la pantalla de bloqueo (`components/pantalla-bloqueo.tsx`) para un
 * punto del relevo (`vh`, ver `vhRelevoDesdeBolsillo` /
 * `vhRelevoDesdeNegocio`): la hora y cada notificación aparecen en su tramo
 * de `BLOQUEO_VH`, las notificaciones bajando un poco, como llegan en un
 * Mac. Es la misma función para las dos copias de la pantalla, así que van
 * siempre a la par. Solo toca opacidad y transform: el hueco de cada pieza
 * está reservado desde el principio y nada se recoloca al aparecer.
 *
 * En pantallas estrechas (`data-pila`) los avisos ocupan el mismo sitio: el
 * que llega se pone encima y los anteriores se encogen y asoman por debajo.
 */
export function pintarBloqueo(raiz: HTMLElement, vh: number) {
  const pila = window.innerWidth < ANCHO_PILA;
  raiz.toggleAttribute("data-pila", pila);

  const reloj = raiz.querySelector<HTMLElement>('[data-bloqueo="reloj"]');
  if (reloj) {
    const t = aparecer(vh, BLOQUEO_VH.reloj);
    reloj.style.opacity = String(t);
    reloj.style.transform = `scale(${(0.96 + 0.04 * t).toFixed(4)})`;
  }

  const avisos = BLOQUEO_VH.avisos.map((tramo) => aparecer(vh, tramo));
  avisos.forEach((t, i) => {
    const el = raiz.querySelector<HTMLElement>(`[data-bloqueo="aviso-${i}"]`);
    if (!el) return;
    // Cuánto lo tapan los que han llegado después (solo en la pila).
    const tapado = pila ? avisos.slice(i + 1).reduce((a, b) => a + b, 0) : 0;
    const bajada = -14 * (1 - t) + 9 * tapado;
    const escala = (0.97 + 0.03 * t) * (1 - 0.05 * tapado);
    el.style.opacity = String(t * (1 - 0.35 * Math.min(1, tapado)));
    el.style.zIndex = String(i + 1);
    // El desplazamiento, con el mismo mínimo legible que el resto (ver el
    // CSS): `max` sobre el valor absoluto y luego el signo.
    const signo = bajada < 0 ? -1 : 1;
    const cuanto = Math.abs(bajada);
    el.style.transform = `translateY(calc(${signo} * max(calc(var(--min) * ${(cuanto * 0.5).toFixed(2)}), calc(var(--u, 1px) * ${cuanto.toFixed(2)})))) scale(${escala.toFixed(4)})`;
  });
}

/**
 * Cuánto se ha desbloqueado ya la pantalla (0–1) en un punto del relevo: la
 * pantalla de bloqueo se desvanece y deja ver el panel.
 */
export function desbloqueo(vh: number): number {
  const [a, b] = BLOQUEO_VH.desbloqueo;
  return suave(acotar((vh - a) / (b - a)));
}

function aparecer(vh: number, [a, b]: readonly [number, number]): number {
  return suave(acotar((vh - a) / (b - a)));
}

const acotar = (v: number) => Math.min(1, Math.max(0, v));
/** Ease-in-out cúbico. */
const suave = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

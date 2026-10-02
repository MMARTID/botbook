import { BLOQUEO_VH } from "@/lib/transicion-bolsillo-negocio";

/**
 * Anima la pantalla de bloqueo (`components/pantalla-bloqueo.tsx`) para un
 * punto del relevo (`vh`, ver `vhRelevoDesdeBolsillo` /
 * `vhRelevoDesdeNegocio`): la hora y el aviso aparecen en su tramo de
 * `BLOQUEO_VH`, el aviso bajando un poco, como llega una notificación en un
 * Mac. Es la misma función para las dos copias de la pantalla, así que van
 * siempre a la par. Solo toca opacidad y transform: el hueco de cada pieza
 * está reservado desde el principio y nada se recoloca al aparecer.
 */
export function pintarBloqueo(raiz: HTMLElement, vh: number) {
  const reloj = raiz.querySelector<HTMLElement>('[data-bloqueo="reloj"]');
  if (reloj) {
    const t = aparecer(vh, BLOQUEO_VH.reloj);
    reloj.style.opacity = String(t);
    reloj.style.transform = `scale(${(0.96 + 0.04 * t).toFixed(4)})`;
  }

  BLOQUEO_VH.avisos.forEach((tramo, i) => {
    const el = raiz.querySelector<HTMLElement>(`[data-bloqueo="aviso-${i}"]`);
    if (!el) return;
    const t = aparecer(vh, tramo);
    // Baja 14 unidades (con el mismo mínimo legible que el resto, ver el
    // CSS) mientras aparece.
    const cuanto = 14 * (1 - t);
    el.style.opacity = String(t);
    el.style.transform = `translateY(calc(-1 * max(calc(var(--min) * ${(cuanto * 0.5).toFixed(2)}), calc(var(--u, 1px) * ${cuanto.toFixed(2)})))) scale(${(0.97 + 0.03 * t).toFixed(4)})`;
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

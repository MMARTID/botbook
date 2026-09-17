/**
 * Física de la tela de `HeroHilos`, separada del dibujo para poder probarla
 * sin canvas: cada punto de cada hilo es una masa con muelle a reposo,
 * tensión con sus dos vecinos del hilo y acoplamiento con el mismo punto de
 * los hilos contiguos, más fricción. El cursor empuja y arrastra.
 *
 * Dos decisiones que no son de gusto sino de estabilidad numérica:
 *
 * 1. Los vecinos se leen SIEMPRE del estado anterior (Jacobi, doble buffer),
 *    nunca del ya actualizado en el mismo paso. La primera versión
 *    actualizaba en el sitio (Gauss-Seidel) y era inestable por debajo de
 *    ~60 fps: en Safari a 30 fps (modo de bajo consumo, pestaña de fondo)
 *    la tela explotaba en segundos. Medido: con dt = 1/30 una sacudida de
 *    10 px crece a 290 px en 6 s; con Jacobi se apaga a 0.
 * 2. El paso de integración es fijo (`PASO_FISICA`) y por fotograma se dan
 *    tantos subpasos como tiempo haya pasado, con tope. Así el resultado no
 *    depende de la tasa de refresco del navegador: a 144 fps y a 30 fps la
 *    tela se comporta igual, y en un fotograma muy lento se pierde tiempo
 *    (cámara lenta) en vez de estabilidad.
 */

/** Unidades: px, segundos.
 * - RIGIDEZ: muelle de cada punto hacia su reposo (1/s²). ~1 Hz de oscilación.
 * - TENSION: acoplamiento con los dos vecinos del mismo hilo; es lo que hace
 *   que una sacudida viaje por el hilo en vez de quedarse donde se dio.
 * - TELA: acoplamiento con el mismo punto de los hilos contiguos; sin esto
 *   cada hilo iría por libre y no parecería tela.
 * - AMORTIGUACION: fricción (1/s). Con ~3,5 la tela da un par de balanceos
 *   antes de asentarse; más alto y responde como goma, más bajo y no para.
 * Con Jacobi y paso fijo el límite de estabilidad es
 * PASO_FISICA·√(RIGIDEZ + 4·TENSION + 4·TELA) < 2; con 1/120 s queda en ≈0,23. */
export const RIGIDEZ = 40;
export const TENSION = 120;
export const TELA = 55;
export const AMORTIGUACION = 3.5;
export const PASO_FISICA = 1 / 120;
/** Subpasos por fotograma como máximo: 4 cubren hasta 30 fps sin perder
 * tiempo; por debajo la tela va a cámara lenta, que es lo menos malo. */
export const SUBPASOS_MAXIMOS = 4;

/** Cursor: radio de influencia, empuje (px/s²) que aparta los hilos del
 * cursor y arrastre que convierte la velocidad vertical del cursor (px/s) en
 * aceleración de los puntos cercanos — la estela al pasar rápido. */
export const RADIO_RATON = 190;
export const EMPUJE_RATON = 1500;
export const ARRASTRE_RATON = 0.55;
export const VELOCIDAD_RATON_MAXIMA = 2600;

export type Tela = {
  hilos: number;
  puntos: number;
  /** Desplazamiento de cada punto respecto a su reposo, indexado por
   * hilo·puntos + punto. */
  desplazamiento: Float32Array;
  velocidad: Float32Array;
  /** Buffer de escritura del paso siguiente; se intercambia con
   * `desplazamiento` al final de cada paso. */
  siguiente: Float32Array;
  /** Altura con la que se pintó cada punto en el último fotograma; el
   * dibujo la rellena y la física la usa para medir distancias al cursor. */
  ultimaAltura: Float32Array;
  /** Tiempo pendiente de simular, para los subpasos de paso fijo. */
  acumulado: number;
};

export type Cursor = {
  x: number;
  y: number;
  /** Velocidad vertical del cursor, px/s. */
  vy: number;
  /** Cuánto influye el cursor, 0 (ausente) a 1. */
  fuerza: number;
};

export function crearTela(hilos: number, puntos: number): Tela {
  const total = hilos * puntos;
  return {
    hilos,
    puntos,
    desplazamiento: new Float32Array(total),
    velocidad: new Float32Array(total),
    siguiente: new Float32Array(total),
    ultimaAltura: new Float32Array(total),
    acumulado: 0,
  };
}

function suavizar(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Un paso de `h` segundos. Lee de `desplazamiento`, escribe en `siguiente`
 * y los intercambia. */
export function pasoTela(tela: Tela, h: number, cursor: Cursor, pasoX: number): void {
  const { hilos, puntos, desplazamiento: actual, velocidad, siguiente, ultimaAltura } = tela;
  const friccion = Math.exp(-AMORTIGUACION * h);
  const conCursor = cursor.fuerza > 0.001;
  const radio2 = RADIO_RATON * RADIO_RATON;
  const vy = Math.max(-VELOCIDAD_RATON_MAXIMA, Math.min(VELOCIDAD_RATON_MAXIMA, cursor.vy));

  for (let i = 0; i < hilos; i++) {
    const fila = i * puntos;
    for (let k = 0; k < puntos; k++) {
      const idx = fila + k;
      const d = actual[idx];
      let aceleracion = -RIGIDEZ * d;

      // Tensión a lo largo del hilo y acoplamiento con los hilos vecinos,
      // siempre sobre el estado anterior.
      if (k > 0) aceleracion += TENSION * (actual[idx - 1] - d);
      if (k < puntos - 1) aceleracion += TENSION * (actual[idx + 1] - d);
      if (i > 0) aceleracion += TELA * (actual[idx - puntos] - d);
      if (i < hilos - 1) aceleracion += TELA * (actual[idx + puntos] - d);

      if (conCursor) {
        const dx = k * pasoX - cursor.x;
        const dy = ultimaAltura[idx] - cursor.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < radio2) {
          const f = suavizar(1 - Math.sqrt(dist2) / RADIO_RATON) * cursor.fuerza;
          // Empuje vertical continuo: cerca de dy = 0 se atenúa en vez de
          // saltar de signo, para que el hilo bajo el cursor no parpadee.
          aceleracion += (dy / Math.max(Math.abs(dy), 16)) * f * EMPUJE_RATON;
          // Arrastre: el cursor se lleva la tela en la dirección en la que
          // se mueve, y la tela vuelve sola. Es la estela.
          aceleracion += vy * ARRASTRE_RATON * f;
        }
      }

      const v = (velocidad[idx] + aceleracion * h) * friccion;
      velocidad[idx] = v;
      siguiente[idx] = d + v * h;
    }
  }

  tela.desplazamiento = siguiente;
  tela.siguiente = actual;
}

/** Avanza la tela `dt` segundos en subpasos de `PASO_FISICA`. Devuelve
 * cuántos pasos se han dado (0 si no había tiempo acumulado suficiente). */
export function avanzarTela(tela: Tela, dt: number, cursor: Cursor, pasoX: number): number {
  tela.acumulado += Math.max(0, dt);
  let pasos = 0;
  while (tela.acumulado >= PASO_FISICA && pasos < SUBPASOS_MAXIMOS) {
    pasoTela(tela, PASO_FISICA, cursor, pasoX);
    tela.acumulado -= PASO_FISICA;
    pasos++;
  }
  // Fotograma demasiado lento: se tira el resto en vez de arrastrar una
  // deuda que se pagaría de golpe en el siguiente.
  if (pasos === SUBPASOS_MAXIMOS) tela.acumulado = 0;
  return pasos;
}

/** Mayor desplazamiento absoluto de la tela, en px. Para tests y ajustes. */
export function desplazamientoMaximo(tela: Tela): number {
  let maximo = 0;
  for (let q = 0; q < tela.desplazamiento.length; q++) {
    const v = Math.abs(tela.desplazamiento[q]);
    if (v > maximo) maximo = v;
  }
  return maximo;
}

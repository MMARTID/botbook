"use client";

import { useEffect, useRef } from "react";

/**
 * Hilos de voz: el fondo animado del hero.
 *
 * Sustituye al pulso de llamada entrante (anillos concéntricos + pastillas
 * rotando), que vivía en una columna aparte a la derecha del titular. Aquí no
 * hay ninguna pieza que leer: un haz de hilos finos cruza el hero en diagonal
 * por detrás del texto y se mece despacio como tela; cada pocos segundos un
 * pulso morado recorre uno de ellos — una llamada que entra por la línea.
 *
 * Referencia: la cinta de ondas de heydiga.com (canvas 2D, 60 senos apilados
 * que reaccionan al ratón). Se parte de la misma idea —líneas finas casi
 * invisibles con volumen por acumulación— pero con otra geometría y otro
 * movimiento: ruido de valor en vez de suma de senos (la tela se arruga, no
 * ondula), haz en diagonal en vez de cinta horizontal, y los pulsos como
 * único elemento de color.
 *
 * Reglas heredadas de `particle-mouse-layer`: nunca se lee `scrollY` (la
 * animación no depende del desplazamiento, así que no hay nada que se pueda
 * desincronizar); el ratón solo se escucha con `pointer: fine`; con
 * `prefers-reduced-motion` se pinta un solo fotograma quieto, sin pulsos, y
 * no arranca ningún bucle. El bucle también se para con el hero fuera de
 * pantalla (IntersectionObserver) y con la pestaña oculta.
 */

/** Separación horizontal entre puntos de un hilo, en px CSS. Con el ruido tan
 * suave que se usa, 12 px bastan para que el trazo se vea continuo. */
const PASO_X = 12;

/** Inclinación del haz: sube hacia la derecha. En un hero de 1440 px son
 * unos 150 px de desnivel — se nota como diagonal sin cruzar el titular en
 * ángulo. */
const PENDIENTE = -0.105;

/** Opacidad del hilo central del haz (los demás bajan en campana hasta 0).
 * Sobre blanco, por debajo de ~0.1 los hilos desaparecen en cuanto la
 * pantalla no es retina; por encima de ~0.2 compiten con el titular. */
const OPACIDAD_HILO = 0.3;

/** Radio y empuje de la repulsión al ratón, en px. */
const RADIO_RATON = 170;
const EMPUJE_RATON = 46;

/** Pulsos: cuántos a la vez como máximo y cada cuánto nace uno (segundos). */
const PULSOS_MAXIMOS = 4;
const PAUSA_PULSO_MIN = 1.3;
const PAUSA_PULSO_MAX = 2.6;
/** Ancho del pulso, como fracción del ancho del hero. */
const ANCHO_PULSO = 0.07;

type Pulso = { hilo: number; u: number; velocidad: number };

/** "#rrggbb" a "r, g, b". */
function hexARgb(hex: string): string {
  const limpio = hex.replace("#", "");
  const r = parseInt(limpio.slice(0, 2), 16);
  const g = parseInt(limpio.slice(2, 4), 16);
  const b = parseInt(limpio.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function suavizar(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Hash entero determinista → [0, 1). Sin tablas ni estado: el mismo par
 * (ix, iy) devuelve siempre el mismo valor, que es lo que hace que el ruido
 * sea coherente de un fotograma al siguiente. */
function hash(ix: number, iy: number): number {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

/** Ruido de valor 2D interpolado con smoothstep → [0, 1). Una sola octava
 * basta: se combinan dos llamadas con escalas distintas donde hace falta. */
function ruido(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = suavizar(x - ix);
  const fy = suavizar(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  const arriba = a + (b - a) * fx;
  const abajo = c + (d - c) * fx;
  return arriba + (abajo - arriba) * fy;
}

function cuantosHilos(ancho: number): number {
  return Math.max(30, Math.min(56, Math.round(ancho / 25)));
}

export function HeroHilos({ color = "#8b5cf6" }: { color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext("2d");
    if (!contexto) return;

    const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conRaton = window.matchMedia("(pointer: fine)").matches && !movimientoReducido;
    const rgbPulso = hexARgb(color);

    let ancho = 0;
    let alto = 0;
    let hilos = 0;
    let puntos = 0;
    /** Alturas de los puntos del hilo que se está dibujando; se reutiliza. */
    let alturas = new Float32Array(0);
    let animacion = 0;
    let tiempo = 0;
    let ultimoFotograma = 0;
    let visible = true;
    let pulsos: Pulso[] = [];
    let proximoPulso = 0.6;
    /** Posición real del cursor y la suavizada que usa el dibujo: el empuje
     * sigue al ratón con un pequeño retraso para que no dé tirones. */
    const objetivoRaton = { x: -9999, y: -9999 };
    const raton = { x: -9999, y: -9999 };

    function medir() {
      const caja = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = Math.max(1, Math.round(caja.width));
      alto = Math.max(1, Math.round(caja.height));
      canvas!.width = Math.round(ancho * dpr);
      canvas!.height = Math.round(alto * dpr);
      contexto!.setTransform(dpr, 0, 0, dpr, 0, 0);
      hilos = cuantosHilos(ancho);
      puntos = Math.ceil(ancho / PASO_X) + 2;
      if (alturas.length < puntos) alturas = new Float32Array(puntos);
    }

    /** Altura del hilo `i` en la abscisa `x` para el instante `t`. */
    function alturaHilo(i: number, x: number, t: number): number {
      const u = x / ancho;
      const centro = (hilos - 1) / 2;
      // El haz respira: se estrecha y se abre a lo largo del hero, como una
      // cinta que se retuerce. Es lo que le da volumen al conjunto.
      const grosor = 0.3 + 1.3 * ruido(u * 1.6 + t * 0.055, 21.7);
      const separacion = Math.min(9, Math.max(5, alto / (hilos * 1.2)));
      const base =
        alto * 0.5 + (i - centro) * separacion * grosor + PENDIENTE * (x - ancho / 2);
      // Dos escalas de ruido: la larga arruga la tela entera (coherente entre
      // hilos vecinos gracias al paso pequeño en `i`, pero no tanto como para
      // que nunca se crucen: donde se cruzan el trazo se acumula y el haz gana
      // cuerpo), la corta la hace temblar.
      const arruga = ruido(u * 2.3 + t * 0.09, i * 0.09 + 3.1) - 0.5;
      const temblor = ruido(u * 6 + t * 0.16 + 7.7, i * 0.14) - 0.5;
      let y = base + arruga * 180 + temblor * 36;

      if (conRaton) {
        const dx = x - raton.x;
        const dy = y - raton.y;
        const d = Math.hypot(dx, dy);
        if (d < RADIO_RATON) {
          const fuerza = suavizar(1 - d / RADIO_RATON);
          // Empuje vertical continuo: cerca de dy = 0 se atenúa en vez de
          // saltar de signo, para que el hilo bajo el cursor no parpadee.
          y += (dy / Math.max(Math.abs(dy), 14)) * fuerza * EMPUJE_RATON;
        }
      }
      return y;
    }

    function dibujarHilo(i: number, t: number) {
      for (let k = 0; k < puntos; k++) alturas[k] = alturaHilo(i, k * PASO_X, t);

      // Campana de opacidad: los hilos del centro del haz se ven, los de los
      // bordes se funden con el fondo. Por eso el haz no tiene contorno.
      const campana = Math.sin((i / (hilos - 1)) * Math.PI);
      contexto!.beginPath();
      contexto!.moveTo(0, alturas[0]);
      for (let k = 1; k < puntos; k++) contexto!.lineTo(k * PASO_X, alturas[k]);
      contexto!.strokeStyle = `rgba(10, 10, 10, ${(OPACIDAD_HILO * campana).toFixed(3)})`;
      contexto!.lineWidth = 1.1;
      contexto!.stroke();

      for (const pulso of pulsos) {
        if (pulso.hilo !== i) continue;
        dibujarPulso(pulso);
      }
    }

    /** El pulso es el tramo del hilo alrededor de `u`, trazado con un
     * degradado que va de transparente a color y vuelta: así se ve como un
     * paquete que viaja por la línea y no como un punto pegado encima. */
    function dibujarPulso(pulso: Pulso) {
      const centroX = pulso.u * ancho;
      const mitad = ANCHO_PULSO * ancho;
      const desde = Math.max(0, Math.floor((centroX - mitad) / PASO_X));
      const hasta = Math.min(puntos - 1, Math.ceil((centroX + mitad) / PASO_X));
      if (hasta - desde < 2) return;

      const degradado = contexto!.createLinearGradient(centroX - mitad, 0, centroX + mitad, 0);
      degradado.addColorStop(0, `rgba(${rgbPulso}, 0)`);
      degradado.addColorStop(0.5, `rgba(${rgbPulso}, 0.9)`);
      degradado.addColorStop(1, `rgba(${rgbPulso}, 0)`);

      contexto!.beginPath();
      contexto!.moveTo(desde * PASO_X, alturas[desde]);
      for (let k = desde + 1; k <= hasta; k++) contexto!.lineTo(k * PASO_X, alturas[k]);
      // Halo ancho y tenue debajo, trazo fino encima: da luz sin recurrir a
      // shadowBlur, que es caro por fotograma.
      contexto!.strokeStyle = degradado;
      contexto!.lineWidth = 7;
      contexto!.globalAlpha = 0.16;
      contexto!.stroke();
      contexto!.globalAlpha = 1;
      contexto!.lineWidth = 1.8;
      contexto!.stroke();
    }

    function avanzarPulsos(dt: number) {
      for (const pulso of pulsos) pulso.u += pulso.velocidad * dt;
      pulsos = pulsos.filter((pulso) => pulso.u < 1 + ANCHO_PULSO);

      proximoPulso -= dt;
      if (proximoPulso <= 0 && pulsos.length < PULSOS_MAXIMOS) {
        // Nacen en el tercio central del haz, donde los hilos se ven: un
        // pulso por un hilo casi transparente parecería flotar en el vacío.
        const margen = Math.floor(hilos * 0.28);
        pulsos.push({
          hilo: margen + Math.floor(Math.random() * (hilos - margen * 2)),
          u: -ANCHO_PULSO,
          velocidad: 0.26 + Math.random() * 0.14,
        });
        proximoPulso = PAUSA_PULSO_MIN + Math.random() * (PAUSA_PULSO_MAX - PAUSA_PULSO_MIN);
      }
    }

    function pintar(t: number) {
      contexto!.clearRect(0, 0, ancho, alto);
      for (let i = 0; i < hilos; i++) dibujarHilo(i, t);
    }

    function fotograma(ahoraMs: number) {
      const ahora = ahoraMs / 1000;
      // Tras una pausa larga (pestaña oculta) el salto se recorta: la tela
      // retoma donde estaba en vez de dar un brinco.
      const dt = ultimoFotograma ? Math.min(ahora - ultimoFotograma, 0.05) : 0;
      ultimoFotograma = ahora;
      tiempo += dt;

      raton.x += (objetivoRaton.x - raton.x) * 0.14;
      raton.y += (objetivoRaton.y - raton.y) * 0.14;

      avanzarPulsos(dt);
      pintar(tiempo);
      animacion = window.requestAnimationFrame(fotograma);
    }

    function detener() {
      if (!animacion) return;
      window.cancelAnimationFrame(animacion);
      animacion = 0;
      ultimoFotograma = 0;
    }

    function arrancar() {
      if (animacion || movimientoReducido || !visible || document.hidden) return;
      animacion = window.requestAnimationFrame(fotograma);
    }

    function alMoverRaton(evento: MouseEvent) {
      const caja = canvas!.getBoundingClientRect();
      objetivoRaton.x = evento.clientX - caja.left;
      objetivoRaton.y = evento.clientY - caja.top;
    }

    function alSalirRaton() {
      objetivoRaton.x = -9999;
      objetivoRaton.y = -9999;
    }

    function alCambiarVisibilidad() {
      if (document.hidden) detener();
      else arrancar();
    }

    medir();
    if (movimientoReducido) {
      pintar(0);
    } else {
      arrancar();
    }

    // El canvas mide lo que mide el hero (no la ventana): si el titular
    // cambia de líneas al redimensionar, el hero cambia de alto y el haz se
    // recentra con él.
    const observadorTamano = new ResizeObserver(() => {
      medir();
      if (movimientoReducido) pintar(0);
    });
    observadorTamano.observe(canvas);

    const observadorVisibilidad = new IntersectionObserver((entradas) => {
      visible = entradas.some((entrada) => entrada.isIntersecting);
      if (visible) arrancar();
      else detener();
    });
    observadorVisibilidad.observe(canvas);

    if (conRaton) {
      window.addEventListener("mousemove", alMoverRaton, { passive: true });
      document.addEventListener("mouseleave", alSalirRaton);
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      detener();
      observadorTamano.disconnect();
      observadorVisibilidad.disconnect();
      if (conRaton) {
        window.removeEventListener("mousemove", alMoverRaton);
        document.removeEventListener("mouseleave", alSalirRaton);
      }
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [color]);

  // Solo desde `md`: en móvil el hero es todo titular y no queda hueco donde
  // un fondo aporte algo — y con `display: none` el IntersectionObserver
  // nunca lo da por visible, así que el bucle ni arranca.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full md:block"
      data-testid="hero-hilos"
    />
  );
}

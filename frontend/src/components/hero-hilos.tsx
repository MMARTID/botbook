"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useVelocity } from "framer-motion";

import { avanzarTela, crearTela, type Cursor, type Tela } from "@/components/hero-hilos-fisica";

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
 * El ratón no desplaza los hilos "a pelo" como en la referencia (un empuje
 * proporcional a la distancia que desaparece en cuanto el cursor se va): la
 * tela es un campo masa-muelle (`hero-hilos-fisica.ts`, con paso fijo y
 * doble buffer para que sea estable a cualquier tasa de refresco — en Safari
 * a 30 fps la primera versión explotaba). El cursor empuja y, si va rápido,
 * arrastra; la tela responde con inercia, la perturbación viaja por el hilo
 * como una onda y se asienta sola. El cursor en sí se sigue con un muelle de
 * framer-motion (`useSpring`) y de ahí sale su velocidad (`useVelocity`),
 * leídas cada fotograma sin re-render. Los hilos que tocas se encienden en
 * el acento.
 *
 * Si en algún Safari se ve "a tirones", medir antes de tocar nada con
 * `tests/manual/bench-hero.html`: el 2026-09-17 se comprobó que Safari capa
 * `requestAnimationFrame` a 15 fps con el Modo de bajo consumo de macOS y a
 * 30 fps en según qué monitor, con cualquier técnica (canvas 2D o WebGL dan
 * los mismos fps); esta capa cuesta ~0,6 ms de CPU por fotograma en Safari.
 * Para esos casos hay un modo ligero: si en una ventana de 2 s la mayoría
 * de los fotogramas llegan por debajo de ~45 fps, el efecto del ratón se
 * apaga (con fundido) y quedan solo los hilos y los pulsos — a 30 fps una
 * tela que persigue al cursor parece rota, un fondo que se mece no. Es
 * definitivo para esa visita: no vuelve a encenderse aunque los fps suban,
 * para que no parpadee entre modos. Se ve en `data-modo="ligero"`.
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

/** Tope del tiempo que se simula por fotograma: tras una pestaña oculta la
 * tela retoma donde estaba en vez de dar un brinco. */
const DT_MAXIMO = 1 / 30;

/** Modo ligero: ventana de medición (s), umbral de fotograma lento (s) y
 * proporción de fotogramas lentos en la ventana a partir de la cual se apaga
 * el ratón. 1/45 s deja pasar los 60 fps con margen y pilla los 30 de Safari
 * capado; la primera ventana se ignora porque la carga de la página siempre
 * da tirones que no dicen nada del navegador. */
const VENTANA_FPS = 2;
const FOTOGRAMA_LENTO = 1 / 45;
const PROPORCION_LENTOS = 0.6;

/** Luz: radio vertical (px) alrededor del cursor en el que un hilo se
 * enciende en el acento y engorda un poco, y alcance horizontal de esa luz a
 * lo largo del hilo (se funde con el gris al alejarse del cursor, como una
 * lámpara sobre la tela; sin esto el hilo entero se encendía de lado a lado
 * y con varios hilos a la vez era demasiado morado). */
const RADIO_LUZ = 150;
const ALCANCE_LUZ = 460;

/** Muelle con el que el dibujo sigue al puntero real: con un poco de retraso
 * y un mínimo de rebote (ratio de amortiguación ≈ 0,9) para que el arrastre
 * tenga cuerpo. `presencia` funde la influencia del cursor al entrar y salir
 * del hero en vez de cortarla de golpe. */
const MUELLE_CURSOR = { stiffness: 300, damping: 26, mass: 0.7 };
const MUELLE_PRESENCIA = { stiffness: 140, damping: 22 };

/** Pulsos: cuántos a la vez como máximo y cada cuánto nace uno (segundos). */
const PULSOS_MAXIMOS = 4;
const PAUSA_PULSO_MIN = 1.3;
const PAUSA_PULSO_MAX = 2.6;
/** Ancho del pulso, como fracción del ancho del hero. */
const ANCHO_PULSO = 0.07;

type Pulso = { hilo: number; u: number; velocidad: number };

/** "#rrggbb" a [r, g, b]. */
function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace("#", "");
  return [
    parseInt(limpio.slice(0, 2), 16),
    parseInt(limpio.slice(2, 4), 16),
    parseInt(limpio.slice(4, 6), 16),
  ];
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

  // Puntero real → cursor con muelle → velocidad del cursor. Son MotionValues:
  // se leen con `.get()` dentro del bucle de dibujo sin provocar re-renders.
  const punteroX = useMotionValue(0);
  const punteroY = useMotionValue(0);
  const cursorX = useSpring(punteroX, MUELLE_CURSOR);
  const cursorY = useSpring(punteroY, MUELLE_CURSOR);
  // Solo importa la velocidad vertical: los hilos van en horizontal y es el
  // único eje en el que el cursor puede arrastrarlos.
  const velocidadY = useVelocity(cursorY);
  const presencia = useSpring(0, MUELLE_PRESENCIA);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext("2d");
    if (!contexto) return;

    const movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conRaton = window.matchMedia("(pointer: fine)").matches && !movimientoReducido;
    const [rAcento, gAcento, bAcento] = hexARgb(color);
    const rgbPulso = `${rAcento}, ${gAcento}, ${bAcento}`;

    let ancho = 0;
    let alto = 0;
    let hilos = 0;
    let puntos = 0;
    let tela: Tela = crearTela(0, 0);
    const cursor: Cursor = { x: 0, y: 0, vy: 0, fuerza: 0 };
    /** Alturas del hilo que se está dibujando; se reutiliza. */
    let alturas = new Float32Array(0);
    let animacion = 0;
    let tiempo = 0;
    let ultimoFotograma = 0;
    let visible = true;
    let cursorDentro = false;
    let modoLigero = false;
    let ventanaFrames = 0;
    let ventanaLentos = 0;
    let ventanaTiempo = 0;
    let primeraVentana = true;
    let pulsos: Pulso[] = [];
    let proximoPulso = 0.6;

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
      // Cambia la malla: la tela vuelve al reposo (no hay forma sensata de
      // remapear desplazamientos entre dos rejillas distintas).
      tela = crearTela(hilos, puntos);
    }

    /** Altura de reposo del hilo `i` en la abscisa `x` para el instante `t`:
     * la forma de la tela sin contar la sacudida del cursor. */
    function alturaReposo(i: number, x: number, t: number): number {
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
      return base + arruga * 180 + temblor * 36;
    }

    /** Lee el cursor con muelle (MotionValues, sin re-render) y avanza la
     * tela en subpasos de paso fijo. */
    function simularTela(dt: number) {
      cursor.x = cursorX.get();
      cursor.y = cursorY.get();
      cursor.vy = velocidadY.get();
      cursor.fuerza = conRaton && !modoLigero ? presencia.get() : 0;
      avanzarTela(tela, dt, cursor, PASO_X);
    }

    /** Cuánto "toca" el cursor al hilo `i`: 1 justo encima, 0 fuera del radio
     * de luz. Se mide en la abscisa del cursor, que es donde se nota. */
    function cercaniaAlCursor(i: number): number {
      if (!conRaton || modoLigero) return 0;
      const p = presencia.get();
      if (p < 0.001) return 0;
      const cx = cursorX.get();
      const k = Math.max(0, Math.min(puntos - 1, Math.round(cx / PASO_X)));
      const distancia = Math.abs(tela.ultimaAltura[i * puntos + k] - cursorY.get());
      if (distancia >= RADIO_LUZ) return 0;
      return suavizar(1 - distancia / RADIO_LUZ) * p;
    }

    function dibujarHilo(i: number, t: number) {
      const fila = i * puntos;
      for (let k = 0; k < puntos; k++) {
        const y = alturaReposo(i, k * PASO_X, t) + tela.desplazamiento[fila + k];
        alturas[k] = y;
        tela.ultimaAltura[fila + k] = y;
      }

      // Campana de opacidad: los hilos del centro del haz se ven, los de los
      // bordes se funden con el fondo. Por eso el haz no tiene contorno.
      const campana = Math.sin((i / (hilos - 1)) * Math.PI);
      const gris = `rgba(10, 10, 10, ${(OPACIDAD_HILO * campana).toFixed(3)})`;
      const luz = cercaniaAlCursor(i);

      contexto!.beginPath();
      contexto!.moveTo(0, alturas[0]);
      for (let k = 1; k < puntos; k++) contexto!.lineTo(k * PASO_X, alturas[k]);
      if (luz > 0.01) {
        // Los hilos bajo el cursor se encienden hacia el acento y engordan un
        // poco; la luz se funde con el gris a lo largo del hilo.
        const alpha = Math.min(0.85, OPACIDAD_HILO * campana * (1 + 1.8 * luz) + 0.25 * luz);
        const mezcla = luz * 0.85;
        const r = Math.round(10 + (rAcento - 10) * mezcla);
        const g = Math.round(10 + (gAcento - 10) * mezcla);
        const b = Math.round(10 + (bAcento - 10) * mezcla);
        const cx = cursorX.get();
        const degradado = contexto!.createLinearGradient(cx - ALCANCE_LUZ, 0, cx + ALCANCE_LUZ, 0);
        degradado.addColorStop(0, gris);
        degradado.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
        degradado.addColorStop(1, gris);
        contexto!.strokeStyle = degradado;
        contexto!.lineWidth = 1.1 + 0.7 * luz;
      } else {
        contexto!.strokeStyle = gris;
        contexto!.lineWidth = 1.1;
      }
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
      // Acotado por arriba (pausa larga) y por abajo (WebKit puede entregar un
      // timestamp anterior al previo): un dt negativo invertiría la fricción.
      const dtCrudo = ultimoFotograma ? Math.max(ahora - ultimoFotograma, 0) : 0;
      const dt = Math.min(dtCrudo, DT_MAXIMO);
      ultimoFotograma = ahora;
      tiempo += dt;
      if (dtCrudo > 0) vigilarFotogramas(dtCrudo);

      if (dt > 0) simularTela(dt);
      avanzarPulsos(dt);
      pintar(tiempo);
      animacion = window.requestAnimationFrame(fotograma);
    }

    /** Mide la cadencia real de rAF (sin el tope de DT_MAXIMO) y apaga el
     * ratón si el navegador no llega. Ver el bloque de arriba. */
    function vigilarFotogramas(dtCrudo: number) {
      if (modoLigero) return;
      ventanaFrames++;
      ventanaTiempo += dtCrudo;
      if (dtCrudo > FOTOGRAMA_LENTO) ventanaLentos++;
      if (ventanaTiempo < VENTANA_FPS) return;
      if (!primeraVentana && ventanaLentos / ventanaFrames >= PROPORCION_LENTOS) activarModoLigero();
      primeraVentana = false;
      ventanaFrames = 0;
      ventanaLentos = 0;
      ventanaTiempo = 0;
    }

    function activarModoLigero() {
      modoLigero = true;
      canvas!.dataset.modo = "ligero";
      // El muelle de presencia funde la influencia que quede; la tela se
      // asienta sola con su propia física.
      presencia.set(0);
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
      if (modoLigero) return;
      const caja = canvas!.getBoundingClientRect();
      const x = evento.clientX - caja.left;
      const y = evento.clientY - caja.top;
      const dentro = x >= 0 && y >= 0 && x <= caja.width && y <= caja.height;

      if (dentro && !cursorDentro) {
        // Al entrar, el cursor con muelle aparece donde está el puntero en
        // vez de venir volando desde donde salió la última vez (o desde 0,0).
        cursorX.jump(x);
        cursorY.jump(y);
        punteroX.jump(x);
        punteroY.jump(y);
        presencia.set(1);
      } else if (dentro) {
        punteroX.set(x);
        punteroY.set(y);
      } else if (cursorDentro) {
        presencia.set(0);
      }
      cursorDentro = dentro;
    }

    function alSalirRaton() {
      cursorDentro = false;
      presencia.set(0);
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
  }, [color, punteroX, punteroY, cursorX, cursorY, velocidadY, presencia]);

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

"use client";

import { useEffect, useRef } from "react";

/**
 * Fondo animado de partículas para las superficies públicas (landings, login y
 * registro). Es la única excepción a «La Regla del Blanco Plano» de DESIGN.md:
 * el producto en sí — panel y ajustes — sigue en blanco liso a propósito.
 *
 * Se apoya en un `<canvas>` fijo detrás del contenido. El contenedor de la
 * página debe llevar `relative isolate` y no pintar fondo opaco propio: el
 * `isolate` crea el contexto de apilamiento donde este `z-index: -10` queda
 * por encima del blanco del `body` pero por debajo del contenido, sin depender
 * de qué fondos tengan `html` o `body`.
 */

/** Morado de marca (`--purple`) en componentes RGB, para poder variar el alfa. */
const MORADO_RGB = "139, 92, 246";

type Capa = {
  /** Cuánto se desplaza con el scroll: 0 = fijo, 1 = se mueve con la página. */
  parallax: number;
  /** Radio en píxeles CSS: [mínimo, máximo]. */
  radio: [number, number];
  alpha: [number, number];
  /** 0 = punto nítido, 1 = halo completamente difuminado. */
  suavidad: number;
  /** Deriva vertical propia, en píxeles por segundo. */
  deriva: [number, number];
};

// Tres profundidades: puntos pequeños y nítidos al fondo, halos grandes y
// difusos al frente. La diferencia de `parallax` entre capas es lo que crea la
// sensación de profundidad al deslizar.
const CAPAS: Capa[] = [
  { parallax: 0.1, radio: [1, 2.6], alpha: [0.34, 0.58], suavidad: 0.3, deriva: [1.5, 3.5] },
  { parallax: 0.28, radio: [2.4, 4.6], alpha: [0.22, 0.42], suavidad: 0.6, deriva: [3, 6.5] },
  { parallax: 0.52, radio: [5, 11], alpha: [0.1, 0.2], suavidad: 1, deriva: [6, 12] },
];

type Particula = {
  capa: number;
  /** Posición horizontal como fracción del ancho (0–1), para sobrevivir al resize. */
  x: number;
  /** Posición vertical en píxeles dentro del espacio virtual, antes de envolver. */
  y: number;
  radio: number;
  alpha: number;
  deriva: number;
};

/**
 * Densidad adaptada al dispositivo. La escena de uso real son móviles de gama
 * media, así que el número de partículas sale del área de pantalla y se recorta
 * según los núcleos y la memoria que declare el navegador.
 */
function calcularDensidad(ancho: number, alto: number): number {
  const base = Math.round((ancho * alto) / 5200);

  const navegador = navigator as Navigator & { deviceMemory?: number };
  const nucleos = navegador.hardwareConcurrency ?? 4;
  const memoria = navegador.deviceMemory ?? 4;

  let factor = 1;
  if (nucleos <= 4) factor *= 0.6;
  if (memoria <= 4) factor *= 0.7;
  if (ancho < 640) factor *= 0.8;

  return Math.max(45, Math.min(260, Math.round(base * factor)));
}

function aleatorioEntre([minimo, maximo]: [number, number]): number {
  return minimo + Math.random() * (maximo - minimo);
}

/** Sprite pre-renderizado por capa: dibujar una imagen es mucho más barato que un gradiente por partícula y fotograma. */
function crearSprite(suavidad: number): HTMLCanvasElement {
  const lado = 64;
  const sprite = document.createElement("canvas");
  sprite.width = lado;
  sprite.height = lado;

  const contexto = sprite.getContext("2d");
  if (!contexto) return sprite;

  const centro = lado / 2;
  const gradiente = contexto.createRadialGradient(centro, centro, 0, centro, centro, centro);
  gradiente.addColorStop(0, `rgba(${MORADO_RGB}, 1)`);
  gradiente.addColorStop(Math.max(0, 1 - suavidad), `rgba(${MORADO_RGB}, 1)`);
  gradiente.addColorStop(1, `rgba(${MORADO_RGB}, 0)`);

  contexto.fillStyle = gradiente;
  contexto.beginPath();
  contexto.arc(centro, centro, centro, 0, Math.PI * 2);
  contexto.fill();

  return sprite;
}

export function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contexto = canvas.getContext("2d", { alpha: true });
    if (!contexto) return;

    const sprites = CAPAS.map((capa) => crearSprite(capa.suavidad));
    const consultaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");

    let particulas: Particula[] = [];
    let ancho = 0;
    let alto = 0;
    let animacion = 0;
    let temporizadorResize = 0;

    // Estado de scroll: `impulso` acumula la velocidad del último gesto y se
    // desvanece solo. Es lo que hace que el campo reaccione al deslizar en vez
    // de limitarse a desplazarse.
    let scrollAnterior = window.scrollY;
    let impulso = 0;
    let ultimoInstante = 0;

    function medir() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = window.innerWidth;
      alto = window.innerHeight;

      canvas!.width = Math.round(ancho * dpr);
      canvas!.height = Math.round(alto * dpr);
      canvas!.style.width = `${ancho}px`;
      canvas!.style.height = `${alto}px`;
      contexto!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function sembrar() {
      const total = calcularDensidad(ancho, alto);
      particulas = Array.from({ length: total }, () => {
        // Las capas cercanas llevan menos partículas: son grandes y difusas, y
        // amontonarlas emborrona el fondo en vez de dar profundidad.
        const sorteo = Math.random();
        const capa = sorteo < 0.55 ? 0 : sorteo < 0.85 ? 1 : 2;
        const definicion = CAPAS[capa];

        return {
          capa,
          x: Math.random(),
          y: Math.random() * alto,
          radio: aleatorioEntre(definicion.radio),
          alpha: aleatorioEntre(definicion.alpha),
          deriva: aleatorioEntre(definicion.deriva),
        };
      });
    }

    function pintar(delta: number) {
      contexto!.clearRect(0, 0, ancho, alto);

      const scrollActual = window.scrollY;

      for (const particula of particulas) {
        const definicion = CAPAS[particula.capa];

        // La deriva propia mantiene el campo vivo aunque nadie toque la página.
        particula.y -= particula.deriva * delta;

        const desplazamiento =
          scrollActual * definicion.parallax + impulso * definicion.parallax * 4;

        // Envolvemos en el alto de la ventana: el campo nunca se acaba por
        // mucho que se baje, sin tener que sembrar una escena gigante.
        const margen = particula.radio * 2;
        const periodo = alto + margen * 2;
        let y = (particula.y - desplazamiento + margen) % periodo;
        if (y < 0) y += periodo;
        y -= margen;

        // Un empujón fuerte aviva el brillo: el campo acusa el gesto y se calma.
        const brillo = Math.min(1, particula.alpha * (1 + Math.abs(impulso) * 0.012));

        contexto!.globalAlpha = brillo;
        contexto!.drawImage(
          sprites[particula.capa],
          particula.x * ancho - particula.radio,
          y - particula.radio,
          particula.radio * 2,
          particula.radio * 2
        );
      }

      contexto!.globalAlpha = 1;
      scrollAnterior = scrollActual;
    }

    function fotograma(instante: number) {
      // Primer fotograma: sin delta fiable, sólo fijamos el reloj.
      const delta = ultimoInstante ? Math.min((instante - ultimoInstante) / 1000, 0.05) : 0;
      ultimoInstante = instante;

      const scrollActual = window.scrollY;
      impulso += (scrollActual - scrollAnterior) * 0.35;
      impulso *= 0.9; // se desvanece en ~medio segundo

      pintar(delta);
      animacion = window.requestAnimationFrame(fotograma);
    }

    function detener() {
      if (!animacion) return;
      window.cancelAnimationFrame(animacion);
      animacion = 0;
      ultimoInstante = 0;
    }

    function arrancar() {
      if (animacion || consultaMovimiento.matches || document.hidden) return;
      scrollAnterior = window.scrollY;
      animacion = window.requestAnimationFrame(fotograma);
    }

    function reiniciar() {
      medir();
      sembrar();
      detener();
      impulso = 0;

      // Un primer fotograma síncrono: el fondo existe desde el render, sin
      // esperar al primer requestAnimationFrame. Con `prefers-reduced-motion`
      // esto es todo lo que se pinta — el campo sigue ahí, simplemente quieto.
      pintar(0);

      if (consultaMovimiento.matches) return;
      arrancar();
    }

    function alCambiarTamano() {
      window.clearTimeout(temporizadorResize);
      temporizadorResize = window.setTimeout(reiniciar, 150);
    }

    function alCambiarVisibilidad() {
      if (document.hidden) detener();
      else arrancar();
    }

    reiniciar();

    window.addEventListener("resize", alCambiarTamano);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    consultaMovimiento.addEventListener("change", reiniciar);

    return () => {
      detener();
      window.clearTimeout(temporizadorResize);
      window.removeEventListener("resize", alCambiarTamano);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      consultaMovimiento.removeEventListener("change", reiniciar);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      data-testid="particle-field"
    >
      {/*
        Velo de color por debajo de las partículas. Muy tenue a propósito: el
        texto de estas páginas se sigue leyendo sobre blanco y el compromiso
        WCAG AA de PRODUCT.md no se toca.
      */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#f6f2ff_0%,#ffffff_45%),linear-gradient(to_bottom,transparent_60%,#f7f4ff_100%)]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

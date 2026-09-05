"use client";

import { useEffect, useState } from "react";

/**
 * Fondo animado de partículas para las superficies públicas (landings, login y
 * registro). Es la única excepción a «La Regla del Blanco Plano» de DESIGN.md:
 * el producto en sí — panel y ajustes — sigue en blanco liso a propósito.
 *
 * Arquitectura: cada capa se dibuja **una sola vez** en un canvas fuera del
 * DOM, se convierte en imagen y se repite verticalmente como fondo de un div.
 * A partir de ahí todo el movimiento es del compositor (`transform` en CSS):
 * deriva ambiente en bucle, y profundidad al deslizar con
 * `animation-timeline: scroll()` donde el navegador lo soporta.
 *
 * No hay `requestAnimationFrame` ni lectura de `window.scrollY`. La versión
 * anterior sí los tenía y era el antipatrón de los scroll-linked effects: en
 * móvil el scroll va por el hilo del compositor, así que cualquier retraso del
 * hilo principal desincronizaba el fondo del contenido — se notaba como saltos
 * y como desconexión con el resto de la página.
 *
 * El contenedor de la página necesita `relative isolate` y no puede pintar
 * fondo opaco propio: el lienzo vive en `z-index: -10` y cualquier sección con
 * fondo lo taparía (ver DESIGN.md § La Regla del Blanco Plano).
 */

/** Morado de marca (`--purple`) en componentes RGB, para poder variar el alfa. */
const MORADO_RGB = "139, 92, 246";

/**
 * Alto del tile en píxeles CSS. Es una constante a propósito: al no depender
 * del alto de la ventana, la barra de direcciones del móvil —que cambia
 * `innerHeight` en cuanto se hace scroll— ya no puede alterar el fondo.
 */
const ALTO_TILE = 900;

type Capa = {
  /** Radio en píxeles CSS: [mínimo, máximo]. */
  radio: [number, number];
  alpha: [number, number];
  /** 0 = punto nítido, 1 = halo completamente difuminado. */
  suavidad: number;
  /** Reparto de partículas entre capas (suma 1). */
  proporcion: number;
  /** Segundos que tarda la deriva ambiente en recorrer un tile. */
  duracion: number;
  /** Píxeles que se desplaza la capa a lo largo de todo el scroll de la página. */
  parallax: number;
};

// Tres profundidades: puntos pequeños y nítidos al fondo, halos grandes y
// difusos al frente. La diferencia de velocidad y de recorrido entre capas es
// lo que crea la sensación de profundidad.
const CAPAS: Capa[] = [
  { radio: [1, 2.6], alpha: [0.34, 0.58], suavidad: 0.3, proporcion: 0.55, duracion: 210, parallax: -70 },
  { radio: [2.4, 4.6], alpha: [0.22, 0.42], suavidad: 0.6, proporcion: 0.3, duracion: 150, parallax: -170 },
  { radio: [5, 11], alpha: [0.1, 0.2], suavidad: 1, proporcion: 0.15, duracion: 100, parallax: -320 },
];

/**
 * Densidad adaptada al dispositivo. La escena de uso real son móviles de gama
 * media, así que el número de partículas sale del área del tile y se recorta
 * según los núcleos y la memoria que declare el navegador.
 */
function calcularDensidad(ancho: number): number {
  const base = Math.round((ancho * ALTO_TILE) / 6600);

  const navegador = navigator as Navigator & { deviceMemory?: number };
  const nucleos = navegador.hardwareConcurrency ?? 4;
  const memoria = navegador.deviceMemory ?? 4;

  let factor = 1;
  if (nucleos <= 4) factor *= 0.6;
  if (memoria <= 4) factor *= 0.7;
  if (ancho < 640) factor *= 0.8;

  return Math.max(40, Math.min(210, Math.round(base * factor)));
}

function aleatorioEntre([minimo, maximo]: [number, number]): number {
  return minimo + Math.random() * (maximo - minimo);
}

/** Sprite pre-renderizado por capa: dibujar una imagen es mucho más barato que un gradiente por partícula. */
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

/**
 * Dibuja el tile de una capa y lo devuelve como imagen. Cada partícula se pinta
 * también un tile más arriba y más abajo: así lo que cruza el borde aparece a
 * los dos lados y la repetición vertical no deja costura.
 */
function dibujarTile(ancho: number, capa: Capa, cantidad: number): HTMLCanvasElement | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(ancho * dpr);
  lienzo.height = Math.round(ALTO_TILE * dpr);

  const contexto = lienzo.getContext("2d");
  if (!contexto) return null;

  contexto.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sprite = crearSprite(capa.suavidad);

  for (let i = 0; i < cantidad; i++) {
    const x = Math.random() * ancho;
    const y = Math.random() * ALTO_TILE;
    const radio = aleatorioEntre(capa.radio);

    contexto.globalAlpha = aleatorioEntre(capa.alpha);
    for (const desplazamiento of [-ALTO_TILE, 0, ALTO_TILE]) {
      contexto.drawImage(sprite, x - radio, y + desplazamiento - radio, radio * 2, radio * 2);
    }
  }

  contexto.globalAlpha = 1;
  return lienzo;
}

export function ParticleField() {
  const [fondos, setFondos] = useState<string[]>([]);

  useEffect(() => {
    let cancelado = false;
    let urlsActuales: string[] = [];
    let anchoDibujado = 0;
    let temporizador = 0;

    function liberar() {
      for (const url of urlsActuales) URL.revokeObjectURL(url);
      urlsActuales = [];
    }

    function generar() {
      const ancho = window.innerWidth;
      const total = calcularDensidad(ancho);

      const lienzos = CAPAS.map((capa) =>
        dibujarTile(ancho, capa, Math.max(6, Math.round(total * capa.proporcion)))
      );
      if (lienzos.some((lienzo) => lienzo === null)) return;

      Promise.all(
        lienzos.map(
          (lienzo) =>
            new Promise<string | null>((resolver) => {
              lienzo!.toBlob((blob) => resolver(blob ? URL.createObjectURL(blob) : null));
            })
        )
      ).then((urls) => {
        if (cancelado || urls.some((url) => url === null)) {
          for (const url of urls) if (url) URL.revokeObjectURL(url);
          return;
        }
        liberar();
        urlsActuales = urls as string[];
        anchoDibujado = ancho;
        setFondos(urlsActuales);
      });
    }

    /**
     * Solo se vuelve a dibujar si cambia el ANCHO. El alto de la ventana cambia
     * constantemente en móvil (barra de direcciones al hacer scroll) y no
     * afecta al tile, que tiene alto fijo.
     */
    function alCambiarTamano() {
      if (window.innerWidth === anchoDibujado) return;
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(generar, 200);
    }

    generar();
    window.addEventListener("resize", alCambiarTamano);

    return () => {
      cancelado = true;
      window.clearTimeout(temporizador);
      window.removeEventListener("resize", alCambiarTamano);
      liberar();
    };
  }, []);

  return (
    <div aria-hidden="true" className="campo-particulas" data-testid="particle-field">
      {CAPAS.map((capa, indice) => (
        <div
          key={indice}
          className="campo-particulas__capa"
          style={{ "--parallax": `${capa.parallax}px` } as React.CSSProperties}
        >
          <div
            className="campo-particulas__deriva"
            style={
              {
                "--tile": `${ALTO_TILE}px`,
                "--duracion": `${capa.duracion}s`,
                backgroundImage: fondos[indice] ? `url(${fondos[indice]})` : undefined,
              } as React.CSSProperties
            }
          />
        </div>
      ))}
    </div>
  );
}

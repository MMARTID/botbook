"use client";

import { useEffect, useRef } from "react";

/**
 * Capa interactiva opcional: puntos que reaccionan al pasar el cursor cerca.
 * Solo en escritorio (`pointer: fine`) — en táctil no hay cursor que seguir, y
 * es justo donde vivía el riesgo de los bugs de scroll de antes, así que en
 * móvil este componente ni monta su bucle.
 *
 * A diferencia de `ParticleField` (fondo ambiente, 100% CSS/compositor), esto
 * sí es JavaScript por fotograma — la repulsión al ratón necesita conocer su
 * posición en tiempo real, y eso no se puede hacer desde el compositor. La
 * diferencia con el bug que arreglamos: esto **nunca** lee `window.scrollY`
 * ni depende de la posición de scroll, así que no hay nada que se pueda
 * desincronizar al deslizar — solo reacciona al ratón, que no cambia por
 * scroll. El coste (unas decenas de puntos, física simple) recae en hardware
 * de escritorio, no en el móvil de gama media que dio los problemas.
 *
 * Simplificación consciente: el gate de `pointer: fine` /
 * `prefers-reduced-motion` se evalúa solo al montar, no en vivo — conectar un
 * ratón a media sesión no lo activaría sin recargar. Caso raro, no vale la
 * complejidad de escuchar el cambio para esto.
 */

const RADIO_REPULSION = 130;
const VELOCIDAD_MAXIMA = 2.2;

type Punto = { x: number; y: number; vx: number; vy: number; radio: number; alpha: number };

/** "#rrggbb" a "r, g, b". */
function hexARgb(hex: string): string {
  const limpio = hex.replace("#", "");
  const r = parseInt(limpio.slice(0, 2), 16);
  const g = parseInt(limpio.slice(2, 4), 16);
  const b = parseInt(limpio.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function calcularDensidad(ancho: number, alto: number): number {
  return Math.max(24, Math.min(70, Math.round((ancho * alto) / 15000)));
}

export function ParticleMouseLayer({ color = "#8b5cf6" }: { color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const consultaPuntero = window.matchMedia("(pointer: fine)");
    const consultaMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!consultaPuntero.matches || consultaMovimiento.matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext("2d");
    if (!contexto) return;

    const rgb = hexARgb(color);
    let ancho = 0;
    let alto = 0;
    let puntos: Punto[] = [];
    let animacion = 0;
    let anchoSembrado = 0;
    let temporizadorResize = 0;
    const raton = { x: -9999, y: -9999 };

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
      puntos = Array.from({ length: total }, () => ({
        x: Math.random() * ancho,
        y: Math.random() * alto,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radio: 1 + Math.random() * 2,
        alpha: 0.25 + Math.random() * 0.35,
      }));
    }

    function fotograma() {
      contexto!.clearRect(0, 0, ancho, alto);

      for (const punto of puntos) {
        const dx = punto.x - raton.x;
        const dy = punto.y - raton.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < RADIO_REPULSION * RADIO_REPULSION && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const fuerza = ((RADIO_REPULSION - d) / RADIO_REPULSION) * 0.9;
          punto.vx += (dx / d) * fuerza;
          punto.vy += (dy / d) * fuerza;
        }
        punto.vx *= 0.96;
        punto.vy *= 0.96;
        const velocidad = Math.hypot(punto.vx, punto.vy);
        if (velocidad > VELOCIDAD_MAXIMA) {
          punto.vx = (punto.vx / velocidad) * VELOCIDAD_MAXIMA;
          punto.vy = (punto.vy / velocidad) * VELOCIDAD_MAXIMA;
        }
        punto.x += punto.vx;
        punto.y += punto.vy;

        // Envuelve por los bordes: nunca desaparece, solo reaparece enfrente.
        if (punto.x < -10) punto.x = ancho + 10;
        else if (punto.x > ancho + 10) punto.x = -10;
        if (punto.y < -10) punto.y = alto + 10;
        else if (punto.y > alto + 10) punto.y = -10;

        contexto!.beginPath();
        contexto!.arc(punto.x, punto.y, punto.radio, 0, Math.PI * 2);
        contexto!.fillStyle = `rgba(${rgb}, ${punto.alpha})`;
        contexto!.fill();
      }

      animacion = window.requestAnimationFrame(fotograma);
    }

    function detener() {
      if (!animacion) return;
      window.cancelAnimationFrame(animacion);
      animacion = 0;
    }

    function arrancar() {
      if (animacion || document.hidden) return;
      animacion = window.requestAnimationFrame(fotograma);
    }

    function reiniciar() {
      const anchoPrevio = ancho;
      medir();
      if (anchoSembrado === 0 || anchoPrevio !== ancho) {
        sembrar();
        anchoSembrado = ancho;
      }
    }

    function alCambiarTamano() {
      window.clearTimeout(temporizadorResize);
      temporizadorResize = window.setTimeout(reiniciar, 200);
    }

    function alMoverRaton(evento: MouseEvent) {
      raton.x = evento.clientX;
      raton.y = evento.clientY;
    }

    function alSalirRaton() {
      raton.x = -9999;
      raton.y = -9999;
    }

    function alCambiarVisibilidad() {
      if (document.hidden) detener();
      else arrancar();
    }

    reiniciar();
    arrancar();

    window.addEventListener("resize", alCambiarTamano);
    window.addEventListener("mousemove", alMoverRaton, { passive: true });
    document.addEventListener("mouseleave", alSalirRaton);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);

    return () => {
      detener();
      window.clearTimeout(temporizadorResize);
      window.removeEventListener("resize", alCambiarTamano);
      window.removeEventListener("mousemove", alMoverRaton);
      document.removeEventListener("mouseleave", alSalirRaton);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      data-testid="particle-mouse-layer"
    />
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Ancho real del thumb visual (h-6/w-6 = 1.5rem a 16px de raíz).
const SLIDER_THUMB_PX = 24;
const SLIDER_TICKS = [0.25, 0.5, 0.75];

/**
 * Slider a medida: el relleno y el thumb son dos elementos reales que
 * comparten el mismo cálculo de posición en píxeles, así que nunca pueden
 * desalinearse entre sí — a diferencia de intentar adivinar dónde coloca el
 * navegador el thumb nativo (invisible) de un `<input type="range">`
 * personalizado con pseudo-elementos, que no sigue una fórmula fiable entre
 * motores y produce un corte de relleno que no encaja con el thumb.
 *
 * El `<input>` nativo se mantiene, a pantalla completa sobre el control y con
 * `opacity-0`: sigue siendo lo que recibe el foco, el teclado y el arrastre,
 * así que el control conserva la semántica y accesibilidad nativas de un
 * slider (rol, `aria-value*`, flechas del teclado). Solo su pintado es
 * invisible; el foco por teclado se redirige visualmente al thumb dibujado
 * mediante `peer-focus-visible`.
 */
export function RangeSlider({
  id,
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  onChange,
  ariaValueText,
  displayValue,
  minLabel,
  maxLabel,
  hint,
  showTicks = true,
}: {
  id: string;
  icon?: LucideIcon;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaValueText: string;
  displayValue: string;
  minLabel: string;
  maxLabel: string;
  hint?: string;
  showTicks?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      setTrackWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const percent = max > min ? (value - min) / (max - min) : 0;
  const usableWidth = Math.max(trackWidth - SLIDER_THUMB_PX, 0);
  const thumbLeft = SLIDER_THUMB_PX / 2 + percent * usableWidth;

  return (
    <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3eeff] text-[#8b5cf6]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          ) : null}
          <label htmlFor={id} className="max-w-[13rem] text-sm font-semibold leading-5 text-[#27272a]">
            {label}
          </label>
        </div>
        <output htmlFor={id} className="shrink-0 text-2xl font-black tracking-tight text-[#0a0a0a]">
          {displayValue}
        </output>
      </div>

      {/* Espacio reservado arriba para la burbuja flotante: así no desplaza el
          layout al aparecer en hover/foco/arrastre. */}
      <div ref={trackRef} className="group relative mt-8 h-11 select-none">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-3 -translate-x-1/2 scale-90 whitespace-nowrap rounded-lg bg-[#0a0a0a] px-2.5 py-1 text-xs font-bold text-white opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-[opacity,transform] duration-150 ease-out group-hover:scale-100 group-hover:opacity-100 group-active:scale-100 group-active:opacity-100 peer-focus-visible:scale-100 peer-focus-visible:opacity-100"
          style={{ left: `${thumbLeft}px` }}
        >
          {displayValue}
          <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-[#0a0a0a]" />
        </div>

        {/* pista, siempre visible de extremo a extremo */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-[#e5e5e5] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]">
          {showTicks
            ? SLIDER_TICKS.map((tick) => (
                <span
                  key={tick}
                  className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80"
                  style={{ left: `${tick * 100}%` }}
                />
              ))
            : null}
        </div>
        {/* relleno: un div con su propio border-radius y un degradado morado con
            resplandor — no un corte recto sobre un color plano */}
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#7c3aed,#a78bfa)] shadow-[0_0_14px_rgba(139,92,246,0.5)]"
          style={{ width: `${thumbLeft}px` }}
        />
        {/* input nativo: pinta invisible pero sigue siendo el foco/teclado/arrastre real */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-valuetext={ariaValueText}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0"
        />
        {/* thumb visual: usa el mismo `thumbLeft` que el relleno, alineados por construcción */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-[#7c3aed] shadow-[0_2px_10px_rgba(124,58,237,0.45),0_1px_3px_rgba(0,0,0,0.15)] transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-95 peer-focus-visible:ring-4 peer-focus-visible:ring-[#8b5cf6]/30 peer-focus-visible:ring-offset-2"
          style={{ left: `${thumbLeft}px` }}
        />
      </div>

      <div className="mt-3 flex justify-between text-xs font-medium text-[#a1a1aa]" aria-hidden="true">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>

      {hint ? <p className="mt-3 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

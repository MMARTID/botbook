import * as React from "react";
import { LottieAnimation } from "alhabla-ui";
import iconoMapas from "../../frontend/public/animations/landing/GoogleMaposIcon.json";

// OJO: esta preview NO usa el shim `_sin-movimiento`. Con reduced-motion el
// componente pasa `autoplay={false}` y lottie-react no llega a pintar el
// primer fotograma, así que la tarjeta saldría en blanco.
//
// En la app el `src` es una ruta de `public/`. La tarjeta se sirve desde el
// propio bundle, donde esa ruta no existe, así que se incrusta la MISMA
// animación del repo como data: URL — mismo asset, sin depender de la red.
const fuente = `data:application/json,${encodeURIComponent(JSON.stringify(iconoMapas))}`;

/** Tamaño de icono, como en el paso de búsqueda del negocio en el registro. */
export function Icono() {
  return (
    <div className="panel flex w-64 flex-col items-center gap-3 p-6 text-center">
      <LottieAnimation src={fuente} className="h-16 w-16" />
      <p className="text-sm font-semibold text-[#0a0a0a]">
        Busca tu negocio en Google
      </p>
    </div>
  );
}

/** Ilustración de apoyo a mayor tamaño, como en la página de ajustes. */
export function Ilustracion() {
  return <LottieAnimation src={fuente} className="w-40" />;
}

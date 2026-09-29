// Las tarjetas son capturas ESTÁTICAS, así que el estado correcto es el final,
// no un fotograma intermedio. Sin esto, todo lo que cuenta o aparece con
// framer-motion (en la web: CountUp, AnimatedCurrency, Reveal y lo que los
// embebe, como SectorDataSection) se fotografía a mitad de animación y la
// tarjeta muestra cifras que no son las de los datos — 57% donde pone 62%.
// Copia gemela en .design-sync/previews/ (app) y web/.design-sync/previews/.
//
// Forzamos `prefers-reduced-motion: reduce`, que es un modo real y soportado
// de estos componentes: pintan directamente el valor definitivo.
const matchMediaOriginal = window.matchMedia.bind(window);

window.matchMedia = ((consulta: string) =>
  /prefers-reduced-motion/.test(consulta)
    ? {
        matches: true,
        media: consulta,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }
    : matchMediaOriginal(consulta)) as typeof window.matchMedia;

export {};

/**
 * `data-relato` en <html>: lo ponen las secciones de la portada con escenario
 * fijo («En tu bolsillo» y «En tu negocio») mientras están en pantalla, y
 * `google-analytics.tsx` esconde con él el botón «Configurar cookies», que
 * tapaba la barra de pasos en móvil.
 *
 * Las dos secciones van seguidas, así que al pasar de una a otra la que sale
 * no puede quitar sin más la marca que acaba de poner la que entra (el orden
 * de los avisos de IntersectionObserver no está garantizado): se lleva la
 * cuenta de qué secciones están a la vista y la marca sigue mientras quede
 * alguna.
 */
const aLaVista = new Set<Element>();

function pintar() {
  const raiz = document.documentElement;
  if (aLaVista.size > 0) raiz.setAttribute("data-relato", "");
  else raiz.removeAttribute("data-relato");
}

/** Marca `data-relato` mientras `el` esté en pantalla. Devuelve la limpieza. */
export function marcarRelato(el: Element): () => void {
  const observador = new IntersectionObserver(([entrada]) => {
    if (entrada.isIntersecting) aLaVista.add(el);
    else aLaVista.delete(el);
    pintar();
  });
  observador.observe(el);
  return () => {
    observador.disconnect();
    aLaVista.delete(el);
    pintar();
  };
}

// FAQ recortada a las 4 dudas que más frenan una decisión justo antes del
// CTA de cierre de la portada — la lista completa (9 preguntas) vive en las
// landings de nicho, donde sí hay intención de búsqueda concreta para
// justificarla.
//
// Vive en un módulo de datos aparte (no dentro de `main-landing.tsx`, que es
// "use client") porque `page.tsx` la necesita también para el JSON-LD
// FAQPage: importar una constante desde un archivo cliente en un componente
// de servidor rompe el build de Next (RSC la envuelve como referencia de
// cliente y `.map()` deja de poder llamarse en el servidor).
export const HOME_QUICK_FAQS = [
  {
    question: "¿Mantengo mi número de teléfono de siempre?",
    answer: "Sí, completamente. Alhabla atiende mediante un desvío desde tu móvil o fijo habitual; no publicas un número nuevo ni avisas a nadie.",
  },
  {
    question: "¿Es difícil de configurar?",
    answer: "No. Activas el desvío marcando un código rápido en tu teléfono; tarda unos 15 segundos y te guiamos paso a paso para tu operador.",
  },
  {
    question: "¿Hay permanencia?",
    answer: "No. Empiezas con el plan que mejor encaje y lo cambias cuando lo necesites, sin contratos largos.",
  },
  {
    question: "¿Qué pasa si supero los minutos incluidos?",
    answer: "Sin sorpresas: cada plan muestra el coste por minuto adicional antes de contratar.",
  },
] as const;

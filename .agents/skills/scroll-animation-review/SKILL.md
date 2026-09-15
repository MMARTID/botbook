---
name: scroll-animation-review
description: Revisa y optimiza animaciones vinculadas al scroll cuando deben mantenerse fluidas, comprensibles y estables al pausar, invertir o avanzar rápido.
---

# Revisión de animación por scroll

Usa esta skill para diagnosticar o mejorar scrollytelling, scrub, parallax o transiciones entre escenas. Se centra en la relación entre gesto, rendimiento y claridad de estado; no sustituye una decisión de producto ni rediseña la interfaz fuera de la animación solicitada.

## Diagnóstico antes de editar

Identifica qué produce el problema observado:

- Mapeo directo de scroll a estilos que hace que cada píxel se perciba como un salto.
- Dos escenas visibles a la vez, o ninguna, cerca de una costura.
- Estado React, medidas de layout o creación de timelines dentro de listeners de scroll.
- Un snap global que captura el desplazamiento dentro de un paso válido.
- Temporizadores, springs o listeners que siguen activos al invertir el gesto, ocultar la escena o desmontarla.

No supongas que un spring arregla todas las transiciones. Separa el progreso que decide la escena activa del progreso que interpola sus valores visuales.

## Implementación preferida

- Define pocos keyframes semánticos por elemento y deja que el motor de animación interpole `transform`, `opacity` y, cuando aporte significado, `clip-path` o filtro acotado.
- Comparte un solo valor suavizado (`lerp` o spring con `stiffness`, `damping`, `mass` y `restDelta` explícitos) entre los elementos visuales de la secuencia. No crees un spring por elemento ni por evento.
- Conserva una fuente de progreso cruda para la presencia exclusiva de cada fase (`visibility`, `pointer-events` o desmontaje). El suavizado no debe permitir que escenas consecutivas se mezclen.
- Evita actualizar estado React con cada tick de scroll. Para umbrales de entrada/salida, usa `IntersectionObserver`; para trabajo inevitable tras un gesto, agrupa con `requestAnimationFrame`, `scrollend` o un debounce corto.
- No leas `getBoundingClientRect`, `offsetHeight` ni fuerces layout dentro del recorrido continuo. Calcula esas medidas al acabar el gesto, al redimensionar o en un observer.
- Si hay snap, limítalo a las costuras entre escenas. Dentro de cada escena el scroll debe seguir siendo libre. Al resolver una costura, elige el estado estable anterior o siguiente según la dirección del gesto y respeta `prefers-reduced-motion`.
- Cancela intervalos, timeouts, observers, RAF y listeners al desmontar. Las secuencias temporizadas deben pausarse cuando su escena deja de estar activa.

## Navegación entre fases

Cuando una secuencia larga de scroll representa pasos discretos, ofrece una vía de navegación explícita además de la rueda o el gesto táctil:

- Usa botones nativos con nombres de paso, foco visible y `aria-current="step"` para el estado actual. No captures `ArrowUp`, `ArrowDown`, `PageUp` ni `PageDown` globalmente: son navegación del documento y tecnologías de asistencia.
- Cada control debe llevar a un ancla estable dentro de su fase, nunca a la costura. Calcula el destino sólo al activar el control y usa desplazamiento instantáneo con movimiento reducido.
- Actualiza el paso activo sólo al cruzar un umbral semántico; no publiques progreso continuo en estado React ni en la URL.
- Los controles son complementarios: no conviertas la barra de progreso en un carrusel que bloquee la lectura, ni obligues a pasar por fases intermedias al elegir una fase posterior.

## Contrato para scroll rápido

Un visitante no tiene por qué descubrir que debe usar una rueda lenta. El recorrido debe
soportar tanto una primera pasada rápida como una inspección deliberada:

- Modela cada fase como un estado completo y exclusivo. Un salto de progreso puede omitir una
  fase, pero nunca puede dejar la siguiente a medio montar o revelar un espacio vacío.
- Usa el progreso crudo para decidir la fase y el progreso amortiguado sólo para que los detalles
  de la fase elegida lleguen con continuidad. No hagas que la visibilidad espere al muelle.
- No llames a `window.scrollTo` después de cada pausa de scroll. Si existe una resolución de
  costura, debe activarse únicamente al acabar dentro de una banda de error estrecha y debe
  cancelarse en cuanto el usuario continúe el gesto. Un desplazamiento que atraviesa la banda no
  se captura ni se reproduce paso a paso.
- La entrada y salida de una fase deben tener un estado de reposo inequívoco. Si el usuario se
  detiene inmediatamente después de cruzar una costura, el contenido prioritario ya debe estar
  visible; los detalles pueden asentarse durante unos cientos de milisegundos.

## Validación con las herramientas disponibles

1. Usa la skill `animation-evaluator` del proyecto para capturar un storyboard de la sección en móvil y escritorio. Inspecciona continuidad, jerarquía, solapes y contenido cortado.
2. Si hay automatización de navegador disponible, prueba el comportamiento interactivo: entrada en la sección, scroll lento, parada en cada costura hacia ambos sentidos, inversión inmediata, avance rápido hasta el final y cada control de navegación. Una tira de fotogramas no sustituye estas pruebas.
3. Usa `impeccable` cuando el cambio también afecte jerarquía visual, copy, accesibilidad o diseño responsive. No lo cargues sólo por una refactorización interna sin impacto visual.
4. Consulta conectores, MCP o plugins únicamente si ya están disponibles y aportan una fuente concreta de verdad —por ejemplo, una especificación de diseño, telemetría o una sesión de navegador. No instales herramientas ni inventes integraciones para una revisión local.

## Criterios de salida

- El movimiento se siente continuo al desplazar despacio y no reproduce una ráfaga al soltar.
- Al detenerse en una costura, la interfaz llega a un único estado legible; al invertir, resuelve en la dirección correcta.
- Un avance rápido puede saltar pasos sin quedar atrapado en cada uno.
- Las rutas de movimiento reducido y de fallo de JavaScript conservan el contenido esencial.
- La verificación declara qué se midió y qué quedó sin comprobar, en lugar de atribuir fluidez a una captura estática.

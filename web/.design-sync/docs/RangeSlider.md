---
category: Formularios
---
Control de rango a medida. El `<input type="range">` nativo sigue debajo a
`opacity-0` y es quien recibe foco, teclado y arrastre, así que conserva la
semántica accesible; lo visible son un relleno y un thumb dibujados que
comparten el mismo cálculo de posición y por eso nunca se desalinean.

Es un control **controlado**: `value` + `onChange` son obligatorios. También lo
son `ariaValueText` (lo que se lee en voz alta) y `displayValue` / `minLabel` /
`maxLabel` (lo que se ve), porque el componente no sabe formatear la unidad —
pásale euros, citas o plazas ya formateados.

Usa `bare` para encadenar varios dentro de un mismo panel separados por una
línea; sin `bare` cada uno trae su propio marco.

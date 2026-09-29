---
category: Formularios
---
Control de rango a medida. El `<input type="range">` nativo sigue debajo a
`opacity-0` y es quien recibe foco, teclado y arrastre, así que conserva la
semántica accesible; lo visible son un relleno y un thumb dibujados que
comparten el mismo cálculo de posición y por eso nunca se desalinean.

Es un control **controlado**: `value` + `onChange` son obligatorios, igual que
`id`, `label`, `min`, `max` y `step`. También lo son `ariaValueText` (lo que se
lee en voz alta) y `displayValue` / `minLabel` / `maxLabel` (lo que se ve),
porque el componente no sabe formatear la unidad — pásale euros, citas o
plazas ya formateados. Opcionales: `icon`, `hint`, `showTicks` (activo por
defecto) y `accent`, que retinta relleno y thumb con el color de un nicho.

Sin `bare` cada uno trae su propio marco gris claro; con `bare` se encadenan
varios dentro de un mismo panel, y la línea que los separa la pone quien los
compone.

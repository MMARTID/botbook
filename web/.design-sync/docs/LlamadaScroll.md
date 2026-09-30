---
category: Marketing
---
«En tu bolsillo», la sección de la portada que cuenta una llamada de principio a
fin (ancla `#como-funciona`, a la que apunta el menú). Es scroll-driven: la
sección es alta (436vh, `lib/transicion-bolsillo-negocio.ts`) y el escenario se
queda pegado (sticky) mientras el scroll recorre tres pasos —«Contesta», «Busca
hueco» y «Confirma»—. A la izquierda, el texto de cada paso suma sus detalles; a
la derecha, un teléfono (render frontal) se balancea y se acerca mientras la
conversación y la agenda se rellenan en su pantalla. La barra de pasos de abajo
lleva a cada uno al pulsarla. Al acabar el tercer paso el teléfono se vuelca
(−90°, crece y se va a la esquina inferior derecha) y se funde con la tapa del
portátil de «En tu negocio», que solapa el final de esta sección.

No recibe props y es ancho completo: va directamente en la página, nunca dentro
de una columna ni de una tarjeta. Por debajo de 1024 px el movimiento es más
contenido. Con `prefers-reduced-motion` se cambia por una versión quieta con los
tres pasos en tres tarjetas. Mientras está en pantalla marca `data-relato` en
`<html>`, que esconde el botón «Configurar cookies».

La tarjeta de este sistema enseña el escenario al llegar a la sección (paso 1).

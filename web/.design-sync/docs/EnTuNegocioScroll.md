---
category: Marketing
---
«En tu negocio», la sección de la portada que va justo después de «En tu
bolsillo» y enseña el otro lado: lo que ve el dueño. Misma mecánica: la sección
mide 360vh con el escenario pegado (sticky) y el scroll recorre tres pasos
—«Tu panel», «Llamadas» y «Asistente»—. El protagonista es un portátil en 3D
(three.js) que se abre con el scroll; en su pantalla, en HTML proyectado sobre
la tapa, pasan el panel, el detalle de una llamada y el asistente.

No recibe props y es ancho completo: va directamente en la página. three.js y
el modelo (`public/modelos/macbook.glb`) se cargan al acercarse la sección.
Con `prefers-reduced-motion`, sin WebGL o si el modelo no llega, se cambia por
una versión quieta con los tres pasos en tres tarjetas. El crédito del modelo
al pie (CC BY 4.0, jackbaeten) lo exige su licencia: no lo quites.

La tarjeta de este sistema enseña el escenario al llegar a la sección (paso 1).

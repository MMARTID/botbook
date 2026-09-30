---
category: Marketing
---
«En tu negocio», la sección de la portada que va justo después de «En tu
bolsillo» y enseña el otro lado: lo que ve el dueño. Misma mecánica: la sección
es alta (440vh, `lib/transicion-bolsillo-negocio.ts`) con el escenario pegado
(sticky) y el scroll recorre tres pasos —«Tu panel», «Llamadas» y «Asistente»—.
El protagonista es un portátil en 3D (three.js) que se abre con el scroll; en
su pantalla, en HTML proyectado sobre la tapa, pasan el panel, el detalle de
una llamada y el asistente. La sección solapa el final de «En tu bolsillo»
(116vh de margen negativo): empieza con la tapa cerrada vista desde arriba, su
esquina fundida con la del teléfono volcado, y la cámara se aleja hasta el
encuadre del paso 1 antes de que entre el título.

No recibe props y es ancho completo: va directamente en la página. three.js y
el modelo (`public/modelos/macbook.glb`) se cargan al acercarse la sección.
Con `prefers-reduced-motion`, sin WebGL o si el modelo no llega, se cambia por
una versión quieta con los tres pasos en tres tarjetas. El crédito del modelo
al pie (CC BY 4.0, jackbaeten) lo exige su licencia: no lo quites.

La tarjeta de este sistema enseña el escenario al llegar a la sección (paso 1).

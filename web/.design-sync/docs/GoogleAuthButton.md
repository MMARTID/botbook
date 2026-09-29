---
category: Formularios
---
Botón «Continuar con Google»: blanco con borde `#e5e5e5`, 48 px de alto y
`rounded-[10px]`, con el logotipo de Google, para que se distinga del CTA
primario negro. Lleva encima una `BetaPill`: la app de Google sigue en revisión
y solo entran cuentas de prueba, pero el botón funciona.

Al pulsarlo limpia el error previo (`onError("")`), llama a `beforeStart` si lo
hay y redirige al flujo OAuth de Google; si no consigue la URL, llama a
`onError` con el mensaje. `disabled` lo desactiva, y mientras redirige muestra
«Conectando con Google…».

Puede **crear** una cuenta y no solo iniciar sesión, de ahí `acceptedTerms`:
en el registro pasa al backend que se aceptaron los términos.

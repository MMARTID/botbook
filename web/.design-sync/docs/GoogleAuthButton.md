---
category: Formularios
---
Botón de «Continuar con Google»: estilo secundario en píldora con el logotipo
de Google, para que se distinga del CTA primario negro.

**Hoy no autentica.** El registro público está desactivado a propósito y el
componente **ignora todas sus props** (`onError`, `beforeStart`, `disabled`,
`acceptedTerms`): al pulsarlo abre la burbuja de «próximamente», no el flujo
OAuth. Los tipos se mantienen para que `/login` y `/register` sigan
compilando mientras dura el bloqueo, así que no cuentes con que `disabled`
haga nada.

Importa saberlo porque este mismo botón, cuando se reactive, puede **crear**
una cuenta y no sólo iniciar sesión — de ahí `acceptedTerms`.

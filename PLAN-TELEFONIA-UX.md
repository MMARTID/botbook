# Plan: teléfono, desvío y WhatsApp sin confusión

Estado: **borrador, 21-09-2026**. Nace de la prueba real en producción (#130): el dueño no
sabe qué número es cuál ni cómo se separa lo que llaman los clientes de lo que él lleva en el
bolsillo.

## 1. Qué es confuso hoy

Manejamos tres números con nombres que no dicen su papel, repartidos en tres pantallas:

| Campo | Cómo lo llamamos | Qué es de verdad |
|---|---|---|
| `Business.phone` (de Google Places) | «Teléfono del negocio» (Ajustes › Negocio) | La **línea a la que llaman los clientes**. Es la que hay que desviar y la que la recepcionista dice en voz alta y pone en el SMS («para cambiarla, llama al…»). |
| `Business.telnyxPhoneNumber` | «Tu número de Alhabla» (tarjeta de desvío) | El **destino del desvío**. El dueño no se lo da a nadie: lo marca una vez dentro del código. |
| `Business.ownerWhatsappNumber` | «WhatsApp» (Ajustes › WhatsApp) | El **móvil del dueño**: avisos, recados y el Gestor. |

Lo que falla, visto en el código:

- El alta (`/bienvenida`) pide «tu móvil» y avisa «parece el teléfono del local», pero nunca
  pregunta **cuál es la línea de clientes ni de qué tipo es**. La tarjeta de desvío
  (`call-forwarding-card.tsx`) da por hecho un móvil y relega el fijo a un párrafo.
- No hay forma de saber si el desvío funciona: `OnboardingState.forwardingConfirmedAt` es
  «el usuario dice que sí» hasta que entra la primera llamada real. Un código mal marcado se
  descubre perdiendo un cliente.
- Nadie avisa del **buzón de voz**. En móviles, el contestador es un desvío `**61*` al número
  del buzón: activar el nuestro lo sustituye (bien, pero conviene decirlo). En fijos con
  contestador (Movistar fibra: `*10#`) el buzón se queda las llamadas antes que nosotros.
- Ajustes tiene «Teléfono del negocio» + «WhatsApp» + «Tu número de Alhabla» como tres
  cosas sueltas. Cuando algo falla, el dueño no sabe cuál tocar.

## 2. Decisiones (21-09)

- **Los códigos de desvío son los mismos para todos los operadores en España** (`*21*`,
  `*61*`, `*62*`, `*67*` + número + `#`, con `**` en móviles; se desactivan con `#21#`,
  `##21#`…). No se pide operador ni hay tabla por operador. Solo cambia la
  explicación por **tipo de línea** (fijo o móvil) y la nota del contestador.
- Se añade la opción **«Alhabla como número principal»**: el negocio publica el número de
  Alhabla como su teléfono, sin desvío. La recepcionista lo coge todo y **transfiere al
  dueño** cuando hace falta.
- Un solo mecanismo nuevo de backend: **«Comprobar desvío»** (§ 4). El resto es copy,
  estructura de pantallas y dos columnas.

## 3. Los cuatro casos y cómo se sienten después del plan

**A · Fijo en el local.** Clientes llaman al fijo; el dueño tiene su móvil.
Desvío del fijo con `*21*` (todas) o `*61*` (si no contesta) — sin `**`, desde el propio
aparato tras el tono. Aviso: «si el fijo tiene contestador, desactívalo (`#10#` en Movistar) o
se quedará él las llamadas». Avisos y Gestor al móvil del dueño. La recepcionista dice el
fijo. «Comprobar desvío» es donde más vale: nadie está seguro del código de su fijo.

**B · Móvil de trabajo.** Clientes llaman y escriben a ese móvil.
`**61*` «si no contesta» (recomendado). Pregunta explícita: «¿los avisos te los mando a este
mismo móvil o a otro?» (hoy el alta lo trata como error). Aviso claro: «tus clientes pueden
seguir escribiéndote a tu WhatsApp; las citas por WhatsApp entran por el número de Alhabla».
Nunca mover ese número a la API de WhatsApp: lo sacaría de la app del teléfono.

**C · Todo en el móvil personal.** Autónomo, fisio a domicilio.
`**61*` + `**62*` (apagado) + `**67*` (comunicando, «cuando estoy con un cliente»). Avisos al
**mismo** móvil, con un checkbox «es el mismo», sin sospechas. Ajuste de privacidad: «no des
mi número a los clientes: que dejen recado y les llamo yo» (una línea en el prompt y en el
SMS de cambio/cancelación).

**D · Fijo + móvil.** Dos líneas de clientes, dos desvíos al mismo número de Alhabla. Ya
funciona; solo hay que dejar añadir más de una línea con su tipo y su código.

**E · Alhabla como número principal** (nuevo). Negocio nuevo sin número, o uno que quiere
dejar de depender del desvío: publica el número de Alhabla (Google, web, tarjeta), la
recepcionista lo atiende todo y transfiere al móvil del dueño cuando el cliente lo pide o
cuando ella no puede resolver. Sin desvío que activar ni contestador que estorbe.

## 4. «Comprobar desvío»: el único mecanismo nuevo

Hoy `forwardingConfirmedAt` se rellena con un botón «Ya lo he activado». Pasa a ser una
comprobación real:

1. El dueño pulsa **«Comprobar desvío»** en la tarjeta. Aviso: «te vamos a llamar al
   <línea de clientes>; no lo cojas».
2. `POST /onboarding/forwarding/check` crea una llamada saliente por el adaptador de Telnyx
   (`TelnyxAiAdapter.dialCall`, nuevo) desde el número de Alhabla del negocio hacia la
   línea de clientes, con `timeout_secs` ~25 y `client_state` = `{ businessId, check: <id> }`.
   Se guarda `ForwardingCheck` (id, businessId, línea, `startedAt`, `result: null`) en
   Redis con TTL de 2 min (no hace falta tabla).
3. Si el desvío está bien, esa llamada entra por el número de Alhabla del negocio: el
   webhook `call.initiated` (dirección `incoming`) llega con `from` = el propio número de
   Alhabla del negocio. `webhookHandlers.ts` lo reconoce **antes** de arrancar la
   recepcionista: cuelga, marca el check como `ok` y pone `forwardingConfirmedAt`. Ninguna
   Call ni transcripción se guarda: no es una llamada de cliente.
4. Si no entra en 40 s (el saliente acaba en `hangup` sin haber visto el entrante) → `fallo`
   con el motivo que sepamos: `answered` (el dueño lo cogió), `busy`, `no_answer` sin desvío
   (código mal marcado o contestador), `unreachable`.
5. La tarjeta hace polling a `GET /onboarding/forwarding/check/:id` cada 2 s y muestra
   «Desvío funcionando» o el motivo con qué hacer («no ha saltado: revisa el código; si el
   fijo tiene contestador, desactívalo»).

Coste: una llamada de menos de un minuto por comprobación. Límite: 3 por hora y negocio.
Solo con `telnyxPhoneNumber` activo y línea de clientes distinta del número de Alhabla.

En modo «todas las llamadas» la saliente se desvía al instante y el móvil del dueño ni suena.
En «si no contesta», suena ~15–20 s y luego salta: el aviso «no lo cojas» es imprescindible.

## 5. Fases

### Fase 0 · Datos y nombres (backend, additivo)

- `Business.customerLineType`: `"fijo" | "movil_trabajo" | "movil_personal" | "alhabla"`,
  nullable (negocios antiguos → null, se infiere con `esFijoEspanol(phone)` hasta que el dueño
  lo confirme).
- `Business.ownerPhoneIsCustomerLine: Boolean @default(false)` (caso C: avisos al mismo
  móvil, no hay que preguntar dos veces).
- `Business.hideOwnerNumberFromClients: Boolean @default(false)` (caso C privacidad).
- `OnboardingState.forwardingCheckedAt DateTime?` (comprobado de verdad; distinto de
  `forwardingConfirmedAt`, que sigue siendo «el usuario dice»).
- Migración a mano, solo `ADD COLUMN`. `PATCH /business/me` acepta los tres campos.
- `voiceTools` y `mensajesCliente`: si `hideOwnerNumberFromClients`, la recepcionista no dice
  el número; ofrece «dejo recado y te llaman». Un test por rama.

### Fase 1 · Una sola pregunta al empezar (app, `/bienvenida`)

- Nuevo paso **«¿A qué número te llaman tus clientes?»** con cuatro tarjetas: *el fijo del
  local* / *un móvil de trabajo* / *mi móvil personal* / *todavía no tengo: quiero usar el de
  Alhabla*. Prefijado con lo que diga Google Places (fijo español → «fijo»).
- Según la tarjeta: en B y C se pregunta «¿los avisos a este mismo móvil?» (checkbox, por
  defecto sí); en A se pide el móvil aparte; en E se salta el desvío.
- Se retira el aviso «parece el teléfono del local» y se sustituye por la lógica de arriba.
- La tarjeta de desvío recibe `customerLineType` y muestra **solo** lo que toca: fijo → `*21*`
  y `*61*` sin `**`, con la nota del contestador; móvil → los cuatro códigos de siempre con el
  «recomendado» primero; E → no se muestra.

### Fase 2 · Ajustes › Teléfono (app)

Una sección «Teléfono» con tres bloques que cuentan una historia, en este orden:

1. **Línea de clientes** — número + tipo (editable) + «Comprobar desvío» + estado
   (`comprobado el …` / `sin comprobar`) + códigos de activar/quitar. En D, «Añadir otra
   línea» (lista de líneas: `Business.extraCustomerLines Json?` en la fase 0 si se decide
   entonces; si no, se deja para después).
2. **Tu recepcionista** — número de Alhabla, estado del número, botón «Usar como número
   principal» (→ fase 4), y el enlace a `/agente`.
3. **Tu móvil** — WhatsApp del dueño, avisos, Gestor (el bloque `WhatsappDueno` actual, con
   «es el mismo que la línea de clientes» cuando aplica) y el ajuste «no des mi número a los
   clientes».

Desaparecen como títulos «Teléfono del negocio» y «WhatsApp». El campo `phone` de Negocio
se mueve a este bloque (el formulario de Negocio se queda con nombre, dirección y sector).

### Fase 3 · «Comprobar desvío» (backend + app)

Lo de § 4: `dialCall` en `TelnyxAiAdapter`, `POST /onboarding/forwarding/check`,
`GET …/check/:id`, reconocimiento en `webhookHandlers.ts` (guardado de la comprobación en
Redis), `forwardingCheckedAt`, botón y estados en la tarjeta. Test unitario del webhook
(llamada de comprobación no crea `Call`) y de integración del flujo completo con el webhook
simulado.

### Fase 4 · Alhabla como número principal

Para que E sea real hace falta **transferencia al dueño**:

- Tool `transferir_al_dueno` en la recepcionista (Telnyx `transfer` sobre la llamada en
  curso hacia `ownerPhone`/línea del dueño, con `timeout_secs` 25). Si el dueño no coge,
  vuelve la recepcionista: «no puede atenderte ahora, ¿te llamo yo o te dejo recado?». Regla
  en el prompt: transferir solo si el cliente lo pide o si hay algo que ella no puede
  resolver (queja, urgencia, pago).
- Ajuste «Cuándo transferirme»: *nunca* / *si el cliente lo pide* / *siempre que sea posible
  en mi horario*. Guardado en `agentSettings`.
- Pantalla «Usar Alhabla como número principal»: qué cambia, dónde publicarlo (Google
  Business Profile, web, redes, WhatsApp Business como «otro teléfono»), y qué pasa con el
  número antiguo (mantenerlo con desvío «todas» mientras dure la transición, o darlo de baja).
  Marca `customerLineType = "alhabla"` y oculta la tarjeta de desvío.
- Elección de localidad al comprar el número (ya existe por sector/localidad en la compra;
  aquí solo se explica: «un número de tu provincia inspira más confianza»).
- Portabilidad del número antiguo a Alhabla: **fuera del plan**. Telnyx tiene portabilidad
  en España pero es un trámite de semanas con documentación; si algún negocio lo pide, se
  estudia entonces.

### Fase 5 · Copys y avisos

- Nota del contestador en fijo y móvil.
- Correo/WhatsApp del día 1: «tu desvío está comprobado» o «aún no has comprobado el desvío»
  (recordatorio una sola vez, a las 24 h del alta, si `forwardingCheckedAt` es null y no ha
  entrado ninguna llamada).
- `AGENTS.md` § Telefonía: los tres papeles del número y el flujo de comprobación.

## 6. Riesgos y cómo se acotan

- **La llamada de comprobación la coge el dueño** por reflejo → resultado `answered` con
  texto «la has cogido: vuelve a pulsar y deja que suene». Sin coste real.
- **Desvío «si no contesta» con tiempos largos** en algunos fijos (30 s): `timeout_secs` de
  la saliente a 35 y ventana de 45 s.
- **Doble Call fantasma**: el entrante de comprobación se reconoce por `from` = número de
  Alhabla del propio negocio; ningún cliente llama desde ese número. Si por lo que sea no se
  reconoce, la recepcionista contesta y cuelga a los 30 s de silencio (ya existe).
- **Transferencia** (fase 4) depende de que el móvil del dueño acepte llamadas desde el
  número de Alhabla y de que el cliente no espere más de 25 s: se prueba en producción con
  INFINITY antes de exponerlo.
- **Negocios ya en marcha**: `customerLineType` null no rompe nada; Ajustes muestra «¿de qué
  tipo es esta línea?» una vez.

## 7. Complejidad

| Fase | Trabajo | Riesgo |
|---|---|---|
| 0 | medio día (columnas, PATCH, dos ramas en voz/SMS con tests) | bajo |
| 1 | un día (paso nuevo del alta, tarjeta por tipo) | bajo |
| 2 | un día (Ajustes › Teléfono) | bajo |
| 3 | un día (dial + webhook + polling + tests) | medio: depende de Telnyx en producción |
| 4 | dos días (transfer tool, ajustes, pantalla) | medio-alto: prueba real obligatoria |
| 5 | medio día | bajo |

Orden propuesto: 0 → 3 → 1 → 2 → 5 → 4. La comprobación (3) es lo que más fricción quita
y no depende de rediseñar pantallas; 4 es la que más valor añade a largo plazo pero exige
probar la transferencia con un negocio real.

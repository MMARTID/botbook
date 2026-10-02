# Plan: el WhatsApp del propio negocio (coexistencia)

Versión 1 (2026-10-02). Amplía `PLAN-CANAL-DUENO.md` sin sustituirlo: el WhatsApp de Alhabla
(«Alhabla Reservas» para clientes y «Alhabla» para negocios) sigue siendo el canal por defecto.
Lo nuevo es una opción, **«Conectar mi WhatsApp»**, para que los mensajes a los clientes salgan
del número de WhatsApp Business que el negocio ya usa, sin que el dueño deje de usar su app.

## Decisión de producto

**Modelo híbrido.** Por defecto, todo sigue saliendo del WABA de Alhabla. El negocio que conecta
su número pasa a hablar con sus clientes desde ese número: confirmaciones, recordatorios,
cambios, cancelaciones, hueco libre y, si lo activa, la recepcionista por chat. Los avisos al
dueño y el Gestor siguen en el número «Alhabla» (+34 930 453 218): son de Alhabla para el
negocio, no del negocio para sus clientes.

Por qué ahora:

- El cliente recibe los mensajes del número que ya conoce, con el nombre del negocio, y sus
  respuestas llegan a la app del dueño en lugar de a un número ajeno.
- Los límites de Meta (250 destinatarios/24 h sin verificar) y la calidad pasan a ser **de cada
  negocio**: se acaba el cuello de botella de un WABA compartido por toda la cartera (#103) y un
  negocio con bloqueos no arrastra a los demás.
- Coste igual que hoy: las plantillas ya las pagamos nosotros; seguirán cargándose a nuestra
  cuenta de Telnyx (línea de crédito compartida). Lo que el dueño escribe desde la app es gratis.

Lo que **no** cambia: las llamadas siguen entrando por el desvío de siempre; las llamadas de
WhatsApp siguen descartadas (en coexistencia se quedan en la app y no pasan por la API).

## Lo verificado (2026-10-02)

Fuentes: documentación de Telnyx (Coexistence, Coexistence webhooks, Tech Provider Embedded
Signup), respuesta de soporte de Telnyx del 02-10, API de Telnyx con nuestra clave (solo
lectura) y MCP oficial de Meta `whatsapp_business_tools` (solo lectura).

### Cómo se conecta un negocio

- La página de alta **alojada** por Telnyx (`POST /v2/whatsapp/hosted_signups`) **no soporta
  coexistencia**. Hay que hacer la integración propia de *Tech Provider*:
  1. En nuestra app, `FB.login()` con el `config_id` de la configuración de WhatsApp de nuestra
     app de Meta y `extras = { setup: { solutionID }, featureType:
     "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }`.
  2. Se escucha el `postMessage` de Meta: `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` trae
     `waba_id` y `phone_number_id` (el `FINISH` normal es el alta sin coexistencia).
  3. El backend registra la cuenta en Telnyx: `POST /v2/whatsapp/business_accounts/tech_provider`
     con `{ waba_id, phone_number_id, app_id, customer_id, event:
     "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" }`. Devuelve una sesión de alta que se consulta en
     `GET /v2/whatsapp/signup/{id}/status` hasta un estado final.
  4. Telnyx suscribe el WABA a sus webhooks, comparte la línea de crédito, comprueba
     `is_on_biz_app: true` y arranca la sincronización.
- El dueño, en el flujo de Meta: entra con su Facebook, elige «conectar una app de WhatsApp
  Business existente», escribe su número, acepta en su app un mensaje de la cuenta oficial de
  Meta («Conectar a Business Platform»), decide si comparte 6 meses de historial y pega un código.
- **No queda listo al terminar el alta.** El número pasa por `coexistence_state`:
  `pending_onboarding` → `sync_pending` → `syncing` → `sync_complete` → `active`, con
  `history_declined`, `sync_deadline_expired`, `offboarded` y `disconnected` como desvíos. **Solo
  `active` permite enviar.** La sincronización debe empezar en 24 h (`sync_deadline`); si caduca,
  hay que repetir el alta. Se lee en `GET /v2/whatsapp/phone_numbers/{número}`
  (`is_on_biz_app`, `coexistence_state`, `sync_deadline`, `sync_progress`). Nuestros dos números
  ya devuelven esos campos (`false`/`null`).

### Qué nos llega

- `message.echo` (`origin: whatsapp_business_app`, `direction: outbound`): lo que el dueño
  escribe a mano desde la app. Gratis; **no abre ni alarga la ventana de 24 h**. Llega al
  webhook del **messaging profile** (no al del WABA). Telnyx lo da como «best effort»: desde
  WhatsApp para Windows o WearOS puede no llegar.
- `whatsapp.account.update` con `payload.event` = `ACCOUNT_OFFBOARDED` | `ACCOUNT_RECONNECTED`
  (reabre un ciclo de 24 h) | `PARTNER_REMOVED` (el dueño nos quitó desde su app). Requiere
  `account_update` en los `webhook_events` del WABA.
- `message.received` con `body.type` `edit` o `revoke` para ediciones y borrados del cliente.
- **El historial no nos llega**: Telnyx consume `history` y `smb_app_state_sync` internamente.
  La recepcionista empieza sin contexto previo de ese chat.
- Telnyx **no bloquea nada** si el dueño y el bot contestan a la vez: coordinarlo es cosa nuestra.

### Qué pierde o nota el dueño

- Se **desvinculan los dispositivos acompañantes** (el WhatsApp Web del ordenador de recepción):
  hay que volver a vincularlos.
- Las **listas de difusión** existentes pasan a solo lectura y no puede crear otras.
- Sin mensajes temporales, de «ver una vez» ni ubicación en tiempo real.
- Grupos, llamadas, catálogo, estados, etiquetas, respuestas rápidas y mensajes de bienvenida y
  ausencia **siguen en la app** pero no pasan por la API. Ojo: si deja activo el mensaje de
  ausencia y la recepcionista contesta, el cliente recibe dos respuestas.
- 20 mensajes/s por número (irrelevante para nosotros).
- Para desconectar: app → Ajustes → Cuenta → Plataforma empresarial → Desconectar. La API de
  baja de Telnyx no puede dar de baja un número en coexistencia.
- Requisitos: app de WhatsApp Business ≥ 2.24.17 con el número ya activo en ella, y que quien
  hace el alta sea administrador de la cartera de Meta del negocio (el flujo la crea si no hay).

### Nuestras cuentas

| | Valor | Estado (02-10) |
|---|---|---|
| Empresa de Meta | Alhabla `1414150587329729` | Perfil completo; **verificación pendiente** (llega en 1–2 días) |
| App de Meta | `alhabla` `2349496959195397` | Publicada (Live), con WhatsApp; sin callback propio (todo va por Telnyx) |
| WABA de Alhabla | `1628104425601770` | Aprobada; 2 números `registered`; **18/18 plantillas APPROVED** |
| Enlace app ↔ Telnyx | — | **Pedido el 02-10**; en cola de un agente de Telnyx; luego llega la invitación de Meta (1–2 días hábiles) |
| `solution_id` | — | Saldrá en `GET /v2/whatsapp/foreign_apps` (`app_id`, `solution_id`, `enabled: true`) |

Según Telnyx (02-10): la verificación de empresa **no** es requisito de su lado para el enlace,
pero las altas de negocios reales exigen **acceso avanzado** a `whatsapp_business_management` y
`whatsapp_business_messaging`, que Meta concede tras revisar la app (y la revisión sí pide la
empresa verificada). Mientras tanto se puede probar con nuestra propia cartera y usuarios con rol
en la app. No hay cuota por WABA ni por número: solo el precio por mensaje.

## Diseño destino

### 1. Datos

**Tabla nueva `WhatsappNumeroNegocio`** (una por negocio; no se reutiliza `WhatsappSender`, que
es de Alhabla y tiene `audience @unique`):

| Campo | Notas |
|---|---|
| `businessId` | `@unique`. Un número por negocio |
| `phoneNumber` | E.164, `@unique` |
| `metaPhoneNumberId` | `@unique`; el `phone_number_id` de Meta |
| `metaWabaId` | WABA del negocio (Meta) |
| `telnyxWabaId` | UUID de Telnyx, para `/v2/whatsapp/business_accounts/{id}` y plantillas |
| `signupId` | Sesión de alta de Telnyx |
| `estado` | Espejo de `coexistence_state` + nuestros: `registrando`, `fallido` |
| `syncDeadline`, `ultimaSincronizacionAt` | |
| `plantillasListasAt` | Cuando están APPROVED todas las plantillas de cliente en su WABA (§ 3) |
| `operativoDesde` | `estado = active` **y** plantillas listas: desde aquí sale todo de su número |
| `desconectadoAt`, `motivoDesconexion` | `PARTNER_REMOVED`, `ACCOUNT_OFFBOARDED`, `sync_deadline_expired`… |
| `modoChat` | § 5 |
| `historialCompartido` | Si eligió compartir chats (informativo) |

**`WhatsappTemplate`**: hoy `key @unique` y `@@unique([name, language])` dan por hecho un solo
WABA. Pasa a `@@unique([metaWabaId, key])` y `@@unique([metaWabaId, name, language])`, con
`metaWabaId` **obligatorio** (las filas actuales se rellenan con `1628104425601770`; un NULL
rompería la unicidad en Postgres). Migración en dos pasos (expand/contract), como #77–#79.

**`ClientConversation`**: `pausadaHasta DateTime?` y `ultimoEcoAt DateTime?` (§ 5).

**`WhatsappOptOut`**: hoy es `(phoneNumber, audience)` y un STOP al número de clientes vale para
todos los negocios. Se añade el ámbito del negocio para los STOP que llegan a un número propio
(§ 6).

### 2. Alta en el panel

En **Ajustes › Teléfono**, sección nueva «Tu WhatsApp Business», junto a la del móvil del dueño
(`frontend/src/components/ajustes-telefono.tsx`):

1. Antes del botón, lo que va a pasar, en tres líneas: «Sigues usando tu app como siempre»,
   «Tu WhatsApp Web se desconecta y tendrás que volver a vincularlo», «Apaga tus mensajes de
   ausencia si quieres que conteste la recepcionista».
2. Botón **«Conectar mi WhatsApp»** → carga el SDK de Facebook (`connect.facebook.net`) solo en
   esa página → `FB.login()` con coexistencia → `postMessage` → `POST /whatsapp/propio/registro`.
3. Estado en vivo (consulta cada pocos segundos mientras no sea `active`): «Conectando» →
   «Sincronizando (hasta 24 h)» → «Preparando tus plantillas» → **«Conectado»**. Si caduca o se
   desconecta: qué ha pasado y el botón de volver a conectar.
4. Con el número conectado: el selector de `modoChat` (§ 5) y el enlace a cómo desconectarlo
   desde la app.

Backend (`modules/whatsapp/routes.ts`, autenticadas, `businessId` siempre del JWT):

- `POST /whatsapp/propio/registro` `{ wabaId, phoneNumberId }` (Zod). Comprueba que ese
  `phoneNumberId`/número no esté ya en otro negocio, llama al adaptador
  (`customer_id = businessId`), guarda la fila en `registrando`.
- `GET /whatsapp/propio` — estado para el panel (lee la fila; si no está `active`, refresca contra
  Telnyx con un límite de frecuencia).
- `PATCH /whatsapp/propio` `{ modoChat }`.

Adaptador (`WhatsAppAdapter.ts`, único sitio que habla con Telnyx). El SDK 7.21 no trae
`tech_provider`, `foreign_apps` ni los campos de coexistencia: se llaman con el segundo cliente
del SDK (`baseURL` sin `/v2`, `lib/telnyx.ts`) y métodos genéricos, tipando a mano:
`registrarTechProvider`, `estadoAlta`, `numeroWhatsapp(número)` (con `coexistence_state`),
`configurarWaba(telnyxWabaId, { webhook_url, webhook_events })`, `crearPlantilla`,
`listTemplates(wabaId)` (ya existe; deja de depender de `WHATSAPP_WABA_ID`), `appsEnlazadas()`.

### 3. Plantillas en el WABA de cada negocio

Al pasar a `active`, un job crea en su WABA **solo las plantillas de cliente**:
`confirmacion_cita_v2`, `recordatorio_cita_v2`, `cambio_cita_cliente`,
`cancelacion_cita_cliente` y `hueco_libre`. **Con texto propio**: desde el número del negocio no
cabe «Alhabla Reservas» ni la tarjeta de contacto de Alhabla, y el nombre del negocio ya lo pone
WhatsApp. Se guardan con `metaWabaId` del negocio y sus estados llegan por `whatsapp.template.*`
(el handler busca ya por `telnyxTemplateId`, que es único en toda la cuenta).

Hasta que estén **todas** aprobadas, el negocio sigue enviando desde «Alhabla Reservas»
(`plantillasListasAt` nulo). Se cambia de golpe para que un cliente no reciba la confirmación de
un número y el recordatorio de otro. Si Meta rechaza alguna, alerta en nuestros logs y en el
panel («Preparando tus plantillas» con el motivo) y el negocio se queda en el número de Alhabla.

### 4. Envío

`resolverRemitente(audience)` (`service.ts`) pasa a `resolverRemitente({ audience, businessId,
para })`:

- `owner` → como hoy.
- `client` con negocio **operativo** (`operativoDesde` no nulo y `estado = active`) → su número;
  plantillas resueltas en su WABA.
- En cualquier otro caso → «Alhabla Reservas», con las plantillas de nuestro WABA.

`responder()` (`respuestas.ts`) contesta **desde el número que recibió el mensaje**
(`inbound.toNumber`), no desde el de la audiencia: la ventana de 24 h es por par de números, y
un cliente que escribe al número de la peluquería solo ha abierto esa ventana. (Hoy el comentario
ya dice «desde el mismo número», pero el código usa `resolverRemitente(audience)`; con un solo
número por audiencia daba igual.)

Otros cambios: la vCard de «Alhabla Reservas» no se envía desde un número propio; los botones
del cliente se resuelven exigiendo también `SentMessage.fromNumber === inbound.toNumber`; la
caída de entrega (`service.ts:988`) usa el mismo resolvedor.

### 5. La recepcionista en el número del negocio

Es la parte delicada: el chat es **el del dueño**. Cuatro reglas:

1. **`modoChat` por negocio**:
   - `solo_avisos` — la recepcionista no contesta nunca en el chat; salen las plantillas y se
     procesan los botones (Confirmo, Cancelar). El resto lo lee y contesta el dueño en su app.
   - `fuera_de_horario` — contesta solo con el negocio cerrado según su horario.
   - `siempre` — contesta siempre, con la pausa de la regla 2.

   **Por defecto `solo_avisos`** (decisión del 02-10); el dueño sube de modo en el panel. Los
   modos que contestan exigen además `clientChatEnabled` y `TELNYX_CLIENT_CHAT_ENABLED`, como hoy.
2. **Pausa por eco**: un `message.echo` del número del negocio hacia un cliente pone
   `ClientConversation.pausadaHasta = ahora + 2 h`. Mientras dure, la recepcionista no contesta a
   ese cliente (los botones de las plantillas sí se procesan). Como el eco es «best effort», en el
   panel se dice tal cual: «si contestas desde WhatsApp Web en Windows, puede que no lo veamos».
3. **Nada de bucles entre números nuestros.** Es habitual que el móvil del dueño
   (`ownerWhatsappNumber`) **sea** el WhatsApp Business del negocio. Entonces los avisos de
   «Alhabla» (+34 930 453 218) llegan a ese número y nos vuelven como mensaje entrante de un
   «cliente», y la respuesta del dueño al Gestor nos vuelve como eco. Regla: en un número propio
   se ignora todo lo que viene de o va a un `WhatsappSender` o a otro `WhatsappNumeroNegocio`.
   Sin esto, la recepcionista contestaría a Alhabla y el Gestor a la recepcionista.
4. **Mensajes de ausencia**: si el eco de un mensaje automático de la app (bienvenida/ausencia)
   llega como `message.echo`, pausaría el bot cada vez. Se comprueba en la fase 0; si pasa, la
   pausa ignora ecos con el mismo texto repetido o se pide al dueño apagarlos.

### 6. Entrada

`handleWhatsappMessages` (`webhooks.ts`) mira primero `metadata.phone_number_id` (hoy se parsea
y no se usa) y, si es de un `WhatsappNumeroNegocio`, fija `audience = "client"` y `businessId` del
número: **no pasa por `resolverNegocioDelCliente`**, que solo queda para «Alhabla Reservas». Un
mensaje a un número que no es nuestro ni de un negocio se guarda y se ignora (como hoy).

STOP/BAJA en un número propio: el cliente puede estar escribiendo a una persona («stop, que ya
no voy»). Solo cuenta la palabra sola; la baja vale para **ese negocio** (decisión del 02-10):
deja de recibir mensajes suyos por su número y por «Alhabla Reservas», y los demás negocios no se
ven afectados. La confirmación sale del número del negocio. En «Alhabla Reservas» sigue siendo global.

`webhooksTelnyx/routes.ts` gana dos casos: `message.echo` → pausa (§ 5) y registro;
`whatsapp.account.update` → estado del número, con idempotencia por WABA y evento (pueden llegar
duplicados o desordenados). `message.received` de un número propio: según lo que veamos en la
fase 0 (si Telnyx nos manda el entrante como `whatsapp.messages` del WABA, como hoy, o como
`message.received` del messaging profile), se adapta el parser o se configura el WABA para que
use el formato actual.

### 7. Ciclo de vida y avisos

- `ACCOUNT_OFFBOARDED`, `PARTNER_REMOVED`, `sync_deadline_expired` → el negocio vuelve **en el
  acto** a «Alhabla Reservas» y recibe una alerta operativa (`alertas.ts`, botón «Ir a Ajustes»)
  explicando qué ha pasado.
- `ACCOUNT_RECONNECTED` → `sync_pending`; se vuelve a vigilar el plazo de 24 h.
- El reconciliador (`jobs/telnyxReconciler.ts`) repasa los números propios no `active` y los
  `active` una vez al día, por si se pierde un evento.
- Si el `sync_deadline` está a menos de 6 h sin sincronizar: aviso al dueño.

### 8. Escalera de planes y textos

**En todos los planes** (decisión del 02-10): descarga el WABA compartido y no sube nuestro
coste. Textos: `managedAgentPrompt.ts` (la recepcionista dice
hoy «el WhatsApp de Alhabla»), `mensajes.ts:181,256`, landing y planes.

## Cumplimiento

- Con su número, procesamos conversaciones del negocio con sus clientes que **no** empezaron con
  Alhabla: el contrato de encargado del tratamiento y la política de privacidad deben decirlo.
- Fisioterapia y estética: el dueño ve en su app lo que hablan la recepcionista y el paciente.
  La recepcionista no pide ni repite datos de salud por WhatsApp; se queda en la cita.
- La desconexión es siempre del dueño y desde su app; en el panel lo explicamos, no lo
  escondemos.

## Fases

### Fase 0 — Validación (sin código de producto)

0.1 **Telnyx**: esperar al agente y a la invitación de Meta; aceptarla; comprobar
`GET /v2/whatsapp/foreign_apps` → `solution_id` y `enabled: true`. *(En curso desde el 02-10.)*

0.2 **Meta** (trámites del usuario): verificación de empresa (1–2 días); completar el alta de
*Tech Provider* en el panel de la app; crear la **configuración de WhatsApp** (Facebook Login for
Business) → `config_id`; dominios permitidos del SDK JS (`app.alhabla.ai` y el del túnel de
pruebas). Meta retira la versión 2 del alta guiada el 15-10-2026: confirmar que la configuración
nace en v4 y si `sessionInfoVersion: "3"` sigue siendo el valor correcto.

0.3 **Prueba de concepto** con una SIM española de prueba en WhatsApp Business y nuestra propia
cartera (sin acceso avanzado todavía): una página mínima detrás del túnel con `FB.login()` y el
registro a mano con `curl`. Anotar:

- [ ] que el alta funciona con un móvil español y el tiempo hasta `active`;
- [ ] en qué formato llegan los entrantes (`whatsapp.messages` del WABA o `message.received`) y
      qué messaging profile queda asociado al número;
- [ ] que llega `message.echo` al escribir desde el móvil y **desde WhatsApp Web**;
- [ ] si el mensaje de ausencia de la app genera eco;
- [ ] que `conversation_window` funciona para un número en coexistencia;
- [ ] crear una plantilla en ese WABA por API y que llegue `whatsapp.template.*`;
- [ ] enviar con el `TELNYX_MESSAGING_PROFILE_ID` actual o si hace falta otro;
- [ ] `PARTNER_REMOVED` al desconectar desde la app, y volver a conectar;
- [ ] mensaje de «Alhabla» (+34 930 453 218) a ese número: cómo nos llega (regla 3 del § 5).

0.4 **Revisión de la app** para acceso avanzado: Meta pide un vídeo del flujo en nuestra app, así
que se solicita **después** de la fase 3 (en dev), y no bloquea las fases 1–3.

### Fase 1 — Cimientos

Tabla `WhatsappNumeroNegocio`, ámbito de negocio en `WhatsappOptOut`, `metaWabaId` en `WhatsappTemplate` (expand), métodos del
adaptador, `POST/GET/PATCH /whatsapp/propio`, handlers de `message.echo` y
`whatsapp.account.update` (solo registran y actualizan estado), reconciliador, tests. Interruptor
`WHATSAPP_PROPIO_ENABLED` apagado en prod.

### Fase 2 — Enviar desde el número del negocio

Plantillas de cliente con texto propio y su creación por WABA; `operativoDesde`;
`resolverRemitente` por negocio; `responder()` desde el número entrante; vCard; botones; entrada
por `phone_number_id`; bajas por negocio; regla anti-bucles; vuelta automática a «Alhabla
Reservas». Contract de `WhatsappTemplate`.

### Fase 3 — La recepcionista en su chat

`modoChat`, pausa por eco, horario para `fuera_de_horario`, textos del prompt.

### Fase 4 — Panel

Sección «Tu WhatsApp Business», SDK de Facebook, estados, avisos previos, selector de modo.
Vídeo para la revisión de Meta (0.4).

### Fase 5 — Piloto

Con acceso avanzado concedido: un negocio real, interruptor encendido solo para él, revisar
ecos, pausas y entregas una semana. Después, para todos.

## Variables de entorno previstas

| Variable | Dónde | Notas |
|---|---|---|
| `WHATSAPP_PROPIO_ENABLED` | backend | Interruptor global; `false` por defecto |
| `META_APP_ID` | backend | `2349496959195397`; va en `app_id` del registro |
| `TELNYX_WA_SOLUTION_ID` | backend | De `foreign_apps`; se entrega al panel por la API |
| `NEXT_PUBLIC_META_APP_ID` | frontend | Para `FB.init` |
| `NEXT_PUBLIC_META_WA_CONFIG_ID` | frontend | `config_id` de la configuración de WhatsApp |

Ninguna es secreta (el App Secret no hace falta: Telnyx registra con los IDs del evento). Todas a
`.env.example` y a `docker-compose.yml` (`backend` y `backend-dev`).

## Riesgos

- **Acceso avanzado de Meta**: sin él no hay negocios reales. Depende de la verificación de
  empresa y de una revisión con vídeo; Meta puede pedir cambios.
- **Ecos incompletos**: el dueño contesta desde un cliente que no genera eco y la recepcionista
  contesta encima. Mitigación: `solo_avisos` por defecto y decirlo en el panel.
- **El negocio se desconecta sin darse cuenta** (deja de abrir la app, desinstala, cambia de
  móvil): vuelta automática a «Alhabla Reservas» y alerta.
- **Plantillas rechazadas en un WABA concreto**: el negocio se queda en el número de Alhabla
  hasta corregirlas.
- **WhatsApp Web desvinculado** el día del alta: lo avisamos antes del botón.
- **El SDK de Telnyx no cubre estos endpoints**: tipos a mano y tests contra respuestas reales
  guardadas en la fase 0.

## Decisiones tomadas el 2026-10-02

1. Modelo híbrido: el WABA de Alhabla por defecto, «Conectar mi WhatsApp» como opción.
2. `modoChat` por defecto al conectar: **`solo_avisos`**.
3. Disponible en **todos los planes**.
4. Pausa de la recepcionista tras un eco: **2 horas**.
5. Una baja enviada al número del negocio vale **solo para ese negocio**.

## Preguntas abiertas

1. Qué hacer con los cinco números de reserva cuando esto funcione (¿respaldo o baja?).

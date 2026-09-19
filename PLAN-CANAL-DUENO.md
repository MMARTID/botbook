# Plan: el WhatsApp de Alhabla — un contacto por sector para clientes y negocios

Versión 3 (2026-09-19, noche). Sustituye a las dos versiones del mismo día: la de la mañana
(canal del dueño) y la de la tarde (número de WhatsApp por negocio, llamadas de WhatsApp, modal
con llamada de prueba), que el usuario descartó por añadir trámites con Meta a un producto cuya
gracia es que el negocio no configura nada.

## Decisión de producto

**Un contacto de WhatsApp de Alhabla por sector, "Alhabla · Gestionamos tus reservas", que habla
con el cliente y con el negocio.** La descripción es neutra a propósito: sirve para los dos.
Cinco números de plataforma (peluquería, barbería, salón de uñas, centro de estética,
fisioterapia), cada uno con su imagen y su descripción, dentro del mismo WABA de Alhabla; el
número actual queda para `other` y como respaldo. Ningún número por negocio. Las llamadas
siguen entrando por teléfono con el desvío de siempre.

Los tres casos de uso, tal como los fijó el usuario:

1. **La llamada.** El cliente llama al negocio → el desvío la lleva a Alhabla → la recepcionista
   atiende y reserva → Alhabla manda la **plantilla de confirmación al cliente** → Alhabla manda
   la **plantilla de aviso al negocio**. En el primer WhatsApp al cliente va la tarjeta de
   contacto de Alhabla: a partir de ahí el cliente le escribe a Alhabla, no a la peluquería.
2. **Las conversaciones (Beta).** En cuanto cualquiera de los dos responde, Alhabla puede
   conversar, avisando de que está en Beta y, si es un cliente, de que lo mejor es llamar al
   negocio.
3. **El dueño por chat.** Después del alta puede escribir para **consultar** citas, **añadir**
   citas y **mover o cancelar** citas; en este último caso Alhabla le pregunta si avisa al
   cliente con una plantilla o si prefiere llamarle él y ajustarla después en el chat o en su
   calendario.
4. **El Gestor (añadido con el OK del usuario, misma noche).** La conversación del dueño no
   comparte prompt con la del cliente ni con la recepcionista: es un tipo de assistant propio,
   el **Gestor**, y sirve también para el **onboarding por chat** (crear servicios,
   profesionales, horario, conectar el calendario) y para todos los cambios posteriores. Hay
   **un solo Gestor para toda la plataforma**, no uno por negocio (§ 8).

5. **Sin assistant de cliente (decisión del usuario, 2026-09-20).** Era redundante: la
   recepcionista de cada negocio, la misma que atiende la llamada, atiende también al cliente
   por WhatsApp con las mismas tools (ver su cita, cancelarla, cambiarla, reservar). Un cliente
   con cita que escribe para modificarla ya está cubierto por lo que existe hoy.
6. **Un número de WhatsApp por tipo de negocio (misma fecha).** Así la imagen y la descripción
   del contacto pueden ser distintas para una peluquería y para una clínica de fisioterapia,
   y la calidad del número (que Meta mide por número) queda aislada por sector.

Dos tipos de assistant, y solo uno de ellos por negocio:

| Tipo | Instancias | Canal | Qué hace |
|---|---|---|---|
| Recepcionista | Una por negocio (como hoy) | Voz **y chat de cliente** | Atender clientes: reservar, consultar, cambiar, cancelar |
| Gestor | **Una para toda la plataforma** | Chat del dueño | Onboarding y gestión: servicios, profesionales, horario, agenda, citas, ausencias |

| Alternativa | Por qué se descarta |
|---|---|
| Número de WhatsApp por negocio (el número de Alhabla del negocio registrado en el WABA) | Nombre visible revisado por Meta uno a uno, verificación por llamada de voz de cada número, tope de números por WABA. El negocio no tiene por qué existir en Meta. Descartado el 2026-09-19 (tarde). Lo que sí se hace es **un número por sector** (cinco, de Alhabla): mismo trámite pero una sola vez por sector, no por negocio. |
| Un assistant de chat para clientes | Redundante: la recepcionista del negocio ya sabe ver, cambiar y cancelar la cita del cliente por su número. Descartado el 2026-09-20. |
| Llamadas de WhatsApp (clientes o prueba del onboarding) | Exigen el punto anterior más el límite 2.000 de la cartera. Descartado el mismo día. `PLAN-WHATSAPP-LLAMADAS.md` queda como documento aparte, sin fase. |
| Segundo número Telnyx para el dueño | La numeración española es *voice-only* (error 40323): no podría mensajear. |
| Web Push desde el panel | Frágil para este público (permisos, instalación). Capa opcional futura. |
| Esperar al Alphanumeric Sender ID de SMS | Pendiente de la CNMC y unidireccional. *Fallback* para el dueño sin WhatsApp. |
| Llamadas salientes de la recepcionista | **Descartado por el usuario.** Todo lo que hay aquí es entrante. |
| Atender el WhatsApp *actual* del negocio | Coexistencia sin llamadas por API, y no es lo que se plantea: el cliente pasa a hablar con Alhabla. Nunca se promete en copy. |

## Objetivo

1. Que cada reserva por teléfono termine con dos WhatsApps: la confirmación al cliente y el
   aviso al negocio, los dos con botones.
2. Que el cliente guarde a Alhabla como contacto y, desde entonces, hable ahí con la misma
   recepcionista que le atendió por teléfono: cuándo es mi cita, cómo llego, cancelar, cambiar
   de hora o pedir otra. Llamar sigue siendo la vía rápida; el chat es la cómoda.
3. Que el dueño reciba en su WhatsApp todo lo que requiere su atención (reserva, recado, cita
   que no entró en el calendario, cancelación, alertas) y pueda **consultar, añadir, mover y
   cancelar** citas desde ese chat, con botón de confirmación.
4. Que ambas conversaciones existan como **Beta** declarada: etiqueta, límites, interruptor y
   vía de feedback.
5. Que la recepcionista deje de prometer lo que no cumple (aviso de hueco libre) y que los
   recados dejen de morir en un resumen.
6. Que el negocio no configure nada de WhatsApp: da su móvil y pulsa un botón.

## Límites explícitos

- **Sin llamadas salientes.** Ni de voz ni de WhatsApp, ni al cliente ni al dueño.
- **Un remitente por sector** (tabla `WhatsappSender`: cinco números de Alhabla más el actual
  para `other` y respaldo), todos en el mismo WABA. Nada de números por negocio ni WABA por
  negocio. Cada mensaje nombra al negocio en la primera línea.
- **El cliente habla con la recepcionista del negocio**, por voz o por chat, con las mismas
  tools. Por chat puede consultar, cancelar (botón o texto), cambiar de hora y reservar. No
  hay un assistant de cliente aparte.
- **Las conversaciones son Beta**: la del cliente la lleva la recepcionista con sus reglas de
  siempre (confirmación explícita antes de reservar o cancelar); la del dueño ejecuta acciones
  solo tras pulsar un botón de confirmación generado por el backend.
- Todo por Telnyx con el SDK oficial (`client.messages.sendWhatsapp`, `client.whatsapp.*`,
  `client.ai.assistants.chat`, `client.ai.tools.*`). El MCP de Telnyx no expone `/v2/whatsapp/*`;
  el SDK sí.
- Email como registro y *fallback*; SMS cuando exista Sender ID. No se construye un sustituto
  temporal del SMS.

## Estado actual relevante

- WABA conectado vía Embedded Signup de Telnyx; número remitente y dos plantillas aprobadas
  (`confirmacion_cita`, `recordatorio_cita`) configuradas en producción. Sin evidencia en el repo
  de una entrega real de extremo a extremo a un cliente.
- `WhatsAppAdapter.ts` + `jobs/sendWhatsapp.ts` + cola `send-whatsapp` funcionan para
  confirmación y recordatorio (24 h antes) con consentimiento por voz (`smsConsent`).
- El aviso de hueco libre (`notify_when_available`) está registrado y el prompt lo ofrece
  siempre, pero la plantilla no existe en producción: el aviso se guarda y nunca se envía.
- El SMS de "nueva reserva" al dueño nunca llega (sin Sender ID). El dueño solo se entera por el
  calendario, el panel y el resumen semanal por email (Pro/Scale).
- Recados, devoluciones de llamada y leads viven solo en el resumen de la llamada.
- "Citas pendientes de confirmar" se listan en el panel pero el dueño no puede resolverlas.
- La agenda del panel es solo lectura; sin calendario externo, una cita solo la cancela el
  cliente llamando.
- `/webhooks/telnyx` ya recibe eventos `message.*` y los ignora.
- La clasificación de la llamada llega por `call.conversation_insights.generated` (tres insights
  custom); en Retell por `post_call_analysis_data`.
- Los 9 assistants Telnyx tienen solo `telephony`, sin post-procesado ni webhook de variables
  dinámicas; tools registradas inline (vía marcada como obsoleta por el SDK); todos en `dev-api`.
- Números de WhatsApp por sector, **comprados el 2026-09-20** (locales de Barcelona, 1 $ de
  alta + 1 $/mes cada uno, mismo Requirement Group de España que usa el provisioning, de uno en
  uno porque la cuenta de Telnyx recarga por goteo). Todos con `customer_reference`
  `alhabla-whatsapp-<sector>` y **desvío permanente al móvil del usuario** (+34 692 138 456)
  para recibir la llamada de verificación de Meta. Al comprarlos quedaron en
  `requirement-info-under-review` (revisión regulatoria de Telnyx). Ninguno registrado aún en el
  WABA (tope de 2 números hasta #103).

  | Sector | Número | Id en Telnyx |
  |---|---|---|
  | `peluqueria` | +34 930 454 394 | `3052564312288658571` |
  | `barberia` | +34 930 454 372 | `3052564335894201490` |
  | `salon-de-unas` | +34 930 454 382 | `3052564355263497366` |
  | `centro-de-estetica` | +34 930 454 375 | `3052565552728900934` |
  | `fisioterapia` | +34 930 454 393 | `3052565576250557770` |
  | `other` / respaldo | `WHATSAPP_TELNYX_FROM_NUMBER` (el actual) | — |
- `Business.phone` viene de Google Places: es el fijo del local, no el WhatsApp del dueño.
  La dirección de Places se guarda como texto dentro de `businessDetails`; no hay `address` ni
  `placeId` estructurados.
- Backend con `telnyx@7.17.0` y `WhatsAppAdapter.ts` con `fetch`; la 7.21 expone
  `messages.sendWhatsapp`, `whatsapp.*`, `ai.assistants.chat`, `ai.tools.*`, `ai.conversations.*`.

## Hallazgos de la API de Telnyx (2026-09-19)

Verificados contra el MCP de Telnyx, la documentación pública y las skills oficiales del SDK
(`telnyx-whatsapp`, `telnyx-messaging`, `telnyx-ai-assistants`, `telnyx-verify`, JavaScript,
plugin 0.4.0).

| Capacidad | Dónde | Uso en este plan |
|---|---|---|
| Plantillas: componentes `HEADER`, `BODY`, `FOOTER`, `BUTTONS`; botones `QUICK_REPLY` (payload por envío), `URL` (un sufijo dinámico), `PHONE_NUMBER` (fijo), `COPY_CODE` | SDK `telnyx-whatsapp` | Todos los avisos llevan botones. **No existe componente de contacto**: la vCard no cabe en una plantilla |
| Mensaje `contacts` (tarjeta vCard), `text`, `interactive`, `location`, `reaction`: **solo dentro de la ventana de 24 h** | SDK `telnyx-whatsapp` | La tarjeta de Alhabla se envía al pulsar *Guardar contacto* (el toque abre la ventana) |
| Mensajes interactivos: `button` (hasta 3), `list`, `cta_url` | Documentación | Listas para elegir cita; botones en respuestas dentro de ventana |
| Perfil del remitente: `GET/PATCH /v2/whatsapp/phone_numbers/{n}/profile` (`about`, `description`, `address`, `email`, `website`, categoría, foto) | Skill curl / índice API | "Alhabla · Gestionamos tus reservas" se configura por API; es la tarjeta que ve el cliente al tocar el chat |
| Ventana de 24 h: se abre cuando el destinatario escribe; fuera, solo plantilla | Documentación | Los botones del dueño mantienen su ventana abierta ⇒ avisos gratis (§ 9). Que un toque de botón abre ventana se confirma en fase 0 |
| Plantillas por API: `client.whatsapp.templates.create/list`, `template_id`, estados, `quality_rating`; webhooks `whatsapp.template.approved/rejected/disabled`; Meta puede reclasificar `UTILITY` → `MARKETING` | SDK `telnyx-whatsapp` | Script de creación; tabla `WhatsappTemplate`; textos secos y transaccionales |
| Webhooks de entrega `message.sent/finalized` (`queued`, `sent`, `delivered`, `read`, `failed`), `cost.amount`, `errors[]`; de calidad `whatsapp.phone_number.quality_changed`, `whatsapp.account.restricted`; suscripción con `businessAccounts.settings.update` | SDK | `SentMessage` con entrega y coste real; monitor de calidad por evento |
| Errores: `131026` sin WhatsApp, `131047` fuera de ventana, `132015` plantilla pausada, `132000` parámetros, `40008` genérico | SDK | `131026` en el móvil del dueño ⇒ email en el acto y aviso en el panel |
| Límite de mensajes iniciados por nosotros: destinatarios únicos/24 h **por cartera** (250 sin verificar → 2.000 con empresa verificada y nombre aprobado → 10K → 100K, sube con volumen y calidad) | Verificado el 2026-09-18 | Con un solo número, es el techo de toda la plataforma: la verificación de empresa de Alhabla en Meta es trámite de fase 0 |
| Nombre visible: solo aparece como remitente tras verificación de empresa y aprobación del nombre; antes el cliente ve el número | Verificado el 2026-09-18 | Mismo trámite |
| El payload de `message.received` documentado en el SDK solo contempla `SMS, MMS`; la forma del entrante de WhatsApp (texto, botón, lista) **no está documentada** | SDK `telnyx-messaging` | Fase 0.1 es bloqueante |
| Auto-respuestas por palabra clave y país (`op: start/stop/info`) | SDK | Solo SMS; en WhatsApp el `STOP` lo gestiona Alhabla |
| `client.ai.assistants.chat` (**BETA**) con `conversation_id`: ejecuta tools y devuelve `content`; `client.ai.conversations.*` para historial | SDK `telnyx-ai-assistants` | Las dos conversaciones (cliente y dueño) sin bucle de LLM propio; kill switch y sustituto |
| `tools[]` inline **obsoleto** para integraciones nuevas; *shared tools* (`ai.tools.create` + `tool_ids`) | SDK | Toda tool nueva se define una vez y se adjunta por id; migrar las de voz es trabajo aparte |
| Post-conversación (`post_conversation_settings.enabled`): el mismo modelo, con todo el contexto, ejecuta tools al colgar | Release 2026-04-21; campo presente en nuestros assistants | `informar_al_negocio`: recado y clasificación; sustituye a los insights |
| Memoria entre conversaciones, compartida entre voz y mensajería, por `memory.conversation_query` en el webhook de variables dinámicas | Documentación | Fase 3, dueño y clientes, con RGPD |
| El timeout del webhook de variables dinámicas es **configurable hasta 10 s** (`dynamic_variables_webhook_timeout_ms`; 1,5 s por defecto, *best effort* si vence); la respuesta admite `dynamic_variables`, `memory` y `conversation.metadata` | Documentación *Dynamic Variables* | Tumba la objeción del plan Telnyx §2 para chat: un Gestor único puede recibir el contexto del negocio al empezar cada conversación |
| Catálogo y precios reales de la cuenta (`GET /ai/models`, 2026-09-19): `openai/gpt-5.6-luna` (el de las recepcionistas) 0,20 $/M entrada, 1,20 $/M salida, 0,02 $/M en caché; `anthropic/claude-haiku-4-5` 1/5/0,10; `zai-org/GLM-5.3-Flash` 0,135/0,45/0,027 con región **EU**; `Qwen/Qwen3-235B-A22B` y `Llama-3.3-70B` también con región EU; los modelos de OpenAI y Anthropic no declaran región | MCP `retrieve_models_ai` | Un turno del Gestor cuesta ~0,002 $; el chat tolera cambiar de modelo, así que si la residencia UE (#13-16) se vuelve obligatoria, el Gestor pasa a un modelo europeo sin tocar nada más |
| `client.ai.assistants.tools.test` | SDK | Tests de contrato de las tools nuevas |
| Verify por WhatsApp (`triggerWhatsappVerification` + `byPhoneNumber.actions.verify`) | SDK `telnyx-verify` | Alternativa al botón *Activar avisos*; no es la vía principal |
| `telnyx_end_user_target_verified` (STIR/SHAKEN, EE. UU.) | Documentación | No aplica en España |

## Diseño destino

### 1. Un contacto por sector: los perfiles de Alhabla

- Cinco números de Alhabla, uno por `businessType` (`peluqueria`, `barberia`, `salon-de-unas`,
  `centro-de-estetica`, `fisioterapia`); el número actual sirve a `other` y de respaldo. Todos
  en el mismo WABA: mismas plantillas (no hay que reaprobar nada) y mismo límite de cartera.
- Nombre visible «Alhabla» en todos (Meta exige que se relacione con la empresa de la cartera;
  «Alhabla · Peluquerías» se pide como variante y, si Meta lo rechaza, queda «Alhabla»).
  `about`: «Gestionamos tus reservas». `description`, foto y categoría **por sector**
  (peluquería/barbería/uñas/estética con categoría *Belleza, spa y salón*; fisioterapia con
  *Salud*). Se fija por API (`PATCH …/profile`) desde un script y se revisa en el
  reconciliador.
- El remitente de cada envío se resuelve por `Business.businessType` → `WhatsappSender`; si el
  número del sector no está `verified`, se usa el de respaldo. Los webhooks entrantes llegan
  con `to` = número del sector, lo que ya acota la búsqueda del negocio.
- Ventaja de calidad: Meta puntúa cada número; un mal mes en un sector no arrastra a los demás.
- Alta de cada número en WhatsApp (una vez, por Alhabla): registro en el WABA con verificación
  **por voz** (los números españoles no reciben SMS), y para eso cada número lleva **desvío
  permanente de llamadas al móvil del usuario** (`call_forwarding: always → +34 692 138 456`),
  que escucha el código y lo envía con `POST /whatsapp/phone_numbers/{n}/verify`. Tras
  verificar, el desvío se mantiene (nadie marca esos números; si alguien lo hace, llega al
  usuario) o se cambia a un aviso grabado, a decidir en la fase 0.9.
- **Tope de Meta**: hasta verificar la empresa (issue #103) un WABA admite **2 números**; con
  el actual ya hay uno. Los cinco de sector esperan a #103.
- La tarjeta de contacto (vCard `contacts`) lleva ese nombre y ese número, y se envía cuando el
  cliente pulsa *Guardar contacto* en la confirmación (§ 5). No cabe en la plantilla: el toque
  abre la ventana de 24 h y la vCard sale al instante como mensaje libre.
- **Cada mensaje nombra al negocio en la primera línea**: "Soy Alhabla, gestiono las reservas de
  Peluquería Ana." La primera vez completa; después "Peluquería Ana:" basta.
- La recepcionista **anuncia el WhatsApp por voz** al pedir el consentimiento: "te llegará un
  WhatsApp de Alhabla con la confirmación". Sin esto el primer mensaje parece spam.

### 2. Alta del dueño

1. En el asistente de alta, junto al negocio de Places: campo **"Tu móvil con WhatsApp"**
   (`ownerWhatsappNumber`, E.164). El fijo de Places sigue en `Business.phone`.
2. Al terminar el alta, Alhabla envía la plantilla `bienvenida_negocio` con el botón
   **Activar avisos**. El toque = consentimiento fechado (`ownerWhatsappOptInAt`) + ventana
   abierta. Error `131026` ⇒ "ese número no tiene WhatsApp", campo en rojo en el panel y
   fallback por email.
3. Respuesta inmediata en texto libre: qué va a recibir, qué puede escribir, y botones para el
   cierre del día (opcional) y el aviso por reserva (activado).
4. `STOP`/`BAJA` en cualquier momento ⇒ `ownerWhatsappOptOutAt`, último mensaje de confirmación,
   silencio hasta nuevo *Activar avisos* (desde Ajustes).
5. Alternativa: QR/enlace `wa.me` con «ALTA <código>» en Ajustes, para quien no completó el
   alta o cambia de móvil.

### 3. Caso 1: la llamada y sus dos plantillas

```
Cliente llama → desvío → recepcionista reserva (consentimiento por voz, anuncia el WhatsApp)
  → cola send-whatsapp:
      · confirmacion_cita_v2 → cliente   (botones: Guardar contacto · Cómo llegar)
      · nueva_reserva_negocio → dueño     (botones: Vale · Ver agenda de hoy)
  → recordatorio_cita_v2 la víspera → cliente (Confirmo · Cancelar · Cambiar)
```

- Las dos salidas son idempotentes por `booking:<id>:<tipo>` en `SentMessage`.
- Si el dueño tiene ventana abierta, el aviso va como interactivo (gratis); si no, plantilla.
- Si el cliente no dio consentimiento por voz, no hay mensaje al cliente y sí al dueño.

### 4. Mensajes al negocio

| # | Disparador | Contenido | Botones | Efecto | Por defecto |
|---|---|---|---|---|---|
| 1 | Reserva confirmada | "Peluquería Ana: nueva cita. Marta, jueves 17:00, corte, con Laura." | *Vale* · *Ver agenda de hoy* | Nada / lista interactiva del día | **Activado** |
| 2 | Post-conversación devuelve recado o petición de devolución de llamada | "María, 612 345 678, quiere saber si hacéis balayage y que la llames." | *Atendido* · *Recuérdamelo mañana* | Resuelve el `Lead` / reprograma a las 9:00 | Activado |
| 3 | `pending_booking` (calendario caído, conexión caducada, lock) | "Juan, martes 17:00, no entró en tu calendario: <motivo>." | *La apunté yo* · *Reintentar* · *Reconectar* | Reserva local / `retry-failed-booking` / enlace a Ajustes › Calendario | Activado |
| 4 | El cliente cancela (voz o botón) | "Laura canceló el jueves 12:00 (mechas). Hueco libre." | *Vale* · *Avisar a quien esperaba* | Nada / lista de espera (§ 5) | Activado |
| 5 | Alerta operativa (calendario desconectado, número no activo, prueba que termina, 80 % de minutos, pago fallido) | Texto según causa | *Ir a Ajustes* (URL con sufijo) | — | Activado; facturación también por email |
| 6 | Cierre del día (hora configurable) | "Hoy: 9 llamadas, 6 citas, 1 recado. Mañana: 11 citas, la primera 9:30." | *Ver mañana* · *Silenciar* | Lista del día siguiente / apagar | **Opcional**, apagado |

### 5. Mensajes al cliente

| Plantilla | Cuándo | Botones | Efecto |
|---|---|---|---|
| `confirmacion_cita_v2` | Tras reservar (voz, o el dueño por chat si lo pide) | *Guardar contacto* · *Cómo llegar* | vCard de Alhabla en el chat / URL al mapa del negocio (sufijo = `placeId`) |
| `recordatorio_cita_v2` | 24 h antes | *Confirmo* · *Cancelar* · *Cambiar* | `confirmedByClientAt` / cancela, libera, avisa al dueño (#4), dispara lista de espera / abre el chat con la recepcionista: "¿Qué día y hora te vienen bien?" |
| `cambio_cita_cliente` | El dueño movió la cita y pidió avisar | *Vale* · *No me va bien* | — / aviso al dueño con el teléfono del cliente |
| `cancelacion_cita_cliente` | El dueño canceló y pidió avisar | *Vale* | — |
| `hueco_libre` | Se libera la hora que pidió | *Sí, resérvala* · *Ya no* | Reserva si sigue libre (`availabilityToken`, 10 min) / cierra el aviso |

- `Cambiar` pasa el turno a la recepcionista del negocio por chat (§ 7): busca la cita por el
  número (`find_my_appointment`), comprueba hueco, cancela y reserva la nueva con confirmación
  explícita, como por voz. Si el cliente prefiere hablar, el teléfono del negocio va en el
  texto.
- La frase "te aviso por WhatsApp si se libera" solo entra en el prompt cuando `hueco_libre`
  esté aprobada; hasta entonces la tool se retira.

### 6. Entrada: el webhook de mensajería

`message.received` en `/webhooks/telnyx`, misma firma e idempotencia que los eventos de voz,
tabla `InboundMessage`. Enrutado, en este orden:

1. **`STOP`/`BAJA`/`ALTA`**: deterministas, antes que nada. `STOP` de un cliente es global para
   ese número (todos los negocios); la recepcionista deja de ofrecerle WhatsApp.
2. **Botón** (`button_reply.id` o payload de `quick_reply`): handler por prefijo (`booking:`,
   `lead:`, `watch:`, `digest:`, `contact:`). Nunca pasa por el LLM.
3. **Identificar al remitente**: `ownerWhatsappNumber` de algún negocio ⇒ dueño; teléfono con
   reservas y consentimiento ⇒ cliente; ambos ⇒ se pregunta con dos botones ("¿Como dueño de
   Barbería Paco o como cliente de Peluquería Ana?"); ninguno ⇒ una única respuesta fija por día
   ("Soy Alhabla, gestiono reservas de negocios; para reservar, llama a tu negocio").
4. **Texto libre del dueño**: nivel 1, palabras clave (`agenda`, `hoy`, `mañana`, `pausa`,
   `ayuda`); si no encaja, nivel 2 (§ 8).
5. **Texto libre del cliente**: la recepcionista del negocio por chat (§ 7). El número de
   destino (`to`) ya acota el sector; si aun así tiene citas en más de un negocio de ese sector,
   primero lista para elegir.

### 7. Conversación con el cliente: la recepcionista por chat (Beta)

No hay assistant de cliente. El texto libre de un cliente va, por `client.ai.assistants.chat`,
a la **recepcionista de su negocio** (el mismo assistant Telnyx que atiende la llamada), con
sus mismas tools: `get_catalog`, `check_availability`, `book_appointment`,
`find_my_appointment` (por el número desde el que escribe), `cancel_appointment`,
`notify_when_available`.

- Conversación por cliente y negocio (`ClientConversation`), creada por Alhabla con
  `metadata { business_id, client_phone, role: "client", channel: "whatsapp" }`; el negocio
  se resuelve por el `to` del mensaje (sector) más las citas del número; `conversation_id`
  fija el negocio para el resto del hilo.
- **Modo chat en el prompt de la recepcionista**: un bloque corto y condicional. El backend
  antepone `[WhatsApp]` a cada mensaje del cliente y el prompt dice: "Si el mensaje empieza por
  [WhatsApp] estás en un chat: no uses end_call, no hables de audio, puedes usar dos o tres
  líneas y una lista corta, sigue sin emojis; el consentimiento de WhatsApp ya está dado (te
  está escribiendo); si prefiere hablar, dale el teléfono del negocio". Todo lo demás (no
  inventar, confirmar antes de reservar o cancelar, asignación por especialidad) se aplica
  igual. Si la fase 0.4 confirma que el webhook de variables dinámicas se dispara en chat, el
  marcador se sustituye por `{{canal}}`.
- Lo que el cliente puede hacer por chat: ver su cita, cancelarla, cambiarla de hora, reservar
  otra, preguntar horario, dirección y precios. Cada acción con confirmación explícita, como
  por voz; nada de botones de confirmación generados por el backend en este lado (la
  recepcionista ya confirma en lenguaje natural y es el flujo probado).
- Coletilla "_Beta · si prefieres, llama a Peluquería Ana: 9XX_" en cada respuesta de texto
  libre. 20 mensajes por cliente y día. Interruptor `TELNYX_CLIENT_CHAT_ENABLED` y por negocio.
- Post-conversación e `informar_al_negocio` se aplican también a estas conversaciones: un
  recado por chat llega al dueño igual que uno por voz.

### 8. El Gestor: conversación del dueño y onboarding por chat (Beta)

**Un assistant Telnyx para toda la plataforma**, `alhabla-gestor`, distinto de la recepcionista
y del assistant de cliente. No hay un Gestor por negocio: hoy sostienen "un assistant por
negocio" unas 2.800 líneas de creación, sincronización y reconciliación
(`telnyxAgentSync`, `telnyxAssistantPayload`, `agentBootstrap`, `telnyxReconciler`, el
adaptador), y de ahí han salido los bugs más caros del mes (assistants sin tools tras el
cutover, mudos al rotar ngrok, scripts de resync). Un Gestor único no se sincroniza: un prompt,
una versión, cero reconciliación.

El dueño escribe al número de **su sector** (el mismo contacto que ven sus clientes); el
Gestor único está detrás de los cinco.

**El negocio es dato, no prompt.** La recepcionista lleva su catálogo horneado en las
instrucciones porque una llamada no espera; el Gestor no lo necesita:

- La conversación la crea Alhabla (`client.ai.conversations.create`) con `metadata:
  { business_id, role: "owner" }`; `Business.ownerConversationId` la guarda (rota a los 30 días
  o con `BAJA`).
- Toda tool resuelve el negocio a partir del `conversation_id` en el backend; el aislamiento
  multi-tenant lo garantiza Alhabla, nunca el LLM.
- El nombre del negocio y su estado llegan al empezar por una de dos vías, a elegir en la fase
  0.4: el webhook de variables dinámicas (si Telnyx lo dispara en conversaciones creadas por
  API) o una tool `contexto_negocio` que el Gestor llama en el primer turno y devuelve nombre,
  plan, checklist de onboarding y minutos.

**Tools del Gestor** (*shared tools* adjuntas por `tool_ids`; misma firma que
`/webhooks/telnyx/tools/:toolName`; todas reutilizan los servicios que ya usan las rutas del
panel, límites de plan incluidos):

| Grupo | Tools |
|---|---|
| Estado | `contexto_negocio` |
| Catálogo (onboarding y cambios) | `crear_servicio`, `editar_servicio`, `retirar_servicio`, `crear_profesional`, `retirar_profesional`, `fijar_especialidad` (los tres niveles), `fijar_horario`, `cerrar_dia`, `conectar_calendario` (devuelve el enlace) |
| Agenda | `listar_agenda`, `resumen_llamadas`, `añadir_cita`, `mover_cita`, `cancelar_cita`, `marcar_ausencia`, `bloquear_franja`, `resolver_pendiente` |
| Control | `proponer_accion` (la única vía de ejecutar algo: el backend añade el botón) |

**Onboarding por chat.** Tras *Activar avisos*, el Gestor lee `contexto_negocio` y guía lo que
falte: "Vamos a preparar tu recepcionista. ¿Qué servicios ofreces y cuánto duran?" → "corte 30
min 15 €, color hora y media 60 €, barba 20 min" → tabla propuesta → *Confirmar* → "¿Quién
trabaja contigo?" → "Laura y Marta; Laura hace color" → *Confirmar* → "Tu horario según Google
es L-V 9:30-20:00 y S 9:30-14:00, ¿es correcto?" → *Sí* → "Conecta tu calendario aquí: <enlace>".
El asistente web de alta se mantiene (el checkout lo necesita y es la primera pantalla); el
Gestor completa lo que el dueño saltó y gestiona todo lo posterior: "sube el corte a 17 €",
"Marta ya no trabaja aquí", "el 12 de octubre cerramos". Cada cambio de catálogo dispara la
misma sincronización de la recepcionista que hoy dispara el panel.

**Gestión de la agenda:**

- **Consultar**: "¿qué tengo mañana?" ⇒ `listar_agenda` ⇒ lista interactiva; "¿cuántas
  llamadas esta semana?" ⇒ `resumen_llamadas`.
- **Añadir** (acto de gestión en nombre de un cliente, no una conversación de recepcionista):
  "apunta a Marta mañana a las 5, corte" ⇒ `check_availability` ⇒ propuesta ("Marta, jueves
  17:00, corte, con Laura") con *Confirmar* · *Otra hora* ⇒ al confirmar, `añadir_cita` ⇒ "¿Le
  mando la confirmación por WhatsApp? Necesito su número" ⇒ *Sí* (envía
  `confirmacion_cita_v2`) · *No*.
- **Mover o cancelar**: "mueve la de Marta al viernes a las 6" ⇒ si hay dos Martas, lista ⇒
  `check_availability` ⇒ propuesta con *Confirmar* · *Antes la llamo* (responde con el teléfono
  del cliente y deja la acción pendiente 24 h: el dueño vuelve al chat o la mueve en su
  calendario, que Alhabla reconcilia) ⇒ al confirmar, se mueve/cancela ⇒ "¿Aviso a Marta por
  WhatsApp?" *Sí* (`cambio_cita_cliente` / `cancelacion_cita_cliente`) · *La llamo yo* (teléfono
  del cliente).
- **Ausencias y bloqueos** ("Laura no viene el viernes", "cierra el sábado tarde") ⇒
  `marcar_ausencia` / `bloquear_franja` con *Confirmar*.

**Reglas:**

- **Regla de oro**: el LLM nunca ejecuta nada; llama a `proponer_accion` y el backend añade el
  botón. El botón ejecuta. Vale para citas y para catálogo por igual.
- Etiqueta "_Beta · escribe AYUDA_" en cada respuesta de texto libre; `MAL` guarda la última
  pareja en `OwnerChatFeedback`; 60 mensajes por dueño y día; interruptor global
  (`TELNYX_OWNER_CHAT_ENABLED`) y por negocio (`ownerChatEnabled`).
- Capa determinista antes del LLM (botones y palabras clave); respuestas de tools compactas;
  prefijo de prompt estable para aprovechar la caché.
- Modelo: el mismo que las recepcionistas (`openai/gpt-5.6-luna`, ~0,002 $ por turno; un dueño
  con 60 mensajes/día ≈ 3,5 $/mes, uno normal céntimos), con `fallback_config`. Si la residencia
  UE lo exige, `zai-org/GLM-5.3-Flash` o `Qwen3-235B` (región EU) sin cambiar nada más.
- `client.ai.assistants.chat` es Beta en Telnyx: si cambia o se retira, el Gestor se
  reimplementa como bucle propio (Claude + las mismas tools, en proceso) sin tocar alta,
  botones, plantillas ni panel. Se elige Telnyx por un solo proveedor y una sola factura,
  conversaciones y memoria voz+chat en el mismo sitio, y tools ya construidas como webhooks
  firmados.

### 9. Ventana de 24 h y coste

- Plantilla de utilidad: unos céntimos (Meta + Telnyx; el coste real llega en
  `message.finalized`). Mensaje dentro de la ventana abierta por el usuario: gratis.
- Todos los avisos al dueño llevan botón. **Mientras el dueño pulse uno al día, sus avisos son
  texto libre y gratis.** Al inicio de cada envío se mira `ownerWindowOpenUntil` (última
  entrada + 24 h): dentro ⇒ interactivo; fuera ⇒ plantilla.
- Estimación con aviso por reserva y dueño que no interactúa: 15 reservas/día ≈ 10 €/mes.
  Contador mensual por negocio en `SentMessage`; alerta interna a 300 mensajes.
- Que un toque de botón de plantilla abra la ventana se confirma en fase 0.1.

### 10. Post-conversación: `informar_al_negocio`

Se activa `post_conversation_settings.enabled` y un bloque "Al terminar la llamada" llama una
vez a la *shared tool* `informar_al_negocio`:

```text
resultado: RESOLVED | FRUSTRATED | NO_ANSWER | ESCALATED | LEAD_CAPTURED
motivo_escalada: CLIENTE_LO_PIDIO | FALLO_TECNICO | FUERA_DE_HORARIO | CONSULTA_COMPLEJA | NO_APLICA
fallo_de_tool: boolean
servicio_pedido: nombre del catálogo | null
recado: { nombre, telefono, motivo, quiere_que_le_llamen } | null
```

Sustituye a los tres insights y al `post_call_analysis_data` de Retell como fuente de
`Call.outcome`, `escalationReason`, `toolFailureDetected`, `requestedService`, con doble
escritura hasta medir concordancia. `recado` ⇒ `Lead` tipo `message` ⇒ mensaje #2. Idempotente
por `call_control_id`; si no llega en 5 minutos, el reconciliador lo marca.

### 11. Memoria entre canales (fase 3)

Decisión del usuario (mañana): dueño y clientes. `dynamic_variables_webhook_url` devolviendo
solo `memory.conversation_query` (+ `es_dueno`), acotada **siempre** a
`metadata->assistant_id=eq.<este negocio>` y al número. Cliente: últimas 5 conversaciones con
ese negocio; reconocer, proponer lo habitual, no repetir preguntas; nunca datos de salud. RGPD
antes de activar para clientes: `/legal/privacidad`, retención, `OLVIDAR` por WhatsApp o por
voz.

### 12. Fallbacks

- Dueño sin WhatsApp: #2, #3 y #5 por email (ya funciona); SMS cuando exista Sender ID.
- `131026` ⇒ `ownerWhatsappUnreachableAt`, email en el acto, aviso en el panel.
- Calidad por webhook: `YELLOW` ⇒ se pausa el cierre del día y #1 opcionalmente; `RED` ⇒ solo
  #2, #3 y #5; `account.restricted` ⇒ alerta inmediata.

### 13. Panel

- Alta: campo del móvil con WhatsApp; checklist con el paso "Activa los avisos" hasta el toque.
- Ajustes › WhatsApp: número, estado (activo / sin WhatsApp / baja), aviso por reserva sí/no,
  cierre del día y hora, chat Beta sí/no, botón *Reenviar activación*, QR de ALTA.
- Inicio: pendientes con estado (avisada, resuelta por el dueño, reintentada).
- Llamadas: recado como bloque propio con su estado.
- "Tu chat con la recepcionista" con badge «Beta»: historial (API de conversaciones) y cuadro
  de texto contra el mismo `chat`.

## Cambios de datos

### `Business`

- `ownerWhatsappNumber String?`, `ownerWhatsappOptInAt`, `ownerWhatsappOptOutAt`,
  `ownerWhatsappUnreachableAt`, `ownerWindowOpenUntil DateTime?`, `ownerAltaCode String? @unique`.
- `notificationPrefs Json` (`avisoPorReserva: true`, `cierreDelDia: false`, `cierreDelDiaHora`,
  `canalFallback`), `ownerChatEnabled Boolean @default(true)`,
  `memoryEnabledForClients Boolean @default(false)`.
- `address String?`, `placeId String?` (de Places, para *Cómo llegar*).

### `Business` (conversaciones)

- `ownerConversationId String?` (conversación del dueño con el Gestor único). Los IDs de los
  dos assistants de plataforma (Gestor y Cliente) y de las *shared tools* van en variables de
  entorno, no por negocio.

### `Call`

- `postCallReport Json?`, `postCallReportAt`.

### `Lead`

- Tipos nuevos: `message` (recado), `client_cancellation`, `pending_owner_action` (acción
  propuesta en el chat a la espera de botón, 24 h). `notifiedAt`, `notifiedVia`, `snoozedUntil`.

### `Booking`

- `confirmedByClientAt`, `cancelledBy` (`client_voice | client_button | owner_chat | system`),
  `cancelledAt`, `createdVia` (`voice | owner_chat`), `clientNotifiedAt`.

### Nuevas tablas

- `ProfessionalAbsence`, `ScheduleBlock` (ausencias y bloqueos; `availability.ts` y
  `get_catalog` los respetan).
- `InboundMessage` (`providerMessageId @unique`, `fromNumber`, `businessId?`, `role`
  `owner | client | unknown`, `kind` `button | text | keyword`, `payload`, `handledAt`, `handler`,
  `error`).
- `WhatsappTemplate` (`key @unique`, `name`, `telnyxTemplateId @unique`, `language`, `category`,
  `status`, `qualityRating`): fuente de verdad de qué plantilla usar y si está aprobada, por
  script y webhooks. Sustituye a las variables `WHATSAPP_TEMPLATE_*`.
- `ClientConversation` (`clientPhone`, `businessId`, `conversationId`, `lastInboundAt`): estado
  del chat del cliente con la recepcionista de ese negocio.
- `WhatsappSender` (`businessType @unique`, `phoneNumber`, `telnyxPhoneNumberId`,
  `displayName`, `status` `pending | verified | calling_disabled`, `qualityRating`,
  `profileVersion`): los remitentes por sector y el de respaldo. Sustituye a
  `WHATSAPP_TELNYX_FROM_NUMBER` como fuente de verdad; la variable queda como respaldo.
- `OwnerChatFeedback` (`businessId`, `question`, `answer`, `createdAt`).

### `SentMessage`

- `providerMessageId`, `direction`, `channel`, `templateName`, `deliveryStatus`, `deliveredAt`,
  `readAt`, `failedAt`, `errorCode`, `costCents`, `callbackData`.

## Plantillas de WhatsApp a solicitar

Categoría **utility**, nombres `snake_case`, parámetros nombrados, creadas por API desde
`scripts/manual/crearPlantillasWhatsapp.mts` con ejemplos realistas, seguidas por webhook. Textos
secos: Meta reclasifica a *marketing* lo que suena promocional. Todas a la vez.

| Plantilla | Para | Cuerpo propuesto | Botones |
|---|---|---|---|
| `bienvenida_negocio` | Dueño | "Soy Alhabla, la recepcionista de {{negocio_nombre}}. Pulsa para recibir aquí tus reservas, recados y avisos." | *Activar avisos* |
| `nueva_reserva_negocio` | Dueño | "{{negocio_nombre}}: nueva cita. {{cliente_nombre}}, {{fecha_cita}} a las {{hora_cita}}, {{servicios}}{{profesional}}." | *Vale* · *Ver agenda de hoy* |
| `recado_negocio` | Dueño | "{{negocio_nombre}}: recado de {{cliente_nombre}} ({{cliente_telefono}}). {{motivo}}" | *Atendido* · *Recuérdamelo mañana* |
| `cita_pendiente_negocio` | Dueño | "{{negocio_nombre}}: {{cliente_nombre}}, {{fecha_cita}} {{hora_cita}} ({{servicios}}) no entró en tu calendario: {{motivo}}." | *La apunté yo* · *Reintentar* · *Reconectar* |
| `cancelacion_negocio` | Dueño | "{{negocio_nombre}}: {{cliente_nombre}} canceló su cita del {{fecha_cita}} a las {{hora_cita}}. Hueco libre." | *Vale* · *Avisar a quien esperaba* |
| `alerta_operativa_negocio` | Dueño | "Aviso de Alhabla para {{negocio_nombre}}: {{texto}}" | *Ir a Ajustes* (URL `/ajustes/{{1}}`) |
| `cierre_del_dia` | Dueño | "{{negocio_nombre}}, hoy: {{llamadas}} llamadas, {{citas}} citas, {{recados}} recados. Mañana: {{citas_manana}} citas, la primera a las {{primera_hora}}." | *Ver mañana* · *Silenciar* |
| `confirmacion_cita_v2` | Cliente | "Soy Alhabla, gestiono las reservas de {{negocio_nombre}}. Tu cita: {{servicios}}, {{fecha_cita}} a las {{hora_cita}}{{profesional}}. Para cambiarla, llama al {{negocio_telefono}}." | *Guardar contacto* · *Cómo llegar* (URL con sufijo) |
| `recordatorio_cita_v2` | Cliente | "{{negocio_nombre}}: te recordamos tu cita de {{servicios}} mañana, {{fecha_cita}} a las {{hora_cita}}. ¿La mantienes?" | *Confirmo* · *Cancelar* · *Cambiar* |
| `cambio_cita_cliente` | Cliente | "{{negocio_nombre}} ha movido tu cita de {{servicios}} al {{fecha_cita}} a las {{hora_cita}}. Si no te va bien, llama al {{negocio_telefono}}." | *Vale* · *No me va bien* |
| `cancelacion_cita_cliente` | Cliente | "{{negocio_nombre}} ha cancelado tu cita del {{fecha_cita}} a las {{hora_cita}}. Para pedir otra, llama al {{negocio_telefono}}." | *Vale* |
| `hueco_libre` | Cliente | "{{negocio_nombre}}: se ha liberado el {{fecha_cita}} a las {{hora_cita}}. ¿La quieres?" | *Sí, resérvala* · *Ya no* |

`confirmacion_cita` y `recordatorio_cita` actuales se retiran cuando sus `v2` estén aprobadas.
Si Meta limita las respuestas rápidas a dos, `cita_pendiente_negocio` pierde *Reconectar* (pasa a
URL) y `recordatorio_cita_v2` pierde *Cambiar* (el teléfono ya va en el texto).

## Escalera de planes

| Plan | Incluye |
|---|---|
| Todos (Beta) | Conversaciones con cliente y dueño mientras sean Beta (después, Pro) |
| Inicio | Activación por WhatsApp, confirmación y recordatorio con botones al cliente, aviso por reserva, recado, cita pendiente, cancelación y alertas al dueño, cancelación por botón, lista de espera |
| Pro | Todo lo anterior + conversaciones fuera de Beta, cierre del día, memoria de clientes, historial y chat en el panel |
| Scale | Todo lo anterior + resumen de llamadas por chat con analítica. Se retira «varios números por sede (próximamente)» de `plans.ts` |

`planFeatures.ts`: `chat_beta` → `chat_dueno` + `chat_cliente` (la recepcionista por chat),
`memoria_clientes`.

## Seguridad y cumplimiento

- Consentimiento del dueño: botón *Activar avisos* fechado; `STOP` inmediato. Del cliente: el
  `smsConsent` por voz, o el dueño en nombre de su cliente al añadir una cita por chat (el dueño
  es responsable del tratamiento de su clientela; Alhabla registra que lo pidió él).
- Webhook con firma Ed25519, `rawBody`, ventana de timestamp; idempotencia por
  `providerMessageId`.
- Botones: payload con recurso; se valida que pertenece al remitente (dueño del negocio, o
  cliente de esa reserva) antes de actuar.
- Gestor: ninguna tool destructiva invocable por el LLM; `proponer_accion` + botón. La
  recepcionista por chat usa sus tools de siempre con la confirmación explícita de siempre, y
  solo sobre citas del número desde el que escribe.
- Un remitente para todos: solo plantillas de utilidad, `STOP` global, identificación del negocio
  en cada mensaje, monitor de calidad por webhook.
- Memoria acotada a `assistant_id`; `OLVIDAR`; purga coordinada con `RECORDING_RETENTION_DAYS`.
- Número desconocido: una respuesta fija por día y número.

## Fases

### Fase 0 — Validación (sin código de producto)

0. Subir `telnyx` a ≥ 7.21; comprobar `messages.sendWhatsapp`, `whatsapp.templates.*`,
   `ai.assistants.chat`, `ai.tools.create`. Suscribir el WABA a `message_template_status_update` y
   `phone_number_quality_update`. Fijar el perfil de Alhabla por API y verlo desde un móvil.
1. Mensaje de prueba desde un móvil al remitente: **qué llega y dónde** para texto, botón
   interactivo y botón de plantilla; y si el toque de un botón de plantilla abre la ventana
   (mandar un `text` justo después). Documentar los payloads en `AGENTS.md`.
2. `confirmacion_cita` real a un número propio por `template_id`; ver `message.finalized`
   (`read`, `cost.amount`). Hoy no hay evidencia de entrega de extremo a extremo.
3. Crear las doce plantillas con el script; verlas en `PENDING`; anotar fecha.
4. `chat` (Beta) con un assistant de prueba y una *shared tool* por `tool_ids`: ejecuta, firma,
   fallo de tool, contexto entre horas. Y las dos preguntas del Gestor único: si el webhook de
   variables dinámicas se dispara en una conversación creada por API con `metadata`, y qué
   identificador de conversación recibe la tool (para resolver el negocio en el backend).
5. Post-conversación en un assistant de dev con `informar_al_negocio`: tres llamadas (recado, sin
   recado, fallo de tool); latencia tras colgar.
6. Webhook de variables dinámicas devolviendo solo `memory.conversation_query`; dos llamadas
   seguidas recuerdan; desde otro assistant no.
7. Residencia UE del chat y la memoria (#13-16 abiertos).
8. **Verificación de empresa de Alhabla en Meta** y aprobación del nombre visible «Alhabla»
   (WhatsApp Manager). Sin esto el cliente ve un número pelado, el techo es de 250
   destinatarios/día y el WABA solo admite 2 números. **Lo hace el usuario.** No bloquea el
   código; bloquea el lanzamiento y los números de sector.
9. **Números de sector** (comprados y con desvío el 2026-09-20, ver § Estado actual):
   esperar a que Telnyx los ponga `active`; registrar **uno** en el WABA con verificación por
   voz (el segundo hueco disponible antes de #103) y documentar cómo llega la llamada del
   código y si la recibe el móvil desviado; fijar su perfil por API. Los otros cuatro, tras
   #103. Decidir qué hacer con el desvío después de verificar.

**Criterio de salida:** payloads documentados, plantillas creadas, puntos 4-6 con resultado
escrito. Punto 8 en marcha.

### Fase 1 — El caso 1 completo

- `WhatsAppAdapter.ts` sobre el SDK; `WhatsappTemplate` con webhook de estado; `WhatsappSender`
  (remitente por sector con respaldo) y perfiles por sector en el reconciliador; `SentMessage`
  con entrega y coste.
- Alta: campo del móvil, `bienvenida_negocio` con *Activar avisos*, `STOP`, Ajustes › WhatsApp,
  `131026` ⇒ email.
- Webhook de mensajería: idempotencia, enrutado por prefijo de botón, identificación de dueño /
  cliente / desconocido, `ownerWindowOpenUntil`.
- Mensaje #1 por reserva (plantilla o interactivo según ventana), #2 con `informar_al_negocio`
  en doble escritura, #3 con *La apunté yo*, #4, #5.
- `confirmacion_cita_v2` con *Guardar contacto* (vCard al toque) y *Cómo llegar* (`placeId`);
  `Business.address`/`placeId` desde Places. La recepcionista anuncia el WhatsApp por voz.
- `recordatorio_cita_v2` con *Confirmo* · *Cancelar* · *Cambiar*; cancelar libera, avisa (#4)
  y dispara la lista de espera; `hueco_libre` y reactivación de `notify_when_available`.
- Fallback por email de #2, #3 y #5.
- Tests: enrutado, botones, idempotencia, informe post-llamada; integración contra Postgres.

**Criterio de salida:** una llamada real a una cuenta de producción sin clientes termina con la
confirmación en el móvil del cliente (con la vCard tras pulsar) y el aviso en el móvil del dueño;
el cliente cancela desde el recordatorio y el dueño lo ve en su WhatsApp.

### Fase 2 — Conversaciones (Beta)

- **Gestor único** (`contexto_negocio`,
  catálogo: `crear_servicio`, `editar_servicio`, `retirar_servicio`, `crear_profesional`,
  `retirar_profesional`, `fijar_especialidad`, `fijar_horario`, `cerrar_dia`,
  `conectar_calendario`; agenda: `listar_agenda`, `resumen_llamadas`, `añadir_cita`,
  `mover_cita`, `cancelar_cita`, `marcar_ausencia`, `bloquear_franja`, `resolver_pendiente`;
  `proponer_accion`); *shared tools*; conversaciones creadas por Alhabla con metadatos;
  `pending_owner_action` con 24 h.
- La recepcionista por chat: `ClientConversation` por cliente y negocio contra el assistant de
  voz del negocio; marcador `[WhatsApp]` y bloque "modo chat" en el prompt
  (`managedAgentPrompt.ts`); lista para elegir negocio si hay varios del mismo sector; botón
  *Cambiar* del recordatorio abre esa conversación.
- Onboarding por chat: el Gestor guía servicios → profesionales → horario → calendario según
  la checklist; cada mutación con botón y con la misma sincronización que el panel.
- Flujo de añadir con "¿le mando la confirmación?"; flujo de mover/cancelar con *Antes la
  llamo* y "¿aviso a la clienta?"; `cambio_cita_cliente` y `cancelacion_cita_cliente`.
- `ProfessionalAbsence`, `ScheduleBlock` en `availability.ts` y `get_catalog`.
- Etiquetas Beta, `AYUDA`, `MAL`, límites diarios, interruptores. Todos los planes.
- Panel: historial y "Pregúntale a tu recepcionista".

**Criterio de salida:** un alta nueva completa servicios, profesionales y horario por WhatsApp
sin abrir el panel y la recepcionista los usa en la siguiente llamada; "apunta a Marta mañana a
las 5, corte" termina con la cita en el calendario y la confirmación en el móvil de Marta;
"mueve la de Marta al viernes" pide botón, mueve y ofrece avisarla; un cliente escribe "¿puedo
cambiar mi cita al jueves?" y la recepcionista la mueve por chat con confirmación, igual que lo
haría por teléfono.

### Fase 3 — Rematar

- Memoria: dueño primero; clientes tras privacidad y `OLVIDAR`.
- Retirada de los insights custom cuando la doble escritura concuerde.
- Cierre del día (opcional) y `resumen_llamadas` con analítica (Scale).
- Salida de Beta: quitar etiqueta, `chat_dueno`/`chat_cliente` a Pro.
- `plans.ts`, seis landings, FAQ ("¿y el WhatsApp?": "tus clientes reciben la confirmación de
  Alhabla y pueden escribirle; tu WhatsApp de siempre sigue siendo tuyo") y `PRODUCT.md`.

### Después (sin fecha)

- Modo dueño por voz (`handoff` + PIN): la recepcionista reconoce al dueño cuando llama.
- Web Push como capa extra. SMS por Sender ID cuando exista.

## Variables de entorno previstas

```text
WHATSAPP_WABA_ID                        # UUID Telnyx del WABA
OWNER_ALTA_CODE_TTL_HOURS=72
OWNER_DIGEST_DEFAULT_TIME=20:30
TELNYX_OWNER_CHAT_ENABLED=false         # nivel 2 del dueño (Beta)
TELNYX_CLIENT_CHAT_ENABLED=false        # nivel 2 del cliente (Beta)
TELNYX_GESTOR_ASSISTANT_ID              # assistant único de plataforma (Gestor)
WHATSAPP_FORWARDING_NUMBER=+34692138456 # desvío de los números de sector (verificación de Meta)
TELNYX_MEMORY_ENABLED=false
TELNYX_POST_CONVERSATION_ENABLED=false
```

Las plantillas viven en `WhatsappTemplate` y los remitentes en `WhatsappSender`;
`WHATSAPP_TEMPLATE_*_NAME` se retiran tras importarlas y `WHATSAPP_TELNYX_FROM_NUMBER` pasa a
ser solo el respaldo. Los IDs de las recepcionistas (por negocio) y de las conversaciones van
en PostgreSQL; el Gestor y las *shared tools* son configuración.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El primer WhatsApp de "Alhabla" parece spam o el cliente bloquea | Anuncio por voz, negocio en la primera línea, verificación de empresa y nombre visible (fase 0.8) |
| Techo de destinatarios/día compartido por toda la plataforma | Verificación de Meta pronto; alerta al 70 % del nivel; solo utilidad |
| Un cliente de dos negocios se lía en un solo chat | Negocio en cada mensaje; botones con recurso; lista para elegir |
| Meta tarda o rechaza plantillas | Doce a la vez en fase 0; ventana abierta no depende de plantilla; email |
| Meta reclasifica una plantilla a marketing | Textos secos; webhook y tabla lo detectan |
| El coste del aviso por reserva | Botones mantienen la ventana; contador y alerta; el dueño puede apagarlo |
| `assistants.chat` es Beta en Telnyx | Kill switches; sustituto propio con las mismas tools |
| El LLM del dueño ejecuta algo indebido | Solo `proponer_accion`; el botón ejecuta |
| La recepcionista por chat arrastra instrucciones de voz (end_call, "se lee en voz alta") | Bloque "modo chat" condicional en el prompt; pruebas de contrato de las cinco tools por chat en fase 0.4 |
| Un sector con muchos bloqueos baja la calidad de su número | Aislado por sector; el resto de números no se ven afectados; respaldo al número actual |
| `STOP` mal gestionado baja la calidad del número para todos | Determinista, probado, global por número |
| Tools inline actuales sin soporte | Tools nuevas compartidas; issue aparte para migrar las de voz |
| Memoria cruza tenants | Consulta acotada a `assistant_id`; test con dos negocios y un número |
| Un Gestor único mezcla negocios | El negocio se resuelve por `conversation_id` en el backend en cada tool; test de integración con dos dueños y un mismo Gestor |
| La residencia UE obliga a cambiar de modelo | El chat tolera el cambio: modelos con región EU en el catálogo (GLM-5.3-Flash, Qwen3-235B) sin tocar nada más |

## Preguntas abiertas

1. Residencia UE del chat por API y de la memoria (#13-16).
2. Forma exacta del `message.received` de WhatsApp (texto, botón, lista) — fase 0.1.
3. ¿Un toque de botón de plantilla abre la ventana de 24 h? — fase 0.1.
4. Límite de respuestas rápidas por plantilla de utilidad — al crearlas.
5. Tarifa exacta por mensaje en España vía Telnyx (llega en `cost.amount`).
6. ¿Qué identificador de conversación recibe una *shared tool* en un `chat` por API? (De ahí
   se resuelve el negocio.) Fase 0.4.
7. ¿Se dispara el webhook de variables dinámicas en conversaciones creadas por API con
   `metadata`? Si no, `contexto_negocio` en el primer turno (Gestor) y marcador `[WhatsApp]`
   (recepcionista). Fase 0.4.
8. ¿Acepta Meta «Alhabla · Peluquerías» como nombre visible bajo la cartera de Alhabla, o solo
   «Alhabla»? Se sabe al registrar el primer número de sector (fase 0.9).
9. ¿Qué hacer con el desvío de llamadas de los números de sector una vez verificados?

## Decisiones tomadas el 2026-09-19

| Decisión | Resultado |
|---|---|
| Canal con el dueño | WhatsApp bidireccional, un solo contacto "Alhabla · Gestionamos tus reservas" |
| Segundo número, push, WABA por negocio, número de WhatsApp por negocio, llamadas de WhatsApp, modal con llamada de prueba | Descartados |
| Llamadas salientes | Descartadas |
| Aviso al negocio por cada reserva | Sí, activado por defecto; cierre del día opcional |
| Conversaciones | Cliente (informativa) y dueño (consultar, añadir, mover, cancelar), en Beta, todos los planes mientras lo sean |
| Cambios del cliente | Cancelar por botón; cambiar de hora por teléfono |
| Mover/cancelar del dueño | Por chat con botón; antes puede llamar al cliente (se le da el teléfono); después Alhabla ofrece avisar al cliente con plantilla |
| Tarjeta de contacto | Perfil del remitente + botón *Guardar contacto* que envía la vCard (no cabe en la plantilla) |
| Memoria | Dueño y clientes, con RGPD, fase 3 |
| Post-conversación | Sustituye a los insights, con doble escritura |
| Verificación de empresa en Meta | Trámite del usuario, fase 0.8 |
| Gestor | Tipo de assistant propio para el dueño, distinto de la recepcionista; **uno para toda la plataforma**, negocio resuelto por conversación; hace también el onboarding por chat (servicios, profesionales, horario, calendario); modelo `gpt-5.6-luna` (~0,002 $/turno) con salida a modelo EU si hace falta |
| Assistant de cliente (2026-09-20) | **Descartado**: la recepcionista del negocio atiende al cliente por chat con sus tools de siempre; el cliente puede consultar, cancelar, cambiar y reservar por WhatsApp |
| Números de WhatsApp (2026-09-20) | **Uno por sector** (cinco de Alhabla, mismo WABA, imagen y descripción por sector) más el actual para `other`/respaldo; con desvío permanente al móvil del usuario para la verificación por voz; comprados de uno en uno |

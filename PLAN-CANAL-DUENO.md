# Plan: el WhatsApp de Alhabla — un contacto para clientes y otro para negocios

Versión 3 (2026-09-19, noche). Sustituye a las dos versiones del mismo día: la de la mañana
(canal del dueño) y la de la tarde (número de WhatsApp por negocio, llamadas de WhatsApp, modal
con llamada de prueba), que el usuario descartó por añadir trámites con Meta a un producto cuya
gracia es que el negocio no configura nada.

## Decisión de producto

**Dos contactos de WhatsApp de Alhabla, uno por audiencia, en el mismo WABA:** «**Alhabla
Reservas**» (+34 930 454 394) habla con los **clientes** y «**Alhabla**» (+34 930 453 218) habla
con los **negocios**. Decisión del usuario del 19-09 (noche, tras la fase 0): son los dos
números que el WABA admite antes de la verificación de empresa (#103), así que no bloquea nada,
y el `to` del mensaje entrante dice ya si escribe un cliente o un dueño. `about` de los dos:
«Gestionamos tus reservas». Los cinco números por sector comprados el mismo día quedan en
reserva hasta #103. Ningún número por negocio. Las llamadas siguen entrando por teléfono con
el desvío de siempre.

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

5. **Sin assistant de cliente (decisión del usuario, 2026-09-19).** Era redundante: la
   recepcionista de cada negocio, la misma que atiende la llamada, atiende también al cliente
   por WhatsApp con las mismas tools (ver su cita, cancelarla, cambiarla, reservar). Un cliente
   con cita que escribe para modificarla ya está cubierto por lo que existe hoy.
6. **Un número de WhatsApp por audiencia (19-09, noche).** Sustituye al «uno por sector» de
   la tarde mientras Meta no verifique la empresa (#103): «Alhabla Reservas» para clientes y
   «Alhabla» para negocios. La calidad del número (que Meta mide por número) queda aislada por
   audiencia: un mal día con clientes no toca los avisos al negocio. Si tras #103 se retoma el
   reparto por sector, sería del lado cliente; el de negocios no cambia.

Dos tipos de assistant, y solo uno de ellos por negocio:

| Tipo | Instancias | Canal | Qué hace |
|---|---|---|---|
| Recepcionista | Una por negocio (como hoy) | Voz **y chat de cliente** | Atender clientes: reservar, consultar, cambiar, cancelar |
| Gestor | **Una para toda la plataforma** | Chat del dueño | Onboarding y gestión: servicios, profesionales, horario, agenda, citas, ausencias |

| Alternativa | Por qué se descarta |
|---|---|
| Número de WhatsApp por negocio (el número de Alhabla del negocio registrado en el WABA) | Nombre visible revisado por Meta uno a uno, verificación por llamada de voz de cada número, tope de números por WABA. El negocio no tiene por qué existir en Meta. Descartado el 2026-09-19 (tarde). Lo que sí se hace es **un número por audiencia** (dos, de Alhabla): el mismo trámite, dos veces en total. |
| Un assistant de chat para clientes | Redundante: la recepcionista del negocio ya sabe ver, cambiar y cancelar la cita del cliente por su número. Descartado el 2026-09-19. |
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
- **Un remitente por audiencia** (tabla `WhatsappSender`: «Alhabla Reservas» para clientes,
  «Alhabla» para negocios y respaldo), los dos en el mismo WABA. Nada de números por negocio ni
  WABA por negocio. Cada mensaje nombra al negocio en la primera línea.
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
  (`confirmacion_cita`, `recordatorio_cita`) configuradas en producción. Los MDR de Telnyx
  muestran plantillas de utilidad `delivered` desde producción desde el 14-09 (fase 0.2).
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
- **Números en el WABA (19-09, noche):** +34 930 453 218 «Alhabla», `CONNECTED`, es el de
  **negocios**; +34 930 454 394 «Alhabla Reservas», **`CONNECTED` desde las 23:14** (dado de
  alta desde el portal de Telnyx tras borrarlo del WABA, fase 0.9), es el de **clientes**.
  Nombres visibles pendientes de la revisión de Meta.
- Cinco números locales de Barcelona **comprados el 2026-09-19** (1 $ de alta + 1 $/mes cada
  uno, mismo Requirement Group de España que usa el provisioning, de uno en uno porque la
  cuenta de Telnyx recarga por goteo), pensados entonces como uno por sector. Todos con
  `customer_reference` `alhabla-whatsapp-<sector>` y **desvío permanente al móvil del usuario**
  (+34 692 138 456) para recibir la llamada de verificación de Meta; ya `active`. El de
  `peluqueria` pasa a ser el de clientes; los otros cuatro quedan **en reserva hasta #103**.

  | Sector | Número | Id en Telnyx |
  |---|---|---|
  | `peluqueria` | +34 930 454 394 | `3052564312288658571` |
  | `barberia` | +34 930 454 372 | `3052564335894201490` |
  | `salon-de-unas` | +34 930 454 382 | `3052564355263497366` |
  | `centro-de-estetica` | +34 930 454 375 | `3052565552728900934` |
  | `fisioterapia` | +34 930 454 393 | `3052565576250557770` |
  | negocios / respaldo | +34 930 453 218 (`WHATSAPP_TELNYX_FROM_NUMBER`) | — |
- `Business.phone` viene de Google Places: es el fijo del local, no el WhatsApp del dueño.
  La dirección de Places se guarda como texto dentro de `businessDetails`; no hay `address` ni
  `placeId` estructurados.
- SDK `telnyx` subido a **7.21.0** (PR #105, fase 0.0). `WhatsAppAdapter.ts` sigue con `fetch`
  hasta la fase 1. Lo que expone de verdad el paquete instalado está en § Pasada final con el
  SDK 7.21 (difiere en algunos nombres de lo que decía la skill).

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
| El entrante de WhatsApp **no** es `message.received`: es `whatsapp.messages` por el webhook del WABA (suscripción `messages`), con payload en formato Meta | Verificado en la fase 0.1 | Ver § Resultados de la fase 0 |
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

## Pasada final con el SDK 7.21 instalado (2026-09-19)

Leído directamente en `node_modules/telnyx/resources/**/*.d.ts` de la 7.21.0. Manda esto sobre
la skill cuando difieran.

| Qué | En el SDK real | Consecuencia para el plan |
|---|---|---|
| Envío de WhatsApp | `client.messages.whatsapp({ from, to, whatsapp_message, messaging_profile_id?, webhook_url? })` (**no** `sendWhatsapp`). `whatsapp_message.type` ∈ `text · template · interactive · contacts · location · reaction · image · …`; `biz_opaque_callback_data` tipado | Los nombres del plan pasan a `messages.whatsapp`. Cada envío lleva `biz_opaque_callback_data = <tipo>:<recursoId>` y vuelve en los webhooks de entrega |
| Parámetros de plantilla al enviar | `template.components[].parameters[].type` ∈ `text · image · video · document · currency · date_time`; **sin `payload`** para `quick_reply` y **sin parámetros nombrados** | Las dos plantillas actuales (parámetros nombrados) siguen por `fetch` o con *cast*; las nuevas se crean con parámetros **posicionales**. La correlación de un botón pulsado **no** depende de un payload: se hace por `context.message_id` de la respuesta → `SentMessage.providerMessageId` (fase 0.1 confirma que llega) |
| Creación de plantillas | `client.whatsapp.templates.create({ waba_id, name, category, language, components })`; `BODY.example.body_text: string[][]` (posicional); botones `QUICK_REPLY · URL · PHONE_NUMBER · COPY_CODE · OTP · FLOW`; componente `CAROUSEL` | Script de la fase 0.3 con posicionales. `FLOW` (formularios nativos de WhatsApp) queda anotado como idea para el onboarding, no en este plan |
| **Ventana de 24 h por API** | `client.whatsapp.phoneNumbers.retrieveConversationWindow(numero, { destination_number })` → `window_active`, `window_expires_at`, `last_user_message_at`, `window_type` | Telnyx es la fuente de verdad de la ventana; `ownerWindowOpenUntil` pasa a ser caché. Antes de cada envío al dueño: ventana activa ⇒ interactivo; si no ⇒ plantilla. Vale igual para clientes |
| **Componentes conversacionales por número** | `client.whatsapp.phoneNumbers.conversationalComponents.patchAll(numero, { ice_breakers: string[] (≤4), commands: [{command, description}] })` | Menú nativo de WhatsApp: *ice breakers* para quien abre el chat por primera vez («¿Cuándo es mi cita?», «Cómo llegar», «Cancelar mi cita», «Soy el dueño de un negocio») y *comandos* `/agenda`, `/hoy`, `/mañana`, `/pausa`, `/ayuda` para el dueño. Sustituye a buena parte del "nivel 1 de palabras clave" por algo que el usuario ve |
| Perfil por número | `client.whatsapp.phoneNumbers.profile.update(numero, { about, address, category, description, display_name?, email, website })` y `profile.photo.upload(numero, { file })` | Perfil e imagen por audiencia desde el script del reconciliador |
| Alta de un número en el WABA | `client.whatsapp.businessAccounts.phoneNumbers.initializeVerification(wabaId, { display_name, phone_number, language, verification_method: 'voice' })`, `client.whatsapp.phoneNumbers.verify(numero, { code })`, `resendVerification`, `phoneNumbers.delete` | **Solo para números que ya están en el WABA** (fase 0.9): pide el código a Meta y lo entrega; **no da de alta el número** (`404 Phone number not found` si no está). El alta es por Embedded Signup en el portal de Telnyx |
| Ajustes del WABA | `client.whatsapp.businessAccounts.settings.update(wabaId, …)` | Suscripción a eventos de plantilla y calidad (fase 0.0) |
| Conversaciones | `client.ai.conversations.create({ metadata, name })`, `addMessage(id, { role, content, metadata })`, `messages.list(id)`, `retrieveConversationsInsights(id)` | El contexto del Gestor tiene una **tercera vía**, la más simple: `addMessage` con `role: "system"` (o el rol que acepte, fase 0.4) al crear la conversación. `messages.list` alimenta el historial del panel |
| Chat con el assistant | `client.ai.assistants.chat(assistantId, { content, conversation_id, name?, stream? })` | Igual que en el plan; `stream` disponible si el panel quiere respuesta progresiva |
| Assistant | `tool_ids`, `dynamic_variables_webhook_timeout_ms`, `post_conversation_settings { enabled }`, `messaging_settings { conversation_inactivity_minutes, … }`, `widget_settings { start_call_text, theme, … }`, `mcp_servers` | Todo lo que el plan usa está tipado. El *widget* confirma que "Probar mi recepcionista" desde el panel es viable más adelante |
| *Shared tools* | `client.ai.tools.create({ display_name, type, webhook · handoff · function · retrieval · invite · pay · client_side_tool · update_dynamic_variables, timeout_ms })` | Como en el plan. `update_dynamic_variables` permite que el Gestor cambie variables de la conversación en marcha (por ejemplo, el negocio activo de un dueño con dos) |
| **LLM alojado en Telnyx** | `client.ai.anthropic.v1.messages(…)` (API de Mensajes de Anthropic) y `client.ai.openai.chat.createCompletion(…)` (compatible OpenAI), con los modelos y precios del catálogo | El sustituto del `chat` (Beta) ya no exige otro proveedor: un bucle propio con las mismas tools en proceso puede correr sobre Telnyx con `anthropic/claude-haiku-4-5` o `gpt-5.6-luna`. Misma factura, misma residencia |
| Verify | `client.verifications.triggerWhatsappVerification({ phone_number, verify_profile_id })` y `client.verifications.byPhoneNumber.actions.verify(numero, { code, verify_profile_id })` | Alternativa de alta, sin cambios |
| Auto-respuestas SMS | `client.messagingProfiles.autorespConfigs.create(profileId, { country_code, keywords, op, resp_text })` | Solo SMS; sin cambios |

Cambios que esto introduce en el diseño: la ventana de 24 h se consulta a Telnyx (§ 9); la
correlación de botones va por `context.message_id` y `biz_opaque_callback_data`, no por payload
(§ 6); cada número lleva *ice breakers* y comandos según su audiencia (§ 1 y § 6); el Gestor prueba en la
fase 0.4 las tres vías de contexto (webhook de variables dinámicas, `addMessage` con rol de
sistema, `contexto_negocio`); y el plan B del chat corre en Telnyx.

## Diseño destino

### 1. Un contacto por audiencia: los dos perfiles de Alhabla

- Dos números de Alhabla en el mismo WABA (mismas plantillas, mismo límite de cartera):
  **«Alhabla Reservas»** (+34 930 454 394) para todo lo que va al **cliente** (confirmación,
  recordatorio, hueco libre, chat con la recepcionista) y **«Alhabla»** (+34 930 453 218) para
  todo lo que va al **negocio** (aviso de reserva, recado, cita pendiente, cierre del día, chat
  con el Gestor). El de negocios es también el respaldo si el de clientes no está `CONNECTED`.
- Nombres visibles: «Alhabla Reservas» y «Alhabla» (Meta exige que se relacionen con la
  empresa de la cartera; los dos están `PENDING_REVIEW`). `about` en ambos: «Gestionamos tus
  reservas». `description`, foto y categoría por audiencia (clientes: *Servicios
  profesionales*, texto para quien tiene cita; negocios: texto para el dueño). Se fija por API
  (`PATCH …/profile`) desde un script y se revisa en el reconciliador.
- El remitente de cada envío se resuelve por **audiencia** (`WhatsappSender.audience`
  `client | owner`), no por negocio ni por sector. Los webhooks entrantes llegan con `to` =
  uno de los dos números, así que **el número ya dice si escribe un cliente o un dueño** y la
  identificación de § 6 se simplifica; el teléfono del dueño de un negocio que además es
  cliente de otro deja de ser ambiguo (escribe a un contacto u otro).
- Ventaja de calidad: Meta puntúa cada número; un incidente con clientes (bloqueos, `STOP`)
  no toca el número por el que el negocio recibe sus avisos.
- Si tras #103 se retoma el reparto por sector, sería solo del lado cliente (los cuatro
  números en reserva); el contacto del negocio no cambia.
- **Menú nativo por número** (`conversationalComponents.patchAll`), ahora **distinto por
  audiencia**: en «Alhabla Reservas», *ice breakers* de cliente («¿Cuándo es mi cita?», «Cómo
  llegar», «Cancelar mi cita», «Quiero reservar») y ningún comando; en «Alhabla», *ice
  breakers* de dueño («Agenda de hoy», «Añadir una cita», «Soy nuevo, quiero darme de alta») y
  los comandos (`/agenda`, `/hoy`, `/mañana`, `/pausa`, `/ayuda`). Desaparece «Soy el dueño de
  un negocio» del lado cliente. Se fijan con el perfil. En producción se retiraron los *ice
  breakers* del número actual hasta que exista el enrutador (fase 1).
- Alta de cada número en WhatsApp (una vez, por Alhabla): **desde el portal de Telnyx**
  (*Messaging → WhatsApp → Add phone number*, Embedded Signup), verificación **por voz** (los
  números españoles no reciben SMS) gracias al **desvío permanente de llamadas al móvil del
  usuario** (`call_forwarding: always → +34 692 138 456`). Lo aprendido el 19-09 (fase 0.9):
  la API (`initializeVerification`/`verify`) solo sirve para números que ya están en el WABA;
  y añadirlo desde WhatsApp Manager de Meta y verificarlo allí deja el número verificado en
  Meta pero **sin registrar en Cloud API por Telnyx** (`PENDING`, `platform_type:
  NOT_APPLICABLE`, y Meta rechaza pedir otro código: «already verified»). Tras verificar, el
  desvío se mantiene (nadie marca esos números; si alguien lo hace, llega al usuario) o se
  cambia a un aviso grabado, a decidir.
- **Tope de Meta**: hasta verificar la empresa (issue #103) un WABA admite **2 números**: los
  dos de audiencia. Los cuatro de sector en reserva esperan a #103.
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
  esté aprobada; hasta entonces la tool se retira (PR 4: se retira la frase del prompt, la tool
  sigue registrada porque `hora_disponible` ya está aprobada y el flujo es correcto).
- Los rechazos de Meta (parámetros o plantilla mal formados 132xxx, marketing 131049, tier
  130429/131048, sin WhatsApp 131026) NO llegan en la respuesta del envío: llegan en diferido
  por `statuses[].failed`, sin reintento posible. Por eso los parámetros se construyen por
  plantilla con un test que fija sus claves exactas, y un `failed` sobre un envío `cliente:*`
  revierte lo que el envío había afirmado (`clientNotifiedAt`, la oferta del lead) y, si era
  la v2 de la confirmación, encola una vez el respaldo con la aprobada.

### 6. Entrada: el webhook de mensajería

Evento **`whatsapp.messages`** del webhook del WABA en `/webhooks/telnyx` (formato Meta, ver
§ Resultados de la fase 0), misma firma e idempotencia que los eventos de voz (id del
evento y `messages[].id`), tabla `InboundMessage`. Enrutado, en este orden:

1. **`STOP`/`BAJA`/`ALTA`**: deterministas, antes que nada. `STOP` de un cliente es global para
   ese número (todos los negocios); la recepcionista deja de ofrecerle WhatsApp.
2. **Botón o comando**: un botón se correlaciona por `context.id` del mensaje al que responde
   → `SentMessage.providerMessageId` (confirmado en la fase 0.1), y por `button_reply.id` en
   los interactivos; un comando (`/agenda`, `/hoy`, …) o un *ice breaker* por su texto exacto.
   Handler por tipo de recurso. Nunca pasa por el LLM.
3. **Identificar al remitente**: primero por el **`to`** (número de negocios ⇒ dueño; número de
   clientes ⇒ cliente), después por el teléfono: en el de negocios, `ownerWhatsappNumber` de
   algún negocio ⇒ dueño, si no ⇒ respuesta fija con el enlace de alta; en el de clientes,
   teléfono con reservas ⇒ cliente, si no ⇒ una única respuesta fija por día ("Soy Alhabla,
   gestiono reservas de negocios; para reservar, llama a tu negocio"). Un dueño que escribe
   al número de clientes recibe la indicación de escribir al de negocios (y viceversa).
4. **Texto libre del dueño**: nivel 1, palabras clave (`agenda`, `hoy`, `mañana`, `pausa`,
   `ayuda`); si no encaja, nivel 2 (§ 8).
5. **Texto libre del cliente**: la recepcionista del negocio por chat (§ 7). El negocio se
   resuelve por las citas del número; si tiene citas en más de un negocio, primero lista para
   elegir.

### 7. Conversación con el cliente: la recepcionista por chat (Beta)

No hay assistant de cliente. El texto libre de un cliente va, por `client.ai.assistants.chat`,
a la **recepcionista de su negocio** (el mismo assistant Telnyx que atiende la llamada), con
sus mismas tools: `get_catalog`, `check_availability`, `book_appointment`,
`find_my_appointment` (por el número desde el que escribe), `cancel_appointment`,
`notify_when_available`.

- Conversación por cliente y negocio (`ClientConversation`), creada por Alhabla con
  `metadata { business_id, client_phone, role: "client", channel: "whatsapp" }`; el negocio
  se resuelve por las citas del número (el `to` ya dice que es un cliente); `conversation_id`
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

El dueño escribe al número de **negocios** («Alhabla», +34 930 453 218), distinto del que
ven sus clientes; el Gestor único está detrás de ese número.

**El negocio es dato, no prompt.** La recepcionista lleva su catálogo horneado en las
instrucciones porque una llamada no espera; el Gestor no lo necesita:

- La conversación la crea Alhabla (`client.ai.conversations.create`) con `metadata:
  { business_id, role: "owner" }`; `Business.ownerConversationId` la guarda (rota a los 30 días
  o con `BAJA`).
- Toda tool resuelve el negocio a partir del `conversation_id` en el backend; el aislamiento
  multi-tenant lo garantiza Alhabla, nunca el LLM.
- El nombre del negocio y su estado llegan al empezar por **`system_prompt` de la
  conversación** (`PUT /v2/ai/conversations/{id}`, verificado en la fase 0.4), y las tools
  reciben el negocio en una cabecera `X-Alhabla-Business: {{business_id}}` que Telnyx resuelve
  desde los metadatos de la conversación (verificado). `addMessage` con `role: "system"` sirve
  para cambios en mitad del hilo; `contexto_negocio` queda como tool de consulta, no como vía
  de contexto.

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
  reimplementa como bucle propio con las mismas tools en proceso **sobre el LLM alojado en
  Telnyx** (`client.ai.anthropic.v1.messages` con `anthropic/claude-haiku-4-5`, o
  `client.ai.openai.chat.createCompletion` con `gpt-5.6-luna`), sin tocar alta, botones,
  plantillas ni panel y sin segundo proveedor. Se elige el `chat` por conversaciones y memoria
  voz+chat en el mismo sitio y tools ya construidas como webhooks firmados.

### 9. Ventana de 24 h y coste

- Plantilla de utilidad: unos céntimos (Meta + Telnyx; el coste real llega en
  `message.finalized`). Mensaje dentro de la ventana abierta por el usuario: gratis.
- Todos los avisos al dueño llevan botón. **Mientras el dueño pulse uno al día, sus avisos son
  texto libre y gratis.** Antes de cada envío se consulta la ventana a Telnyx
  (`retrieveConversationWindow(remitente, { destination_number })` → `window_active`,
  `window_expires_at`); `ownerWindowOpenUntil` es solo caché de esa respuesta. Dentro ⇒
  interactivo; fuera ⇒ plantilla.
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
- `WhatsappSender` (`audience @unique` `client | owner`, `phoneNumber`, `telnyxPhoneNumberId`,
  `displayName`, `status` `pending | verified | calling_disabled`, `qualityRating`,
  `profileVersion`): los dos remitentes; el de `owner` es también el respaldo. Sustituye a
  `WHATSAPP_TELNYX_FROM_NUMBER` como fuente de verdad; la variable queda como respaldo.
- `OwnerChatFeedback` (`businessId`, `question`, `answer`, `createdAt`).

### `SentMessage`

- `providerMessageId`, `direction`, `channel`, `templateName`, `deliveryStatus`, `deliveredAt`,
  `readAt`, `failedAt`, `errorCode`, `costCents`, `callbackData`.

## Plantillas de WhatsApp a solicitar

Categoría **utility**, nombres `snake_case`, parámetros nombrados, creadas por API desde
`scripts/manual/crearPlantillasWhatsapp.mts` con ejemplos realistas, seguidas por webhook. Textos
secos: Meta reclasifica a *marketing* lo que suena promocional. Todas a la vez.

| Plantilla | Para | Cuerpo enviado a Meta (2026-09-19, todas `PENDING`) | Botones |
|---|---|---|---|
| `bienvenida_negocio` | Dueño | "Soy Alhabla, la recepcionista de {{negocio_nombre}}. Pulsa para recibir aquí tus reservas, recados y avisos." | *Activar avisos* |
| `nueva_reserva_negocio` | Dueño | "Nueva cita en {{negocio_nombre}}. La recepcionista ha reservado a {{cliente_nombre}} para {{servicio}} el {{cita}}. Ya está guardada en tu agenda, no tienes que hacer nada." | *Vale* · *Ver agenda de hoy* |
| `recado_negocio` | Dueño | "Tienes un recado en {{negocio_nombre}}. Ha llamado {{cliente_nombre}} desde el {{cliente_telefono}} y pide lo siguiente: {{motivo}}. Pulsa un botón cuando lo hayas atendido." | *Atendido* · *Recuérdamelo mañana* |
| `cita_pendiente_negocio` | Dueño | "Atención en {{negocio_nombre}}: la cita de {{cliente_nombre}} el {{cita}} se reservó por teléfono pero no ha entrado en tu calendario porque {{motivo}}. Elige qué hacer con ella." | *La apunté yo* · *Reintentar* · *Reconectar* |
| `cancelacion_negocio` | Dueño | "Cancelación en {{negocio_nombre}}: {{cliente_nombre}} ha anulado su cita del {{cita}}. Ese hueco queda libre en tu agenda." | *Vale* · *Avisar a quien esperaba* |
| `alerta_operativa_negocio` | Dueño | "Aviso de Alhabla para {{negocio_nombre}}: {{texto}}. Puedes revisarlo desde los ajustes de tu panel." | *Ir a Ajustes* (URL `https://alhabla.ai/ajustes/{{1}}`) |
| `cierre_del_dia` | Dueño | "Resumen del día en {{negocio_nombre}}. Hoy tu recepcionista ha atendido {{resumen_hoy}}. Para mañana tienes {{resumen_manana}}. Que descanses." | *Ver mañana* · *Silenciar* |
| `confirmacion_cita_v2` | Cliente | "Hola, soy Alhabla y gestiono las reservas de {{negocio_nombre}}. Tu cita para {{servicio}} queda confirmada el {{cita}}. Si necesitas cambiarla, llama al negocio al {{negocio_telefono}} y te atenderá la recepcionista." | *Guardar contacto* · *Cómo llegar* (URL `…maps/search/?api=1&query=place_id:{{1}}`) |
| `recordatorio_cita_v2` | Cliente | "Hola, te escribimos desde {{negocio_nombre}} para recordarte tu cita de {{servicio}} mañana, {{cita}}. Dinos si la mantienes o si necesitas cancelarla o cambiarla." | *Confirmo* · *Cancelar* · *Cambiar* |
| `cambio_cita_cliente` | Cliente | "Hola, {{negocio_nombre}} ha movido tu cita de {{servicio}} a una nueva hora: {{cita}}. Si no te viene bien, llama al {{negocio_telefono}} y buscamos otra." | *Vale* · *No me va bien* |
| `cancelacion_cita_cliente` | Cliente | "Hola, {{negocio_nombre}} ha tenido que cancelar tu cita del {{cita}}. Sentimos las molestias. Si quieres pedir otra hora, llama al {{negocio_telefono}} y te atenderá la recepcionista." | *Vale* |
| `hueco_libre` | Cliente | "Hola, te escribimos desde {{negocio_nombre}} porque se ha liberado la hora que nos pediste: {{cita}}. Dinos si la quieres y la reservamos a tu nombre." | *Sí, resérvala* · *Ya no* |

Reglas de Meta aprendidas al crearlas (rechazos `2388299` y `2388293`): el cuerpo **no puede
empezar ni terminar con una variable**, y hay un límite de variables por cantidad de texto (de
ahí `{{cita}}` con fecha y hora juntas y el profesional dentro de `{{servicio}}`). Los parámetros
**nombrados** los acepta la API de Telnyx aunque el SDK no los tipe (`parameter_format: "NAMED"`,
`example.body_text_named_params`). Ya existía además una plantilla `hora_disponible` aprobada en
categoría *marketing*: sirve de lista de espera mientras `hueco_libre` no esté aprobada.

`confirmacion_cita` y `recordatorio_cita` actuales se retiran cuando sus `v2` estén aprobadas.

**Todas con título (decisión del usuario, 19-09 noche).** Al probar el número de clientes recibió
las dos `confirmacion_cita` aprobadas y prefirió la que lleva **cabecera** («Reserva
confirmada!», componente `HEADER` de texto): se lee como un aviso, no como un chat. Las doce
nuevas se enviaron a Meta sin cabecera y **una plantilla `PENDING` no se puede editar** (Meta solo
permite editar `APPROVED`, `REJECTED` o `PAUSED`, hasta 10 veces al mes, y cada edición vuelve a
revisión). Por eso, en cuanto Meta resuelva cada una, se le añade la cabecera con
`client.whatsappMessageTemplates.update(id, { components })` (`PATCH
/v2/whatsapp_message_templates/{id}`) y se espera la segunda aprobación; hasta entonces, para la
confirmación se usa la aprobada con título (`01a0a982-…`, `es_ES`, por `template_id`). Títulos:

| Plantilla | `HEADER` |
|---|---|
| `bienvenida_negocio` | Bienvenido a Alhabla |
| `nueva_reserva_negocio` | Nueva reserva |
| `recado_negocio` | Tienes un recado |
| `cita_pendiente_negocio` | Cita pendiente de revisar |
| `cancelacion_negocio` | Cita cancelada |
| `alerta_operativa_negocio` | Aviso de Alhabla |
| `cierre_del_dia` | Resumen del día |
| `confirmacion_cita_v2` | Reserva confirmada |
| `recordatorio_cita_v2` | Recordatorio de tu cita |
| `cambio_cita_cliente` | Tu cita ha cambiado |
| `cancelacion_cita_cliente` | Cita cancelada |
| `hueco_libre` | Hay hueco para ti |

Sin signos de exclamación ni variables en la cabecera (Meta admite una variable en cabeceras
de texto, pero no hace falta y evita otro motivo de rechazo).
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

0. ~~Subir `telnyx` a ≥ 7.21~~ (hecho, PR #105; el paquete expone `messages.whatsapp`,
   `whatsapp.*`, `ai.assistants.chat`, `ai.tools.*`, `ai.conversations.*`). Suscribir el WABA a
   `message_template_status_update` y `phone_number_quality_update`. Fijar el perfil de Alhabla
   por API (`profile.update` + `profile.photo.upload`) y los componentes conversacionales
   (`conversationalComponents.patchAll`) del número actual, y verlos desde un móvil.
1. Mensaje de prueba desde un móvil al remitente: **qué llega y dónde** para texto, botón
   interactivo, botón de plantilla, *ice breaker* y comando; si la respuesta a un botón trae
   `context.message_id`; y si el toque de un botón de plantilla abre la ventana (comprobar con
   `retrieveConversationWindow` y mandando un `text` justo después). Documentar los payloads
   en `AGENTS.md`.
2. ~~`confirmacion_cita` real a un número propio por `template_id`; ver `message.finalized`
   (`read`, `cost.amount`)~~ (hecho, ver § Resultados: entregada, y costes reales por MDR).
3. Crear las doce plantillas con el script; verlas en `PENDING`; anotar fecha.
4. `chat` (Beta) con un assistant de prueba y una *shared tool* por `tool_ids`: ejecuta, firma,
   fallo de tool, contexto entre horas. Y las tres vías de contexto del Gestor único: si
   `conversations.addMessage` acepta `role: "system"` y el assistant lo respeta; si el webhook
   de variables dinámicas se dispara en una conversación creada por API con `metadata`; y qué
   identificador de conversación recibe la tool (para resolver el negocio en el backend).
5. Post-conversación en un assistant de dev con `informar_al_negocio`: tres llamadas (recado, sin
   recado, fallo de tool); latencia tras colgar.
6. Webhook de variables dinámicas devolviendo solo `memory.conversation_query`; dos llamadas
   seguidas recuerdan; desde otro assistant no.
7. Residencia UE del chat y la memoria (#13-16 abiertos). Qué significa: dónde procesa y
   guarda Telnyx las conversaciones del chat, la memoria, los medios entrantes de WhatsApp
   (hoy en `us-central-1`) y el LLM (`gpt-5.6-luna` sin región EU; GLM-5.3-Flash y Qwen3-235B
   sí la tienen). Estado: **sin confirmar**; es una consulta a Telnyx, no código.
8. **Verificación de empresa de Alhabla en Meta** y aprobación del nombre visible «Alhabla»
   (WhatsApp Manager). Sin esto el cliente ve un número pelado, el techo es de 250
   destinatarios/día y el WABA solo admite 2 números. **Lo hace el usuario.** No bloquea el
   código ni los dos números de audiencia; bloquea el lanzamiento y los cuatro números en
   reserva.
9. ~~**Segundo número, el de clientes** (+34 930 454 394, «Alhabla Reservas»): darlo de alta en
   el WABA desde el portal de Telnyx con verificación por voz hasta verlo `CONNECTED`; fijar su
   perfil por API; enviar un mensaje real~~ (hecho, ver § Resultados). Queda decidir qué hacer
   con el desvío después de verificar.

**Criterio de salida:** payloads documentados, plantillas creadas, puntos 4-6 con resultado
escrito. Punto 8 en marcha.

### Fase 1 — El caso 1 completo

Se ejecuta en cinco PRs, cada uno fusionable en verde y sin cambio visible hasta que se
active: (1) cimientos, (2) alta del dueño, (3) avisos al negocio, (4) lado cliente, (5)
piloto. Decisión del usuario del 20-09 (madrugada): cimientos primero.

- ~~`WhatsAppAdapter.ts` sobre el SDK; `WhatsappTemplate` con webhook de estado; `WhatsappSender`
  (remitente por audiencia, el de negocios como respaldo); `SentMessage` con entrega y coste~~
  — **PR 1 (cimientos), hecho el 20-09**: adaptador sobre el SDK (con un segundo cliente
  `baseURL` sin `/v2` porque `client.whatsapp.*` del SDK 7.21 duplica el prefijo), servicio
  con remitente por audiencia y plantilla por `template_id`, webhook entrante que guarda y
  clasifica cada mensaje en `InboundMessage` (aún sin responder), entregas y costes en
  `SentMessage`, estado de plantillas por webhook, script de sincronización. Texto, botones y
  vCard verificados entregados desde el número de clientes. Los perfiles en el reconciliador
  quedan para el PR 4. Detalle en `AGENTS.md` § WhatsApp › Código.
- ~~Alta: campo del móvil, `bienvenida_negocio` con *Activar avisos*, `STOP`, Ajustes › WhatsApp,
  `131026` ⇒ email~~ — **PR 2 (alta del dueño), backend hecho el 20-09**: `ownerWhatsappNumber`
  por `PATCH /business/me`, `GET /business/me/whatsapp` y `POST
  /business/me/whatsapp/activation`, enrutador que responde (`ALTA <código>`, botón, `STOP`,
  `AYUDA`, respuestas fijas), tabla `WhatsappOptOut` con guardia en el servicio, `131026` ⇒
  `sin_whatsapp` (el email al dueño queda para el PR 3). La plantilla sigue `PENDING` en Meta:
  la vía activa es `ALTA <código>` (enlace/QR desde Ajustes), y `ALTA` a secas **solo
  reactiva** a un móvil que ya había consentido (nunca es primer consentimiento). Detalle en
  `AGENTS.md` § WhatsApp › Código (PR 2). **Panel hecho el mismo día (PR 2b)**: campo del
  móvil en el alta y en Ajustes › WhatsApp con estado, enlace/QR de `ALTA <código>`, reenvío
  y baja del móvil; paso «Activa los avisos por WhatsApp» en la checklist (seis pasos). La
  pantalla se revisará en una sesión de diseño aparte.
- Webhook de mensajería: idempotencia, enrutado por prefijo de botón, identificación de dueño /
  cliente / desconocido, `ownerWindowOpenUntil`.
- ~~Mensaje #1 por reserva (plantilla o interactivo según ventana), #3 con *La apunté yo*,
  #4~~ — **PR 3 (avisos al negocio), backend hecho el 20-09**: `avisosNegocio.ts` con la
  cascada ventana → plantilla aprobada → email/nada, botones «Vale», «Ver agenda de hoy», «La
  apunté yo», «Reintentar», «Reconectar», agenda por AGENDA/HOY/MAÑANA, cita recuperada.
  **#2 hecho (PR 5, 20-09)**: tool `informar_al_negocio` + `post_conversation_settings` en
  todos los assistants, prompt con «Recados» y «Al terminar la llamada», primer informe gana
  con reclamo atómico, doble escritura con los insights (discrepancias al log), recado ⇒ `Lead`
  `message` ⇒ aviso con «Atendido» · «Recuérdamelo mañana» (job `recordar-recado` a las 09:00)
  y email de respaldo. **#5 hecho (PR 6, 20-09)**: calendario desconectado, número no activo,
  prueba que termina (`trial_will_end`), 80 % de minutos y pago fallido, con botón «Ir a
  Ajustes» (`cta_url` en ventana; plantilla con sufijo fuera) y email de respaldo donde no lo
  había. Queda el toggle de `avisoPorReserva` en el panel.
- ~~`confirmacion_cita_v2` con *Guardar contacto* (vCard al toque) y *Cómo llegar* (`placeId`);
  `Business.address`/`placeId` desde Places. La recepcionista anuncia el WhatsApp por voz.~~
  ~~`recordatorio_cita_v2` con *Confirmo* · *Cancelar* · *Cambiar*; cancelar libera, avisa (#4)
  y dispara la lista de espera; `hueco_libre` y reactivación de `notify_when_available`.~~ —
  **PR 4 (lado cliente), backend hecho el 20-09**: `mensajesCliente.ts` (parámetros por
  plantilla, cascada v2 aprobada → aprobada actual → variable de entorno decidida en el momento
  del envío, jobs por propósito que releen la reserva), `botonesCliente.ts` (los siete botones,
  correlación por `context.id` y doble prueba de identidad), `listaDeEspera.ts` (oferta al
  primero con retén de 10 min, «Sí, resérvala» con Call sintética `whatsapp:espera:<leadId>` y
  Booking en una transacción, botón del dueño «Avisar lista espera» en el #4),
  `bookings/cancelacion.ts` (compartido voz/botón), efectos de los `failed` diferidos de Meta,
  `mensajeCliente` en `book_appointment` y gate `listaDeEspera` del prompt por `hueco_libre`.
  Revisión del 20-09 incorporada: volver a reservar la misma hora tras cancelar en la misma
  llamada crea evento nuevo y reactiva la fila (clave de calendario distinta), «Sí, resérvala» y
  «Ya no» sobre un lead reservado cuya cita ya se canceló responden «cerrado»/«no te guardamos
  esa hora», cada toque de «Sí» pide al calendario una clave propia, un «Ya no» concurrente
  deshace la reserva en curso, el job descarta `DESTINO_CAMBIADO` si la reserva ya no es del
  número de la tarea, el respaldo tras un 132xxx lleva un taskId válido aunque la fila fuese
  `adhoc:`, y la limpieza de la lista de espera garantiza progreso entre disparos (no dentro del
  mismo). Mientras las v2 sigan `PENDING` sale `confirmacion_cita` (con cabecera, 5 parámetros),
  `recordatorio_cita` y `hora_disponible` (sin botones). Queda: el frontend (`placeId`/`address`
  desde Places en el alta, `types.ts`), retro-relleno de `placeId` en negocios ya dados de alta,
  comprobar en producción la posición del botón URL en `components` y la URL de «Cómo llegar»,
  y la prueba manual del criterio de salida. Detalle en `AGENTS.md` § WhatsApp › Código (PR 4).
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
  (`managedAgentPrompt.ts`); lista para elegir negocio si tiene citas en varios; botón
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

## Resultados de la fase 0 (2026-09-19)

**0.0 hecho.** WABA `804230d2-…` («Alhabla», `TIER_250`, verificación de empresa
`pending_submission`, 2 números: el actual `CONNECTED`/`GREEN` y +34 930 454 394 `PENDING`,
añadido por el usuario desde Meta; ver 0.9 para lo que pasó después). Ajustes del WABA: `webhook_url` de producción,
`webhook_enabled`, y `webhook_events` con **los nombres de Meta**: `messages`,
`message_template_status_update`, `template_category_update`, `phone_number_quality_update`,
`phone_number_name_update`, `account_update`, `account_review_update` (la API acepta cualquier
cadena sin validar: los nombres correctos son los de los campos de webhook de Meta). Perfil del
número actual: `about` «Gestionamos tus reservas», `description`, `email`, `website`,
`category` `PROF_SERVICES`; la foto se conserva. Componentes conversacionales: cuatro *ice
breakers* y comandos `agenda`, `hoy`, `manana` (sin ñ, por seguridad), `pausa`, `ayuda`.

**0.3 hecho.** Doce plantillas creadas por API con parámetros nombrados, todas `PENDING`
(tabla de arriba con los textos definitivos).

**0.1 hecho: los mensajes entrantes SÍ llegan, pero no como se esperaba.**

- El número no tiene ni puede tener perfil de mensajería (`40323` confirmado otra vez), y **no
  hace falta**: los mensajes entrantes de WhatsApp los entrega el **webhook del WABA** cuando
  `webhook_events` incluye `messages`. Sin ese valor se pierden en silencio (ni MDR ni webhook),
  aunque Meta sí los cuenta (la ventana de 24 h se actualizaba).
- El evento entrante es **`whatsapp.messages`**, no `message.received`. Payload en formato
  Meta: `payload.contacts[]` (`profile.name`, `wa_id`), `payload.messages[]` con `id` (UUID de
  Telnyx), `foreign_id` (`wamid…`), `from` (E.164), `from_user_id`, `timestamp` (epoch en
  segundos), `type` y el objeto del tipo; `payload.metadata` (`display_phone_number` = el número
  de Alhabla que recibe, `phone_number_id`). Verifica con la misma firma Ed25519 que los eventos
  de voz (el handler actual lo acepta y lo descarta como "no procesable").
- Formas capturadas: **texto** (`text.body`); **respuesta de botón** (`type: "interactive"`,
  `interactive.type: "button_reply"`, `button_reply.id/title`, y **`context.id` = el id del
  mensaje saliente al que responde**, el mismo que devolvió `POST /messages/whatsapp`: la
  correlación por `context.id` → `SentMessage.providerMessageId` queda confirmada); **audio**
  (nota de voz: `audio.url` en almacenamiento de Telnyx **`us-central-1`**, `mime_type`,
  `voice: true`; ojo a #13-16). *Ice breakers* y comandos no se llegaron a pulsar: se asume que
  llegan como `text`.
- Por el mismo webhook del WABA llegan además **estados en formato Meta**
  (`payload.statuses[]` con `id` = nuestro id de mensaje, `status` `sent|delivered|read`,
  `biz_opaque_callback_data`), y por el webhook por mensaje o del perfil los clásicos
  `message.sent` → `message.finalized` (`to[0].status: delivered`) → **`message.read`** (evento
  propio, no documentado en la skill), con el `body` del mensaje ecoado. Basta con uno de los
  dos caminos; el plan usa el del WABA y deja los clásicos como redundancia.
- El envío exige `messaging_profile_id` explícito (`40305` sin él), como ya hace el adaptador.
  `retrieveConversationWindow` funciona y **un toque de botón abre/renueva la ventana**
  (`last_user_message_at` se actualizó con la pulsación).
- Corrección a "sin evidencia de entrega": los MDR muestran entregas reales de WhatsApp al
  móvil del usuario desde el 15-09 (confirmaciones y recordatorios `delivered`).

**0.4 hecho (chat Beta), con un puente temporal WhatsApp ⇄ `chat` en dev y un Gestor de
prueba con una *shared tool*.**

- `client.ai.assistants.chat` ejecuta las *shared tools* adjuntas por `tool_ids`, con firma
  Ed25519 (`telnyx-signature-ed25519` + `telnyx-timestamp`, `user-agent: ai_assistants`).
  Turnos de 1,6-3,7 s (el primero, con tool, 3,7 s). Comportamiento correcto: propone y pide
  confirmación, respeta límites, coletilla Beta, `AYUDA`.
- **Las claves de los `metadata` de la conversación resuelven como variables dinámicas en las
  cabeceras de las tools** (`{{business_id}}`, `{{role}}`, `{{remitente}}`): es la vía del
  Gestor único. No resuelven `{{conversation_id}}`, `{{telnyx_end_user_target}}` ni
  `{{telnyx_current_time}}` (llegan literales). `telnyx_conversation_channel` = `web_chat`.
- Contexto inicial, tres vías válidas: **`PUT /v2/ai/conversations/{id}` con `system_prompt`**
  (la más limpia; el SDK lo llama `update`), `POST …/message` con `role: "system"` (cambió el
  trato a usted en mitad del chat) y la tool `contexto_negocio`.
- La respuesta de `conversations.create` viene envuelta en `data` aunque el tipo del SDK diga
  `Conversation`; Telnyx añade a los metadatos `assistant_id`, `assistant_version_id`,
  `called_tools`, `telnyx_conversation_channel`. La conversación tiene además
  `retention_in_hours`, `pii_redaction`, `in_transit_region`, `use_insights_for_memory`.
- Los assistants se borran en *soft delete*: una *shared tool* usada por uno borrado no se
  puede eliminar (`10015`).

**0.5 hecho (post-conversación) sobre la recepcionista de dev de Peluquería Alhambra.**

- Con `post_conversation_settings.enabled` y un bloque "Al terminar la llamada" en las
  instrucciones, la tool `informar_al_negocio` llegó **~1 s después de colgar** (llamada de 31 s),
  con cabeceras `{{call_control_id}}`, `{{telnyx_end_user_target}}` y canal `phone_call`, y un
  informe correcto: `LEAD_CAPTURED`, `CLIENTE_LO_PIDIO`, recado con motivo, teléfono del que
  llama y `quiere_que_le_llamen`.
- **Llega dos veces por llamada** (a los ~1 s y a los ~11 s), y en la segunda llamada de prueba
  **con contenido distinto** (primero `LEAD_CAPTURED` con recado, luego `RESOLVED` sin él). La
  idempotencia por `call_control_id` no basta con "primero gana": hay que decidir la regla (el
  plan propone: primero gana, y si el segundo trae recado y el primero no, se añade el recado
  sin cambiar el resultado). Se mide en el piloto.
- El nombre del cliente llegó vacío cuando no lo dijo; la recepcionista usó el número del que
  llama para el recado **sin preguntar**, y el usuario se quejó de ello en la llamada: el prompt
  debe pedir "¿te llamamos a este número?" antes de guardarlo.

**0.6 hecho (memoria).** `dynamic_variables_webhook_url` (timeout 5 s) recibe al descolgar
`assistant.initialization` con `assistant_id`, **`telnyx_conversation_id`**, `call_control_id`,
`call_session_id`, `call_leg_id`, `to`/`from`, `telnyx_agent_target`, `telnyx_end_user_target`,
`telnyx_conversation_channel`, `telnyx_call_caller_id_name`, `telnyx_current_time` y
`telnyx_end_user_target_verified: false`. Devolviendo `memory.conversation_query` acotada a
`assistant_id` y al número, **la segunda llamada recordó la primera** ("me pediste que el dueño
te llamara para explicarte cómo funcionan las mechas; dejé tu teléfono…"). La comprobación
cruzada con otro assistant queda por construcción (la consulta lleva `assistant_id`); no se
llamó a la Barbería.

**0.2 hecho (entrega y coste).** Entrega de extremo a extremo confirmada: la plantilla enviada
al móvil del usuario el 19-09 (20:32 UTC) figura en el MDR como `delivered`, y los MDR de
producción muestran plantillas de utilidad `delivered` desde el 14-09 (recordatorios de las
09:00 y 13:00 incluidos). **Costes reales en España vía Telnyx** (moneda USD, del MDR
`GET /v2/messages` con `billing_type`):

| Tipo | `billing_type` | Tarifa Telnyx | Tasa de Meta (`carrier_fee`) | Total |
|---|---|---|---|---|
| Plantilla de utilidad (confirmación, aviso, recordatorio) | `whatsapp_utility` | 0,004 $ | 0,020 $ | **0,024 $** |
| Mensaje libre dentro de la ventana (texto, interactivo, vCard) | `whatsapp_service` | 0,004 $ | 0 | **0,004 $** |

Es decir: una reserva con confirmación al cliente y aviso al negocio cuesta ~0,05 $; toda la
conversación posterior por botones o chat, 0,004 $ por mensaje de Alhabla (los del usuario no
se cobran). Confirma la regla del plan: mantener la ventana abierta con botones sale seis veces
más barato que una plantilla.

**0.7 (residencia UE): sin confirmar.** Es una consulta a Telnyx (#13-16), no código: dónde se
procesan y guardan las conversaciones del chat y la memoria (`in_transit_region`), los medios
entrantes de WhatsApp (hoy en `us-central-1`) y el modelo (`gpt-5.6-luna` no tiene región EU;
GLM-5.3-Flash y Qwen3-235B sí). No bloquea la fase 1; bloquea la memoria de clientes (fase 3)
si la respuesta es negativa.

**0.8 (verificación de empresa en Meta): pendiente, trámite del usuario** (#103). Sigue
`pending_submission`. Mientras tanto: 250 destinatarios/día, nombre visible sin garantía y
2 números, que son justo los dos de audiencia.

**0.9 hecho (segundo número, `CONNECTED` a las 23:14).** Lo que pasó el 19-09 por la noche:

- El usuario añadió +34 930 454 394 desde WhatsApp Manager de Meta y lo verificó allí. Telnyx
  lo veía `PENDING` con `platform_type: NOT_APPLICABLE`: Meta tenía la titularidad verificada
  pero **Telnyx nunca hizo el registro en Cloud API**. Renombrado por API a «Alhabla Reservas»
  (`display_name_status: PENDING_REVIEW`).
- `resendVerification` → `10015 Verification not initialized`; `initializeVerification` →
  `10007 … Phone number already verified` (Meta se niega a emitir otro código). Callejón sin
  salida por API.
- Se borró del WABA (`DELETE /v2/whatsapp/phone_numbers/+34930454394` → 204) para darlo de alta
  por API, y `initializeVerification` devolvió `404 10005 Phone number not found` con los dos
  ids del WABA: **ese endpoint no añade números al WABA**, solo pide el código de uno que ya
  está. Según la documentación de Telnyx los números se añaden por Embedded Signup (portal),
  que acepta un número de Telnyx con perfil de mensajería (imposible para los españoles,
  `40323`) o un número ya presente en el WABA de Meta. Con esto último probablemente habría
  bastado sin borrar: el portal lista «BYON numbers already on the connected WABAs».
- **Vía que funcionó**: portal de Telnyx → *Messaging → WhatsApp → Add phone number* → en la
  ventana de Meta, número y verificación por llamada. El primer intento no generó llamada; el
  segundo sí (23:11, desde +44 1202 057103, desviada al móvil del usuario), y a las 23:14 el
  número estaba `CONNECTED` con `platform_type: CLOUD_API`, `phone_number_id` Meta
  `1305416552659363`. Es como se registró el +34 930 453 218 el 13-09. Plan B no necesario.
- Perfil fijado por API: «Alhabla Reservas», «Gestionamos tus reservas», descripción para
  clientes, `PROF_SERVICES`, email y web. Sin *ice breakers* ni comandos hasta la fase 1.
- Primer envío real desde el número de clientes: `confirmacion_cita` a +34 692 138 456,
  `delivered`. **Ojo**: por `name` + `language: es_ES` Meta devuelve `40008 Undeliverable`
  desde los dos números aunque la plantilla esté aprobada; por `template_id` se entrega. Regla
  para el adaptador: **siempre por `template_id`** (`WhatsappTemplate` ya lo guarda).
- El número de Telnyx no se ha tocado: `active`, desvío `always` → +34 692 138 456.
- De paso, `business_verification_status` del WABA pasó de `pending_submission` a `pending`:
  la verificación de empresa (#103) ya está enviada a Meta.

## Variables de entorno previstas

```text
WHATSAPP_WABA_ID                        # UUID Telnyx del WABA
OWNER_ALTA_CODE_TTL_HOURS=72
OWNER_DIGEST_DEFAULT_TIME=20:30
TELNYX_OWNER_CHAT_ENABLED=false         # nivel 2 del dueño (Beta)
TELNYX_CLIENT_CHAT_ENABLED=false        # nivel 2 del cliente (Beta)
TELNYX_GESTOR_ASSISTANT_ID              # assistant único de plataforma (Gestor)
WHATSAPP_FORWARDING_NUMBER=+34692138456 # desvío de los números de Alhabla (verificación de Meta)
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
| El post-procesado llega **dos veces y a veces con contenido distinto** (verificado en la fase 0.5) | Idempotencia por `call_control_id` con regla explícita: primero gana; si el segundo trae recado y el primero no, se añade el recado sin cambiar el resultado |
| Meta reclasifica una plantilla a marketing | Textos secos; webhook y tabla lo detectan |
| El coste del aviso por reserva | Botones mantienen la ventana; contador y alerta; el dueño puede apagarlo |
| `assistants.chat` es Beta en Telnyx | Kill switches; sustituto propio con las mismas tools |
| El LLM del dueño ejecuta algo indebido | Solo `proponer_accion`; el botón ejecuta |
| La recepcionista por chat arrastra instrucciones de voz (end_call, "se lee en voz alta") | Bloque "modo chat" condicional en el prompt; pruebas de contrato de las cinco tools por chat en fase 0.4 |
| Un incidente con clientes (bloqueos, `STOP`) baja la calidad del número | Aislado por audiencia: los avisos al negocio salen por el otro número; respaldo al de negocios si el de clientes cae |
| `STOP` mal gestionado baja la calidad del número para todos | Determinista, probado, global por número |
| Tools inline actuales sin soporte | Tools nuevas compartidas; issue aparte para migrar las de voz |
| Memoria cruza tenants | Consulta acotada a `assistant_id`; test con dos negocios y un número |
| Un Gestor único mezcla negocios | El negocio se resuelve por `conversation_id` en el backend en cada tool; test de integración con dos dueños y un mismo Gestor |
| La residencia UE obliga a cambiar de modelo | El chat tolera el cambio: modelos con región EU en el catálogo (GLM-5.3-Flash, Qwen3-235B) sin tocar nada más |

## Preguntas abiertas

1. Residencia UE del chat por API y de la memoria (#13-16).
2. ~~Forma exacta del entrante de WhatsApp~~ — resuelto: `whatsapp.messages` (§ Resultados).
3. ~~¿Un toque de botón abre la ventana de 24 h?~~ — sí, confirmado.
4. Límite de respuestas rápidas por plantilla de utilidad — al crearlas.
5. Tarifa exacta por mensaje en España vía Telnyx (llega en `cost.amount`).
6. ~~¿Qué identificador de conversación recibe una *shared tool*?~~ — ninguno por variable
   (`{{conversation_id}}` no resuelve); el negocio va en `{{business_id}}` desde los metadatos.
7. ~~Contexto del Gestor por conversación~~ — resuelto: `system_prompt` por conversación y
   metadatos como variables en las cabeceras de las tools (fase 0.4). Para la recepcionista por
   chat, el marcador `[WhatsApp]` sigue siendo la vía (no se probó el webhook de variables en
   chat por API).
8. ¿Acepta Meta «Alhabla Reservas» como nombre visible bajo la cartera de Alhabla? Está
   `PENDING_REVIEW` junto con «Alhabla» (fase 0.9); si lo rechaza, queda «Alhabla» en los dos.
9. ¿Qué hacer con el desvío de llamadas de los números de Alhabla una vez verificados?
10. Parámetros nombrados: **sí** los acepta la API (plantillas creadas así). `payload` de
    `quick_reply` en plantillas: sin probar; la correlación va por `context.id`, así que no
    bloquea.
11. Los medios entrantes (notas de voz, imágenes) se guardan en almacenamiento de Telnyx en
    `us-central-1`: ¿hay región UE? Va con #13-16.

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
| Assistant de cliente (2026-09-19) | **Descartado**: la recepcionista del negocio atiende al cliente por chat con sus tools de siempre; el cliente puede consultar, cancelar, cambiar y reservar por WhatsApp |
| Pasada final con el SDK 7.21 (2026-09-19) | `messages.whatsapp` (no `sendWhatsapp`); ventana de 24 h consultada a Telnyx; botones correlacionados por `context.message_id` + `biz_opaque_callback_data`; *ice breakers* y comandos por número; plan B del chat sobre el LLM alojado en Telnyx |
| Números de WhatsApp (2026-09-19, tarde) | Uno por sector (cinco comprados de uno en uno, con desvío permanente al móvil del usuario para la verificación por voz) — **sustituido esa misma noche** por la fila siguiente; los números quedan en reserva hasta #103 |
| Números de WhatsApp (2026-09-19, noche) | **Uno por audiencia**: +34 930 453 218 «Alhabla» para negocios (el verificado) y +34 930 454 394 «Alhabla Reservas» para clientes (en alta desde el portal de Telnyx); son los dos números que admite el WABA antes de #103; el `to` identifica la audiencia; el de negocios es el respaldo |

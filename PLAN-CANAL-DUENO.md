# Plan: el canal con el dueño del negocio es WhatsApp bidireccional (y WhatsApp como segunda puerta)

## Decisión de producto

**La recepcionista también le escribe a su jefe.** La parte del producto que comunica con el
propietario del negocio se resuelve con WhatsApp bidireccional a través del WABA de Telnyx ya
conectado, con el panel como archivo y el email como registro. Ni segundo número por cuenta, ni
notificaciones push, ni WABA por negocio.

**Ampliación del mismo día (2026-09-19, tarde), decisión del usuario:**

1. El **chat del dueño se implementa y sale etiquetado como Beta** (no queda como opción
   condicionada al éxito de la fase 1).
2. **Onboarding por WhatsApp**: tras elegir el negocio en Places y confirmar el tipo, un modal
   nuevo permite configurar el perfil de WhatsApp de la recepcionista y, al terminar, **llamarla
   por WhatsApp** desde el móvil del dueño. Antes de servicios, equipo, calendario y pago.
3. **Los clientes también pueden llamar por WhatsApp.** Cada negocio tiene su número de Alhabla
   registrado como número de WhatsApp Business dentro del WABA de Alhabla, con llamadas
   activadas; la recepcionista las atiende igual que las de teléfono. Detalle técnico en
   `PLAN-WHATSAPP-LLAMADAS.md` (plan del 2026-09-18, ahora subordinado a este).

Esto cambia una decisión de la mañana: ya no hay "un solo remitente". El **dueño** habla con el
contacto "Alhabla" (número de plataforma); los **clientes** hablan y llaman al número del
negocio, con su nombre y su foto, y el número de plataforma queda de respaldo hasta que el del
negocio esté verificado.

Decisión tomada el 2026-09-19 sobre el diagnóstico de la auditoría de producto de ese día: el
bucle técnico (llamada → cita en calendario → panel → factura) está cerrado y verificado en
producción, pero el dueño está fuera de él: nadie le avisa de lo que pasa, no puede actuar sobre
lo que ve, y la recepcionista promete cosas que no ocurren.

| Alternativa | Por qué se descarta |
|---|---|
| Segundo número Telnyx por cuenta ("línea del dueño") | La numeración geográfica española es *voice-only* de forma estructural (error 40323, ver `AGENTS.md` § send-sms): un segundo número tampoco podría mensajear. Lo único que aportaría, una línea de administración por voz, se consigue reconociendo el número del negocio en la misma línea. |
| Un **WABA** (cuenta de WhatsApp Business de Meta) por negocio | Verificación de Meta negocio a negocio, Facebook Business Manager por peluquería, plantillas por negocio, y para llamadas cada cartera tendría que alcanzar por sí sola el límite de 2.000. Inviable. Lo que sí se hace es **un número por negocio dentro del WABA de Alhabla** (ver `PLAN-WHATSAPP-LLAMADAS.md` § 3). |
| Atender el WhatsApp *actual* del negocio (su móvil con la app WhatsApp Business) | Las llamadas de WhatsApp son VoIP dentro de la app: no se desvían con `**61*`, y Meta no soporta llamadas por API en números en coexistencia. Nunca se promete en copy. |
| Web Push desde el panel | Técnicamente posible (también en iPhone si añaden la app al inicio), pero frágil para este público: permisos, instalación, silenciado sin querer. Queda como capa opcional futura, nunca como columna vertebral. |
| Esperar al Alphanumeric Sender ID de SMS | Sigue pendiente de la CNMC y es unidireccional. Pasa a ser *fallback* para el dueño sin WhatsApp, no la vía principal. |
| Llamadas salientes de la recepcionista (recordatorio por voz, llamar al dueño si no reacciona) | Telnyx lo permite (eventos programados `phone_call`), pero **el usuario lo descartó el 2026-09-19**: nada de llamadas salientes. Se anota como idea; no forma parte de este plan. Las llamadas de WhatsApp de este plan son siempre **entrantes**. |

## Objetivo

1. Que el dueño reciba en su WhatsApp, con botones, cada cosa que requiere su atención: recados,
   citas que no pudieron guardarse, cancelaciones, alertas operativas, y un **cierre del día**.
2. Que pueda **actuar** desde ese mismo chat: resolver pendientes, cancelar o mover citas, marcar
   ausencias, bloquear franjas, consultar la agenda. Sin pantallas nuevas de edición en el panel.
3. Que la recepcionista deje de prometer lo que no cumple: el aviso de "se ha liberado tu hora" se
   convierte en una lista de espera real; el recado deja de morir en un resumen.
4. Que el recordatorio al cliente lleve botones (confirmo / cancelar / cambiar) y que cancelar
   libere el hueco, avise al dueño y dispare la lista de espera.
5. Que la recepcionista **recuerde** al cliente y al dueño entre canales (voz y WhatsApp).
6. Que el dueño **oiga a su recepcionista en el minuto tres del alta**, llamándola por WhatsApp
   desde su móvil, antes de meter servicios, equipo, calendario o tarjeta.
7. Que el negocio tenga **presencia en WhatsApp Business sin tocar Meta**: contacto con su nombre
   y su foto, llamadas de clientes por WhatsApp atendidas por la recepcionista, y confirmaciones
   que llegan en ese mismo chat desde el nombre del negocio.
8. Que el chat del dueño exista en el producto **como Beta** declarada, con su etiqueta, su
   interruptor y su vía de feedback.

## Límites explícitos

- **Sin llamadas salientes.** Ni recordatorios por voz, ni llamar al dueño, ni llamadas de
  WhatsApp iniciadas por la recepcionista. Decisión del usuario. Las llamadas de WhatsApp de
  clientes y la llamada de prueba del onboarding son **entrantes**.
- Sin segundo número Telnyx para el dueño, sin WABA por negocio, sin Web Push en este plan.
- Dos remitentes por negocio, con papeles fijos: el **número de plataforma**
  (`WHATSAPP_TELNYX_FROM_NUMBER`, contacto "Alhabla") es el canal del dueño y el respaldo de los
  mensajes a clientes; el **número del negocio** (su número de Alhabla registrado en WhatsApp) es
  la cara hacia los clientes: llamadas, confirmaciones y recordatorios, en cuanto esté verificado.
- **El WhatsApp actual del negocio no se atiende.** Ni sus llamadas ni sus chats. El copy lo dice
  en la landing, en el modal y en Ajustes.
- La llamada de prueba del onboarding va al número de plataforma (el negocio aún no tiene
  número) y se enruta por quien llama. Exige que ese número tenga llamadas de WhatsApp activas y
  que la cartera de Alhabla cumpla el requisito de Meta (§ 13).
- Las reservas normales **no** generan un mensaje por cita por defecto: ya aparecen en el
  calendario del negocio y en el panel; van al cierre del día. Instantáneo solo si el dueño lo
  activa.
- Nada de Meta Graph API directa: todo pasa por Telnyx, como ya hace `WhatsAppAdapter.ts`.
  Envío, plantillas, números de WhatsApp y ajustes del WABA se hacen con el SDK oficial
  (`client.messages.sendWhatsapp`, `client.whatsapp.templates.*`,
  `client.whatsapp.phoneNumbers.*`, `client.whatsapp.businessAccounts.settings.*`), no con
  `fetch` a pelo ni desde el portal. El MCP de Telnyx no expone `/v2/whatsapp/*`, pero el SDK sí.
- El SMS con Sender ID y el email siguen existiendo como *fallback* y registro. No se construye
  un sustituto temporal del SMS.

## Estado actual relevante

- WABA conectado vía Embedded Signup de Telnyx; número remitente y dos plantillas aprobadas por
  Meta (`confirmacion_cita`, `recordatorio_cita`) configuradas en producción. Sin evidencia en el
  repo de una entrega real de extremo a extremo a un cliente.
- `WhatsAppAdapter.ts` + `jobs/sendWhatsapp.ts` + cola `send-whatsapp` funcionan para
  confirmación y recordatorio (24 h antes) con consentimiento por voz (`smsConsent`).
- El aviso de hueco libre (`notify_when_available`) está registrado en todos los assistants y el
  prompt lo ofrece siempre, pero `WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME` no existe en producción:
  el aviso se guarda (`Lead` tipo `availability_watch`) y nunca se envía.
- El SMS de "nueva reserva" al dueño nunca llega en producción (sin Sender ID; el número Telnyx
  está bloqueado para mensajería). El dueño solo se entera por el evento del calendario, el panel
  y el resumen semanal por email (Pro/Scale).
- Recados, devoluciones de llamada y leads no existen como dato: viven en el resumen de la
  llamada. No hay tool de recado. Tras una llamada solo se disparan la grabación y el reporte de
  uso.
- "Citas pendientes de confirmar" (`Lead` tipo `pending_booking`) se listan en el panel pero el
  dueño no puede resolverlas; solo el reintento automático marca `resolvedAt`.
- La agenda del panel es solo lectura. Sin calendario externo, una cita solo la puede cancelar el
  cliente llamando.
- Los profesionales no tienen horario propio ni ausencias; solo el horario del negocio con
  excepciones globales.
- El webhook `/webhooks/telnyx` ya recibe eventos `message.*` del perfil de mensajería y los
  ignora (logueados, `ignored: true`).
- La clasificación de la llamada (resultado, motivo de escalada, fallo de tool, servicio pedido)
  llega por `call.conversation_insights.generated` con tres insights custom; en Retell, por
  `post_call_analysis_data`.
- Los 9 assistants de la cuenta Telnyx tienen `enabled_features: ["telephony"]`,
  `messaging_settings: null`, `post_conversation_settings.enabled: false` y
  `dynamic_variables_webhook_url: null` (decisión del plan Telnyx §2 por el timeout de 1 s). Todos
  apuntan a `dev-api`.
- `Business.phone` nace como placeholder (`TEMP-…`) en el registro; el dueño puede editarlo en
  Ajustes. No hay verificación de ese número.
- El backend usa `telnyx@7.17.0`; `WhatsAppAdapter.ts` llama a `/v2/messages/whatsapp` con
  `fetch`. La versión publicada es 7.21.0 y expone `client.messages.sendWhatsapp`,
  `client.whatsapp.*`, `client.ai.assistants.chat`, `client.ai.tools.*`,
  `client.ai.conversations.*` y `client.verifications.triggerWhatsappVerification`.
- Las tools de voz se registran **inline** en cada assistant (`tools[]`, una copia por negocio,
  con URL de `dev-api`/`api`). El SDK marca ese campo como *"Deprecated for new integrations"*;
  la vía nueva son las *shared tools* (`client.ai.tools.create` + `tool_ids`).

## Hallazgos de la API de Telnyx (2026-09-19)

Verificados contra el MCP de Telnyx (`https://api.telnyx.com/v2/mcp`, esquemas de
`create_ai_assistants`, `chat_ai_assistants`, `list_ai_conversations`,
`create_assistants_ai_scheduled_events`, `create_messaging_profiles_autoresp_configs`, y
`retrieve_ai_assistants` sobre un assistant real), su documentación pública y, en una segunda
pasada el mismo día, las skills oficiales del SDK (`telnyx-whatsapp`, `telnyx-messaging`,
`telnyx-ai-assistants`, `telnyx-verify`, variante JavaScript, plugin 0.4.0).

| Capacidad | Dónde | Uso en este plan |
|---|---|---|
| Mensajes interactivos: `button` (hasta 3 respuestas rápidas), `list`, `cta_url`, `carousel`, `location_request_message` | `POST /v2/messages/whatsapp`, `whatsapp_message.type: "interactive"` | Botones en todos los avisos; listas para elegir cita ("¿cuál cancelo?") y para la agenda del día |
| Plantillas con botones `quick_reply` (payload por envío) y `url` | Componentes `button` de plantilla | Avisos fuera de la ventana de 24 h con botones cuyo payload identifica el recurso (`lead:<id>:atendido`) |
| Al pulsar un botón llega un webhook con el `id` del botón | Webhook de mensajería (`message.received`) | Enrutado determinista de respuestas |
| `context.message_id` (responder en hilo) y `biz_opaque_callback_data` (etiqueta que vuelve en los webhooks de entrega) | Envío | Cada envío lleva el id de reserva/lead; las respuestas se correlacionan sin adivinar |
| Ventana de 24 h: texto libre e interactivos solo dentro; fuera, plantilla | Documentación | El texto libre del dueño abre ventana; el cierre del día es plantilla salvo ventana abierta |
| `POST /v2/ai/assistants/{id}/chat` con `conversation_id`: el assistant ejecuta sus tools y devuelve `content` | `chat_ai_assistants` | El chat del dueño (nivel 2) sin bucle de LLM propio; historial por API (`list_conversations_ai_messages`) |
| Post-conversación: al colgar, el mismo modelo, con todo el contexto, ejecuta tools (no las de telefonía) | `post_conversation_settings.enabled`, pasos en `instructions` (release 2026-04-21) | Tool `informar_al_negocio` que devuelve recado/lead/clasificación; sustituye a los tres insights |
| Memoria entre conversaciones, **compartida entre voz y mensajería**, configurada por llamada con `memory.conversation_query` en la respuesta del webhook de variables dinámicas | Documentación *Memory*; payload `assistant.initialization` con `telnyx_conversation_channel`, `telnyx_end_user_target` | Recordar al cliente y al dueño; exige activar `dynamic_variables_webhook_url` (timeout 1,5 s, *best effort*) |
| `handoff` entre assistants con voz unificada | Tools de assistant | Modo dueño por voz como assistant separado, traspaso transparente |
| Perfil de mensajería con `ai_assistant_id` y feature `messaging` del assistant | `messaging_profiles`, `enabled_features` | **No se usa**: el número español no puede asignarse de forma permanente a un perfil (40323) y no está confirmado que cubra WhatsApp. Alhabla es dueña del webhook entrante |
| Auto-respuestas por palabra clave y país (`op: start/stop/info`) | `messaging_profiles/{id}/autoresp_configs` | STOP/START de SMS lo gestiona la plataforma; en WhatsApp lo gestiona Alhabla |
| Verify con canal WhatsApp (OTP con plantilla de autenticación, 0,03 $ + mensaje) | Release 2026-06-11 | Alternativa al alta por «ALTA» para quien prefiera teclear un código en el panel. No es la vía principal |
| `widget_settings` y `supports_unauthenticated_web_calls` | Assistant | "Probar mi recepcionista" desde el panel (hoy no existe). Fuera del alcance de este plan; se apunta |
| Eventos programados `phone_call` / `sms_chat` | `scheduled_events` | **Descartado** (sin llamadas salientes; `sms_chat` no sirve en España) |
| `telnyx_end_user_target_verified` | Solo STIR/SHAKEN (EE. UU.) | No aplica en España: el PIN para acciones destructivas por voz se queda |
| Plantillas por API: `client.whatsapp.templates.create/list`, referencia por `template_id` (UUID), estados `APPROVED/PENDING/REJECTED/DISABLED`, `quality_rating` por plantilla | SDK `telnyx-whatsapp` | Las ocho plantillas se crean con un script y se siguen por webhook; el envío usa `template_id`, no nombre + idioma |
| Webhooks de plantilla (`whatsapp.template.approved/rejected/disabled`) y de calidad (`whatsapp.phone_number.quality_changed` GREEN/YELLOW/RED, `whatsapp.account.restricted`), suscritos con `businessAccounts.settings.update` (`message_template_status_update`, `phone_number_quality_update`) | SDK `telnyx-whatsapp` | Tabla `WhatsappTemplate` alimentada por webhook; el monitor de calidad reacciona a eventos, no a contadores propios |
| Webhooks de entrega `message.sent` / `message.finalized` con `to[0].status` (queued, sent, delivered, read, failed), `template_name`, `cost.amount` y `errors[]` | SDK `telnyx-messaging` / `telnyx-whatsapp` | Estado de entrega y **coste real por mensaje** en `SentMessage`; la alerta de coste se calcula con lo que Telnyx factura |
| Errores de WhatsApp: `131026` el destinatario no tiene WhatsApp; `131047` fuera de la ventana de 24 h; `132015` plantilla pausada por calidad; `132000` número de parámetros incorrecto; `40008` genérico de Meta | SDK `telnyx-whatsapp` | `131026` ⇒ ese dueño cae a email en el acto y el panel lo dice; `132015` ⇒ la plantilla se marca no usable hasta nuevo webhook |
| Botones de plantilla: `QUICK_REPLY`, `URL` (un sufijo dinámico `{{1}}`), `PHONE_NUMBER` (número fijo), `COPY_CODE` | SDK `telnyx-whatsapp` | `alerta_operativa_negocio` lleva URL con sufijo dinámico a la sección exacta de Ajustes; `PHONE_NUMBER` no sirve (el teléfono del cliente cambia por mensaje) |
| Categorías y facturación: `UTILITY` para transaccional; Meta puede **reclasificar** una plantilla a `MARKETING` (más cara) | SDK `telnyx-whatsapp` | Los textos evitan cualquier tono promocional; el webhook de plantilla y la tabla detectan la reclasificación |
| `tools[]` inline del assistant **obsoleto** para integraciones nuevas; *shared tools* (`client.ai.tools.create`, `tool_ids`), tipos `webhook`, `handoff`, `retrieval`, `invite`, `client_side_tool`; `mcp_servers` por assistant | SDK `telnyx-ai-assistants` | Toda tool nueva de este plan (`informar_al_negocio`, tools de dueño, `proponer_accion`) se define **una vez** como compartida y se adjunta por `tool_ids`; migrar las cinco de voz es un trabajo aparte, no de este plan |
| `client.ai.assistants.chat` está marcado **BETA** | SDK `telnyx-ai-assistants` | Riesgo explícito; el diseño mantiene a Alhabla como dueña del webhook y del enrutado, de modo que el nivel 2 puede sustituirse por un bucle propio (Claude + las mismas tools) sin tocar nada más |
| `client.ai.assistants.tools.test` (prueba una webhook tool con argumentos y variables) | SDK `telnyx-ai-assistants` | Fase 0.4 y tests de contrato de las tools nuevas |
| El payload de `message.received` documentado en el SDK solo contempla `type: SMS, MMS`; la forma del mensaje entrante de WhatsApp (texto, respuesta de botón, lista) **no está documentada** | SDK `telnyx-messaging` | La fase 0.1 es imprescindible: hay que capturar los payloads reales antes de escribir el enrutado |
| Verify por WhatsApp: `client.verifications.triggerWhatsappVerification` + `client.verifications.byPhoneNumber.actions.verify` | SDK `telnyx-verify` | Alta alternativa desde Ajustes, dos llamadas; exige perfil de Verify con plantilla `AUTHENTICATION` |
| `client.messages.schedule` (`send_at`) | SDK `telnyx-messaging` | **No se usa**: los envíos diferidos siguen en Cloud Tasks (`scheduleTime`), que ya da idempotencia y reintentos |

## Diseño destino

### 1. Canal y remitente

Un único remitente de WhatsApp de Alhabla. El dueño lo guarda como contacto ("Alhabla"). Cada
mensaje empieza por el nombre del negocio cuando el destinatario es un cliente, y por el nombre
del cliente cuando el destinatario es el dueño. Toda la mensajería (dueño y cliente) pasa por
`WhatsAppAdapter.ts` (migrado a `client.messages.sendWhatsapp` del SDK, con `template_id`) y la
cola `send-whatsapp`; el SMS (`send-sms`) queda como fallback cuando haya Sender ID; el email
(`send-email`) como registro y para lo que ya cubre (facturación, resumen semanal, contraseñas).
Ningún envío de plantilla sale si `WhatsappTemplate.status` no es `APPROVED`.

### 2. Alta del dueño

1. En el panel (checklist de onboarding, paso nuevo "Recibe los avisos en tu WhatsApp"): un QR y
   un enlace `wa.me/<remitente>?text=ALTA%20<código>` con un código corto ligado al negocio.
2. El dueño envía el mensaje. Con eso, en una sola acción: se verifica que ese número existe y
   tiene WhatsApp, queda el consentimiento explícito con fecha (`ownerWhatsappOptInAt`), se
   sustituye el teléfono placeholder si sigue en `TEMP-…`, y se abre la ventana de 24 h.
3. Respuesta inmediata con texto libre: qué va a recibir, qué puede escribir, y botones para
   elegir el cierre del día (hora) o silenciarlo.
4. `STOP`/`BAJA` en cualquier momento: se marca `ownerWhatsappOptOutAt`, se confirma con un último
   mensaje y no se vuelve a enviar nada hasta un nuevo ALTA. Meta degrada la calidad del número si
   esto falla, y afecta también a los mensajes a clientes.
5. Alternativa: Verify por WhatsApp desde Ajustes (código en el panel). No abre ventana ni da de
   alta el contacto; solo para quien no quiera escanear.

### 3. Catálogo de mensajes al dueño

Cada mensaje es accionable. Los botones son de plantilla (fuera de ventana) o interactivos
(dentro). El payload de cada botón identifica el recurso y la acción.

| # | Disparador | Contenido | Botones | Efecto de la respuesta | Por defecto |
|---|---|---|---|---|---|
| 1 | Post-conversación devuelve recado o petición de devolución de llamada | "María, 612 345 678. Quiere saber si hacéis balayage y que la llames." | *Atendido* · *Recuérdamelo mañana* | Marca el `Lead` como resuelto / reprograma el mismo aviso a las 9:00 del día siguiente | Instantáneo, todos los planes |
| 2 | `pending_booking` creado en llamada (calendario caído, conexión caducada, lock) | "Juan, martes 17:00, corte. No entró en tu calendario: <motivo en castellano>." | *La apunté yo* · *Reintentar* · *Reconectar calendario* | Resuelve el lead y crea la reserva local / encola `retry-failed-booking` / responde con el enlace de Ajustes › Calendario | Instantáneo, todos los planes |
| 3 | Cliente cancela (voz o botón del recordatorio) | "Laura canceló el jueves 12:00 (mechas). Hueco libre." | *Avisar a quien esperaba* · *Vale* | Dispara `notifyPendingAvailabilityWatchers` para ese hueco (hoy ya existe, sin plantilla) | Instantáneo, todos los planes |
| 4 | Cierre del día (hora configurable, por defecto 20:30 hora del negocio) | "Hoy: 9 llamadas, 6 citas, 1 recado, 2 consultas. Mañana: 11 citas, la primera 9:30 con Marta." | *Ver mañana* · *Silenciar hoy* | Lista interactiva con las citas de mañana / no enviar el próximo cierre | Diario, todos los planes; sin llamadas ese día no se envía |
| 5 | Alerta operativa: calendario desconectado, número no activo, prueba que termina en 2 días, 80 % de minutos, pago fallido | Texto según causa | *Ir a Ajustes* (URL) | — | Instantáneo; los de facturación siguen yendo también por email |
| 6 | Nueva reserva confirmada | "Nueva cita: Ana, viernes 11:00, corte + peinado, con Laura." | *Vale* | — | **Desactivado**; el dueño lo activa desde el chat (`avisos por cita`) o Ajustes |

Los avisos que exigen ventana de 24 h abierta y no la tienen se envían como plantilla; los que
la tienen, como interactivo (gratis y sin límite de botones de plantilla).

### 4. Entrada: el webhook de mensajería

`/webhooks/telnyx` ya recibe `message.received`. Pasa a procesarse con la misma tabla de
idempotencia que los eventos de voz (`VoiceWebhookEvent`) y este enrutado, en este orden:

1. **Identificar al remitente**: número → `Business.ownerWhatsappNumber` (dueño) o → `Booking`
   /`Lead` con ese `clientPhone` y consentimiento (cliente). Desconocido: respuesta fija ("Este
   número solo envía avisos de <Alhabla>; para reservar llama al negocio") y fin.
2. **STOP/BAJA/ALTA**: siempre deterministas, antes que nada.
3. **Botón** (`interactive.button_reply.id` o payload de `quick_reply`): handler determinista por
   prefijo (`lead:`, `booking:`, `digest:`, `watch:`). Nunca pasa por el LLM.
4. **Texto libre del dueño**: nivel 1, palabras clave (`agenda`, `mañana`, `hoy`, `pausa`,
   `avisos por cita`); si no encaja, nivel 2, el asistente de gestión (§5).
5. **Texto libre de un cliente**: respuesta fija con el teléfono del negocio. En este plan el
   cliente solo usa botones; su canal de gestión sigue siendo la llamada.

### 5. Asistente de gestión (chat del dueño) — Beta

Un assistant Telnyx **distinto** de la recepcionista, uno por negocio, sin telefonía ni
mensajería activadas (solo se usa por `chat_ai_assistants`): `alhabla-gestion-<businessId>`.

**Se implementa y sale como Beta** (decisión del usuario, 2026-09-19):

- Etiqueta visible: cada respuesta del nivel 2 termina con una línea corta "_Beta · escribe
  AYUDA para ver qué sé hacer_"; en el panel, el bloque del chat y la fila de Ajustes llevan el
  badge «Beta» (`.badge-soft`). Las respuestas deterministas (botones, palabras clave) no llevan
  la coletilla: no son beta.
- Disponible para **todos los planes mientras sea Beta**, para aprender de uso real; al salir de
  Beta pasa al gating de Pro previsto en la escalera. `planFeatures.ts` lleva `chat_dueno_beta`
  ahora y `chat_dueno` después.
- Feedback: la respuesta `AYUDA` lista lo que sabe hacer; cualquier respuesta del nivel 2 puede
  contestarse con `MAL` y el backend guarda la última pareja pregunta/respuesta en
  `OwnerChatFeedback` para revisarla; sin LLM de por medio.
- Interruptor global `TELNYX_OWNER_CHAT_ENABLED` y por negocio (`Business.ownerChatEnabled`,
  desde Ajustes › Avisos). Apagado ⇒ el texto libre recibe "Ahora mismo solo entiendo botones y
  las palabras `agenda`, `mañana`, `hoy`, `pausa`".
- Límites de Beta: 60 mensajes por dueño y día (evita bucles y coste); las acciones destructivas
  siguen exigiendo botón de confirmación (no se relaja por ser Beta).

- `conversation_id` (UUID) estable por dueño (uno por negocio) para que el contexto se mantenga
  entre mensajes; se rota cada 30 días o al hacer `BAJA`.
- `client.ai.assistants.chat` es **BETA**. Se acepta porque Alhabla controla el webhook y el
  enrutado: si la beta cambia o se retira, el nivel 2 se sustituye por un bucle propio (Claude
  con las mismas tools por HTTP) sin tocar alta, botones, plantillas ni panel.
- **Tools**: las de voz que ya existen (`get_catalog`, `check_availability`, `book_appointment`,
  `find_my_appointment` con número explícito, `cancel_appointment`) más las nuevas de dueño:
  `listar_agenda(fecha)`, `cancelar_cita_dueno(bookingId, motivo)`, `mover_cita(bookingId,
  nuevaHora)`, `marcar_ausencia(professionalId, desde, hasta)`, `bloquear_franja(desde, hasta,
  motivo)`, `activar_aviso_por_cita(bool)`, `resolver_pendiente(leadId)`.
- Todas las tools de este assistant se definen **una vez** como *shared tools*
  (`client.ai.tools.create`) y se adjuntan por `tool_ids`; no se copian inline por negocio. La
  URL es la misma para todos (`/webhooks/telnyx/tools/:toolName`); el negocio se resuelve por la
  cabecera `X-Alhabla-Owner-Business`, cuyo valor es una variable dinámica del assistant, y se
  valida que la conversación pertenece a ese negocio; misma firma y verificación que hoy.
- **Confirmación**: toda acción destructiva (cancelar, mover, ausencia, bloqueo) la propone el
  assistant en texto y la ejecuta el backend solo cuando el dueño pulsa un botón de confirmación
  que el backend añade a la respuesta. El assistant nunca llama a la tool destructiva
  directamente: llama a `proponer_accion` y el botón la ejecuta.
- **Ambigüedad**: "cancela la de Marta" con dos Martas → lista interactiva con las citas
  candidatas, no texto.
- **Respuesta**: el `content` del assistant se envía como texto (dentro de ventana; el propio
  mensaje del dueño la abrió) y el backend adjunta botones o listas según la tool que se haya
  propuesto.
- El historial del chat se lee por API para mostrarlo en el panel ("Tu chat con la
  recepcionista") y un cuadro de texto en el panel usa el mismo `chat_ai_assistants`
  ("Pregúntale a tu recepcionista"), sin WhatsApp de por medio.

### 6. Modo dueño por voz

- La recepcionista recibe en variables dinámicas `es_dueno` (el número que llama coincide con
  `Business.phone` o `ownerWhatsappNumber`).
- Con `es_dueno`, la instrucción de la recepcionista es una sola: traspasar (`handoff`, voz
  unificada) al asistente de gestión por voz, que es el mismo assistant de §5 pero con
  telefonía activada, o una copia gemela si Telnyx no permite chat y voz sobre el mismo.
- El asistente de gestión abre con dos caminos: "Hola Ana, soy tu recepcionista. ¿Quieres probar
  cómo atiendo a un cliente, o gestionar tu agenda?". **Probar** = traspaso de vuelta a la
  recepcionista con `llamada_de_prueba: true` (§ 12); **gestionar** = tools de dueño.
- Mientras el onboarding no esté completo (sin PIN, sin nada que gestionar) se va directo a
  "probar", sin pregunta.
- Consultas (agenda, cuántas llamadas) sin más. Acciones destructivas: PIN de cuatro cifras que el
  dueño fija en Ajustes, pedido una vez por llamada. Sin STIR/SHAKEN en España, el número que
  llama no es prueba suficiente.

### 7. Post-conversación: `informar_al_negocio`

Se activa `post_conversation_settings.enabled` y se añade a las instrucciones un bloque "Al
terminar la llamada" que llama una sola vez a la tool `informar_al_negocio` con:

```text
resultado: RESOLVED | FRUSTRATED | NO_ANSWER | ESCALATED | LEAD_CAPTURED
motivo_escalada: CLIENTE_LO_PIDIO | FALLO_TECNICO | FUERA_DE_HORARIO | CONSULTA_COMPLEJA | NO_APLICA
fallo_de_tool: boolean
servicio_pedido: nombre del catálogo o null
recado: { nombre, telefono, motivo, quiere_que_le_llamen: boolean } | null
```

- Sustituye a los tres insights custom (`TELNYX_INSIGHT_*`) y al `post_call_analysis_data` de
  Retell como fuente de `Call.outcome`, `escalationReason`, `toolFailureDetected` y
  `requestedService`. Migración con **doble escritura** durante un periodo acordado: se guardan
  ambos, se comparan en un informe, y se retiran los insights cuando la concordancia sea la
  esperada. Retell (fallback) mantiene su mecanismo mientras exista.
- `recado` crea un `Lead` tipo `message` y encola el mensaje #1 del catálogo. Sin recado no hay
  mensaje.
- Es una *shared tool* adjunta a todos los assistants de voz; no una copia por negocio.
- La tool es idempotente por `call_control_id` (una llamada, un informe). Si el post-procesado no
  llega en 5 minutos, `Call` queda sin clasificar y el reconciliador lo marca para revisión, igual
  que hoy con los insights ausentes.

### 8. Memoria entre canales

Decisión del usuario (2026-09-19): memoria para el dueño **y** para los clientes.

- Se activa `dynamic_variables_webhook_url` en la recepcionista. La respuesta solo devuelve
  `memory.conversation_query` y `es_dueno`; no consulta el catálogo ni nada pesado: el objetivo
  es responder en decenas de milisegundos. Si Telnyx no recibe respuesta en 1,5 s, la llamada
  sigue sin memoria (*best effort* documentado). Esto revisa la decisión del plan Telnyx §2 solo
  para este uso mínimo.
- **Aislamiento multi-tenant obligatorio**: la consulta lleva siempre
  `metadata->assistant_id=eq.<assistant de este negocio>` además de
  `metadata->telnyx_end_user_target=eq.<número>`. Un cliente de dos negocios no cruza memorias.
- Cliente: últimas 5 conversaciones con ese negocio. Uso permitido en el prompt: reconocer
  ("Hola María"), proponer lo habitual ("¿como la última vez, corte con Laura?"), no repetir
  preguntas ya contestadas. Prohibido: mencionar datos de salud (fisioterapia) o detalles que el
  cliente no haya dado en esta llamada.
- Dueño: memoria compartida entre su chat de WhatsApp y su voz, filtrada por su número.
- **RGPD**: la memoria es un tratamiento nuevo. Antes de activarla para clientes: actualizar
  `/legal/privacidad` (finalidad, plazo), añadir la frase de retención en el saludo o en la
  primera confirmación, respetar `data_retention` y la purga a 30 días, y ofrecer olvido ("no
  quiero que me recordéis" por voz o `OLVIDAR` por WhatsApp → se excluye ese número de la
  consulta de memoria). Ver `AGENTS.md` § residencia UE (#13-16 siguen abiertos).

### 9. Lado cliente

- `recordatorio_cita_v2` con botones *Confirmo* · *Cancelar* · *Cambiar*. Confirmo marca
  `Booking.confirmedByClientAt`; Cancelar cancela, borra el evento externo, libera el hueco,
  envía el mensaje #3 al dueño y dispara la lista de espera; Cambiar responde con el teléfono del
  negocio ("llámanos y te buscamos otra hora": el cambio sigue siendo por voz en este plan).
- `hueco_libre` (el `WHATSAPP_TEMPLATE_SLOT_AVAILABLE_NAME` que falta): "Se ha liberado el
  jueves a las 12:00 en <negocio>. ¿La quieres?" con *Sí, resérvala* · *Ya no*. Sí reserva
  directamente si el hueco sigue libre (mismo `availabilityToken` que la voz, caducidad 10
  minutos) o responde que ya voló.
- La promesa de la recepcionista se condiciona: la frase "te aviso por WhatsApp si se libera"
  solo entra en el prompt si la plantilla está configurada. Hasta entonces la tool se retira de
  los assistants.
- **Remitente hacia el cliente**: en cuanto el número del negocio esté verificado en WhatsApp
  (§ 13), confirmación, recordatorio y hueco libre salen **desde ese número** (mismo WABA, mismas
  plantillas: no hay que reaprobar nada); si no, desde el de plataforma. Si el cliente llamó por
  WhatsApp, la confirmación cae en el mismo chat desde el que llamó, y la recepcionista lo dice
  ("te la mando a este mismo WhatsApp") en vez de pedir número; el consentimiento por voz se
  pide igual.

### 10. Fallbacks y registro

- Dueño sin WhatsApp (ALTA nunca completado): los mensajes #1, #2 y #5 van por email (ya
  funciona en producción; plantillas nuevas en `emailTemplates.ts`) y por SMS cuando exista
  `TELNYX_SMS_SENDER_ID`. El cierre del día por email es opcional.
- Todo mensaje enviado o recibido queda en `SentMessage` (ya existe) ampliado con dirección,
  canal, `providerMessageId`, `biz_opaque_callback_data`, estado de entrega
  (queued, sent, delivered, read, failed, de `message.sent`/`message.finalized`), `templateName`
  y `costCents` (de `cost.amount`). Hoy esos webhooks llegan y se ignoran.
- Error `131026` (el número no tiene WhatsApp) al enviar a un dueño ⇒ `ownerWhatsappUnreachableAt`,
  fallback a email en el acto y aviso en el panel. Tres `failed` seguidos por otra causa ⇒ igual.
- La calidad del remitente se vigila por webhook (`whatsapp.phone_number.quality_changed`):
  `YELLOW` ⇒ alerta interna y se pausa el aviso por cita opcional; `RED` ⇒ se pausan todos los
  mensajes no críticos (solo #1, #2 y #5) hasta volver a `GREEN`. `whatsapp.account.restricted`
  ⇒ alerta inmediata.

### 11. Panel

- Onboarding: paso nuevo "Avisos por WhatsApp" con QR/enlace; la checklist pasa de 5 a 6 pasos.
- Ajustes › Avisos: número de WhatsApp verificado, hora del cierre del día, aviso por cita
  sí/no, PIN del modo dueño, botón "Dar de baja".
- Inicio: "Citas pendientes de confirmar" muestra el estado de cada una (avisada por WhatsApp,
  resuelta por el dueño, reintentada); desaparece al resolverse.
- Llamadas: el recado aparece como bloque propio en el detalle, con su estado (avisado,
  atendido).
- Nuevo bloque "Tu chat con la recepcionista" con badge «Beta»: historial (por API de
  conversaciones) y cuadro de texto contra `chat_ai_assistants`.
- Ajustes › WhatsApp: estado del número del negocio (sin activar / verificando / activo / error),
  perfil editable (el del modal del onboarding), enlace `wa.me` y QR, y "Copiar mensaje de
  ausencia" para su WhatsApp de siempre. Detalle en `PLAN-WHATSAPP-LLAMADAS.md` § Fase 3.
- Llamadas: chip «WhatsApp» en la lista y en el detalle (`Call.channel`); la llamada de prueba
  del onboarding aparece marcada como tal.

### 12. Onboarding por WhatsApp

Nuevo paso del asistente de alta, **entre el tipo de negocio y los servicios**, como modal a
pantalla completa "Tu recepcionista en WhatsApp". Tres partes, en este orden:

1. **Perfil.** Una tarjeta de contacto tal como la verán los clientes en WhatsApp: nombre
   visible, foto, descripción corta, dirección, categoría, web. Todo prerrellenado desde Google
   Places (nombre, dirección, web, foto principal) y el tipo de negocio (categoría de WhatsApp:
   *Belleza, spa y salón* para peluquería, barbería, uñas y estética; *Salud* para
   fisioterapia). El nombre se sanea según las reglas de Meta (sin emojis, sin mayúsculas
   completas, máximo 25 caracteres) y se avisa si hubo que recortarlo. Se guarda en
   `Business.whatsappProfile` y se aplica al número del negocio cuando exista (§ 13); el dueño
   no vuelve a tocarlo salvo que quiera.
2. **Vincular su WhatsApp.** El «ALTA» de § 2, aquí: QR y enlace `wa.me`. Al recibir el mensaje,
   el modal pasa solo al paso 3 (el panel consulta el estado cada pocos segundos). Sustituye al
   teléfono placeholder y deja el consentimiento de avisos hecho desde el principio; la
   checklist del panel conserva el paso solo para quien lo saltó.
3. **Llámala.** Botón "Llama a tu recepcionista por WhatsApp": abre el chat con el contacto
   "Alhabla" y una indicación de pulsar el icono de llamada (WhatsApp no tiene enlace directo
   para iniciar una llamada). La llamada entra por el **número de plataforma**; como el dueño
   acaba de vincular su WhatsApp, el backend resuelve el negocio **por quien llama**
   (`from` = `ownerWhatsappNumber`) y la atiende **su** recepcionista, con su nombre, su tipo de
   negocio y el horario de Places, en modo prueba (`llamada_de_prueba: true`): atiende como a un
   cliente, y si el catálogo está vacío lo dice con naturalidad ("todavía no tengo tus servicios
   cargados; en cuanto los añadas podré reservar") y toma un recado. Al colgar, el modal muestra
   "Así te atenderé" con el resumen de esa llamada y el botón para seguir a servicios. Se puede
   saltar ("Lo pruebo luego") sin penalización.

Reglas:

- El assistant del negocio existe desde el registro (`createBusinessAgent`), así que la llamada
  de prueba no necesita número comprado, desvío ni tarjeta.
- `handleCallInitiated`: si `to` es el número de plataforma, el negocio se resuelve por `from`
  (dueño vinculado); si ese número pertenece a más de un negocio, se atiende el último en
  onboarding y se ofrece cambiar por voz. Si `from` no es ningún dueño, mensaje corto y cuelgue
  ("este número no atiende llamadas de clientes; llama al negocio").
- La llamada de prueba cuenta como llamada del negocio (`Call.purpose = "onboarding_test"`), se
  muestra en el panel, no cuenta para los minutos del plan, y se limita a 3 por negocio durante
  el alta.
- Prerrequisito técnico: llamadas de WhatsApp activas en el número de plataforma
  (`calling_settings.enabled`) y cartera de Alhabla con límite de mensajería ≥ 2.000 (§ 13). Sin
  eso el paso 3 no se muestra y el modal termina en el paso 2.
- Después del onboarding, ese mismo camino (el dueño llama al contacto "Alhabla") es el modo
  dueño por voz de § 6.

### 13. Llamadas de WhatsApp de clientes: un número por negocio

Lo define `PLAN-WHATSAPP-LLAMADAS.md` (fases 1-4); aquí solo lo que cambia o se decide:

- **Automático tras el pago.** Cuando `provisionPhoneNumber` deja el número del negocio activo,
  el mismo flujo lo registra en el WABA de Alhabla con `Business.whatsappProfile` (nombre visible,
  foto, descripción, dirección, categoría), lo verifica y activa llamadas. Decisión 4 de aquel
  plan: activación automática, no botón en Ajustes (queda el botón solo para reintentar).
- **Verificación por voz.** Un número español no recibe SMS; Meta llama con el código. Mientras
  `whatsappStatus = verification_pending` la llamada entrante al número se transfiere al móvil
  del dueño o el código se captura con transcripción; se decide en la fase 0 (punto 9).
- **Nombre visible.** Meta revisa cada nombre bajo la cartera de Alhabla. Hasta la aprobación el
  cliente ve el número; si lo rechaza, patrón "Peluquería Ana · Alhabla" (piloto en fase 0).
- **Las llamadas no necesitan código nuevo en su ruta**: entran por la misma conexión de voz del
  número (`handleCallInitiated` resuelve el negocio por `to`). Lo nuevo es `Call.channel =
  "whatsapp"` con el criterio que dé la fase 0 y el chip en el panel.
- **Confirmaciones desde el número del negocio** (decisión 2 de aquel plan): sí, en cuanto esté
  verificado; plataforma como respaldo.
- **Escala.** El límite de mensajería es **por cartera** (todos los números lo comparten):
  2.000 destinatarios únicos/24 h al empezar, sube solo con calidad y volumen (10K, 100K). Con
  ~30 mensajes/día por negocio, 2.000 da para unos 60 negocios activos; los mensajes dentro de
  la ventana de 24 h no cuentan. Alerta interna al 70 %. Tope de números por WABA (25, ampliable
  a 120): alerta al 80 % y segundo WABA en la misma cartera cuando haga falta.
- **Copy honesto** en landing, modal y Ajustes: "tus clientes te llaman por WhatsApp al número
  de Alhabla; tu WhatsApp de siempre sigue siendo tuyo y no lo atendemos".

## Cambios de datos

### `Business`

- `ownerWhatsappNumber String?` (E.164, verificado por ALTA), `ownerWhatsappOptInAt`,
  `ownerWhatsappOptOutAt`, `ownerAltaCode String? @unique` (caduca).
- `notificationPrefs Json` (`{ cierreDelDiaHora: "20:30", cierreDelDia: true, avisoPorCita: false,
  canalFallback: "email" }`).
- `ownerPinHash String?` para el modo dueño por voz.
- `memoryEnabledForClients Boolean @default(false)` (se activa tras el trámite RGPD).
- `ownerChatEnabled Boolean @default(true)` (interruptor por negocio del chat Beta).
- `whatsappProfile Json?` (`displayName`, `about`, `description`, `address`, `email`,
  `website`, `vertical`, `photoStorageKey`), rellenado en el modal del onboarding.
- Estado del número del negocio en WhatsApp, tal como lo define `PLAN-WHATSAPP-LLAMADAS.md`
  § Fase 1: `whatsappStatus`, `whatsappDisplayName`, `whatsappPhoneNumberId`, `whatsappWabaId`,
  `whatsappVerificationRequestedAt`, `whatsappCallingEnabledAt`, `whatsappLastError`.

### `Agent`

- `telnyxManagementAssistantId String?` (asistente de gestión) y
  `telnyxManagementConversationId String?`.

### `Call`

- `channel String @default("pstn")` (`pstn | whatsapp`) y `purpose String?`
  (`onboarding_test | owner_voice`), rellenados en `handleCallInitiated`.
- `postCallReport Json?` (lo que devolvió `informar_al_negocio`, tal cual) y
  `postCallReportAt`. `outcome`/`escalationReason`/`toolFailureDetected`/`requestedService`
  siguen siendo las columnas canónicas; durante la doble escritura se rellenan desde ambas
  fuentes y `postCallReport` guarda la de post-conversación.

### `Lead`

- Tipos nuevos: `message` (recado; `data`: nombre, teléfono, motivo, `quiereLlamada`) y
  `client_cancellation`. `notifiedAt`, `notifiedVia` (`whatsapp|email|sms`), `snoozedUntil`.

### `Booking`

- `confirmedByClientAt DateTime?`, `cancelledBy` (`client_voice|client_button|owner_chat|
  owner_voice|system`), `cancelledAt`.

### Nuevas tablas

- `ProfessionalAbsence` (`professionalId`, `startsAt`, `endsAt`, `reason`): `availability.ts`
  excluye al profesional en ese rango; `get_catalog` deja de ofrecerlo.
- `ScheduleBlock` (`businessId`, `startsAt`, `endsAt`, `reason`): resta capacidad como un evento
  externo sin profesional. Sustituye a las excepciones globales de horario para bloqueos
  puntuales; las excepciones de día completo se mantienen.
- `OwnerChatFeedback` (`businessId`, `question`, `answer`, `createdAt`): lo que el dueño marcó
  con `MAL` durante la Beta.
- `InboundMessage` (`providerMessageId @unique`, `fromNumber`, `businessId?`, `kind`
  `button|text|keyword`, `payload`, `handledAt`, `handler`, `error`): idempotencia y trazabilidad
  de todo lo que entra por el webhook de mensajería.
- `WhatsappTemplate` (`key @unique` lógico como `recado_negocio`, `name`, `telnyxTemplateId
  @unique`, `metaTemplateId`, `language`, `category`, `status`, `qualityRating`, `updatedAt`):
  fuente de verdad de qué plantilla usar y si está aprobada, alimentada al crearla por API y por
  los webhooks de estado. Sustituye a las variables `WHATSAPP_TEMPLATE_*_NAME`; las dos actuales
  se importan en la fase 1.

### `SentMessage`

- `providerMessageId`, `direction`, `channel`, `templateName`, `deliveryStatus`,
  `deliveredAt`, `readAt`, `failedAt`, `errorCode`, `costCents`, `callbackData`.

### Idempotencia

- Entrada: `InboundMessage.providerMessageId`.
- Salida: `SentMessage` ya deduplica por clave; cada mensaje del catálogo lleva clave
  `<tipo>:<recursoId>:<día>` para que un reintento del job no duplique.
- Post-conversación: una fila por `call_control_id`.

## Plantillas de WhatsApp a solicitar

Todas de categoría **utility** (las de marketing no aplican y cuestan más; Meta puede
reclasificar una plantilla si le parece promocional, así que el texto es seco y transaccional).
Nombres en `snake_case` como exige Meta; parámetros **nombrados**, igual que las dos ya
aprobadas. Los botones `quick_reply` llevan payload dinámico por envío. Se crean **por API** con
`client.whatsapp.templates.create` desde un script (`scripts/manual/crearPlantillasWhatsapp.mts`)
con valores de ejemplo realistas en `example` (Meta los revisa), y se siguen por los webhooks de
estado en la tabla `WhatsappTemplate`. Todas a la vez: la aprobación es de días y es el cuello de
botella de la fase 1.

| Plantilla | Destinatario | Cuerpo propuesto | Botones |
|---|---|---|---|
| `recado_negocio` | Dueño | "Recado en {{negocio_nombre}}: {{cliente_nombre}} ({{cliente_telefono}}). {{motivo}}" | *Atendido* · *Recuérdamelo mañana* |
| `cita_pendiente_negocio` | Dueño | "{{cliente_nombre}}, {{fecha_cita}} a las {{hora_cita}} ({{servicios}}) no entró en tu calendario: {{motivo}}." | *La apunté yo* · *Reintentar* · *Reconectar* |
| `cancelacion_negocio` | Dueño | "{{cliente_nombre}} canceló su cita del {{fecha_cita}} a las {{hora_cita}} ({{servicios}}) en {{negocio_nombre}}. El hueco queda libre." | *Avisar a quien esperaba* · *Vale* |
| `cierre_del_dia` | Dueño | "Hoy en {{negocio_nombre}}: {{llamadas}} llamadas, {{citas}} citas, {{recados}} recados. Mañana: {{citas_manana}} citas, la primera a las {{primera_hora}}." | *Ver mañana* · *Silenciar hoy* |
| `alerta_operativa_negocio` | Dueño | "Aviso de Alhabla para {{negocio_nombre}}: {{texto}}." | *Ir a Ajustes* (URL con sufijo dinámico: `/ajustes/{{1}}`) |
| `recordatorio_cita_v2` | Cliente | Igual que `recordatorio_cita` + "¿Mantienes la cita?" | *Confirmo* · *Cancelar* · *Cambiar* |
| `hueco_libre` | Cliente | "Se ha liberado el {{fecha_cita}} a las {{hora_cita}} en {{negocio_nombre}}. ¿La quieres?" | *Sí, resérvala* · *Ya no* |
| `alta_confirmada` | Dueño | Solo si la primera respuesta al ALTA cayera fuera de ventana (no debería): "Ya recibes los avisos de {{negocio_nombre}} aquí." | — |

Las dos plantillas actuales (`confirmacion_cita`, `recordatorio_cita`) siguen válidas;
`recordatorio_cita` se retira cuando `recordatorio_cita_v2` esté aprobada.

## Escalera de planes

| Plan | Incluye |
|---|---|
| Todos (Beta) | Chat con la recepcionista **mientras sea Beta** (después, Pro) |
| Inicio | Alta por WhatsApp, onboarding con llamada de prueba, mensajes #1, #2, #3 y #5, cierre del día, recordatorio con botones al cliente, lista de espera, **llamadas de clientes por WhatsApp** y confirmaciones desde el número del negocio |
| Pro | Todo lo anterior + chat bidireccional fuera de Beta, aviso por cita opcional, memoria de clientes, historial y chat en el panel |
| Scale | Todo lo anterior + modo dueño por voz. Sustituye a la promesa vacía de «varios números por sede (próximamente)», que se retira de `plans.ts` |

El *gating* se hace en `planFeatures.ts` (`chat_dueno_beta` → `chat_dueno`, `memoria_clientes`,
`modo_dueno_voz`) como el resto de features. Las llamadas de WhatsApp de clientes no se
diferencian por plan: son la segunda puerta del producto, no un extra.

## Seguridad y cumplimiento

- Consentimiento del dueño explícito y fechado (ALTA); baja inmediata con STOP/BAJA; nada se
  envía sin `ownerWhatsappOptInAt` y con `ownerWhatsappOptOutAt` nulo.
- Consentimiento del cliente: el `smsConsent` por voz ya existente cubre confirmación,
  recordatorio y hueco libre; los botones no piden más datos.
- Webhook de mensajería con la misma verificación de firma Ed25519 que los de voz, `rawBody` y
  ventana de timestamp; idempotencia por `providerMessageId`.
- Botones: el payload lleva el id del recurso y se valida que pertenece al negocio del remitente
  antes de actuar; un payload de otro negocio se ignora y se loguea.
- Asistente de gestión: tools de dueño con cabecera de negocio validada; acciones destructivas
  siempre por botón de confirmación generado por el backend, nunca por decisión del LLM.
- Modo dueño por voz: PIN para acciones destructivas; lectura sin PIN.
- Memoria: consulta siempre acotada a `assistant_id` del negocio; olvido bajo petición; purga
  coordinada con `RECORDING_RETENTION_DAYS`.
- Mensajes a un número desconocido: una única respuesta fija por día y número, para no convertir
  el remitente en un canal abierto.

## Fases

### Fase 0 — Validación (sin código de producto)

0. Subir `telnyx` a ≥ 7.21 y comprobar en un script que `client.messages.sendWhatsapp`,
   `client.whatsapp.templates.list`, `client.ai.assistants.chat` y `client.ai.tools.create`
   existen con la firma de la skill. Suscribir el WABA a `message_template_status_update` y
   `phone_number_quality_update` (`businessAccounts.settings.update`) apuntando a
   `/webhooks/telnyx`.
1. Enviar un mensaje de prueba desde un móvil al remitente y comprobar **qué llega y dónde**
   (`/webhooks/telnyx`, forma exacta de `message.received` para texto, botón interactivo y botón
   de plantilla: el SDK no la documenta). Documentar el payload real en `AGENTS.md`.
2. Enviar un `confirmacion_cita` real a un número propio por `template_id` y confirmar entrega,
   `message.finalized` con `read` y `cost.amount`. Hoy no hay evidencia de una entrega de
   extremo a extremo.
3. Crear las ocho plantillas de la tabla con el script y verlas llegar a `PENDING` en
   `client.whatsapp.templates.list`; anotar fecha. El webhook de aprobación se prueba con la
   primera que apruebe Meta.
4. Probar `client.ai.assistants.chat` (beta) con un assistant de prueba que tenga una *shared
   tool* webhook adjunta por `tool_ids`: confirmar que ejecuta la tool, cómo llega la firma, qué
   devuelve cuando la tool falla y si `conversation_id` mantiene el contexto entre llamadas
   separadas por horas.
5. Activar `post_conversation_settings` en un assistant de dev con una tool `informar_al_negocio`
   de prueba y hacer tres llamadas: con recado, sin recado, con fallo de tool. Medir cuánto tarda
   en llegar tras colgar.
6. Activar `dynamic_variables_webhook_url` en ese assistant devolviendo solo
   `memory.conversation_query`, y verificar en dos llamadas seguidas desde el mismo número que la
   segunda recuerda la primera, y que desde otro assistant **no** la recuerda.
7. Confirmar con Telnyx (#13-16 siguen abiertos) si el chat por API y la memoria tienen residencia
   UE.
8. **Cartera de Alhabla en Meta**: comprobar en WhatsApp Manager el límite de mensajería y el
   estado de la verificación de empresa. Si no está en ≥ 2.000, completar Meta Business
   Verification y la aprobación del nombre visible «Alhabla». **Lo hace el usuario; sin esto no
   hay llamadas de WhatsApp, ni de prueba ni de clientes.** (Es el punto 2 de la fase 0 de
   `PLAN-WHATSAPP-LLAMADAS.md`.)
9. Activar llamadas en el número de plataforma (`calling_settings {enabled: true}`), apuntar su
   conexión de voz al Call Control App y hacer una **llamada real de WhatsApp** desde el móvil
   del usuario: guardar el `call.initiated` completo (cómo se distingue WhatsApp de PSTN, formato
   de `from`), calidad de audio, coste. Con ese `from`, probar el enrutado por quien llama.
10. Registrar un número Telnyx de pruebas en el WABA con verificación **por voz** y un nombre
    visible de negocio real ("Peluquería X"): ver cómo llega la llamada del código y si Meta
    aprueba el nombre bajo nuestra cartera. Si lo rechaza, probar "Peluquería X · Alhabla".
    (Puntos 5 y 6 de la fase 0 de aquel plan.)

**Criterio de salida:** payloads reales documentados, plantillas solicitadas, los puntos 4-6 con
resultado escrito, la cartera en ≥ 2.000, y una llamada de WhatsApp real atendida por un
assistant. Sin lo primero no se abre la fase 1; sin lo último, la fase 1 se hace sin el paso 3
del modal y la fase 3 espera.

### Fase 1 — Tapar la fuga

- `WhatsAppAdapter.ts` sobre el SDK; tabla `WhatsappTemplate` con las dos plantillas actuales
  importadas y el webhook de estado; `SentMessage` con entrega y coste.
- Alta por ALTA (QR/enlace, código, opt-in/opt-out) y Ajustes › Avisos.
- **Modal "Tu recepcionista en WhatsApp"** en el asistente de alta (§ 12): perfil prerrellenado
  de Places, vinculación por ALTA con avance automático, y llamada de prueba al número de
  plataforma enrutada por quien llama con `llamada_de_prueba`. `Call.channel` y `Call.purpose`.
  La checklist del panel mantiene el paso de ALTA para quien lo saltó.
- Webhook de mensajería: idempotencia, identificación del remitente, STOP/ALTA, botones.
- `informar_al_negocio` en post-conversación con doble escritura frente a los insights; `Lead`
  tipo `message`; mensaje #1 con sus dos botones.
- Mensajes #2 (cita pendiente, con *La apunté yo* creando la reserva local) y #3 (cancelación).
- Cierre del día: job en Cloud Scheduler cada 15 minutos que envía a los negocios cuya hora
  configurada haya llegado; `SentMessage` con clave por día.
- Fallback por email de #1, #2 y #5 para dueños sin alta.
- Retirar `notify_when_available` y su frase del prompt mientras no exista `hueco_libre`.
- Tests: unitarios del enrutado del webhook, del informe post-llamada y de la idempotencia;
  integración contra Postgres real de los tres mensajes y sus botones.

**Criterio de salida:** un alta nueva vincula su WhatsApp en el modal, llama a su recepcionista
por WhatsApp antes de pagar y la oye con el nombre de su negocio; y en una llamada real a una
cuenta de producción sin clientes, el recado llega al WhatsApp del dueño con botones, *Atendido*
lo resuelve y el panel lo refleja.

### Fase 2 — Darle manos (chat Beta)

- Asistente de gestión por negocio (creación en `createBusinessAgent`, sincronización con
  `syncAgentToTelnyx`, reconciliador).
- Tools de dueño: `listar_agenda`, `cancelar_cita_dueno`, `mover_cita`, `marcar_ausencia`,
  `bloquear_franja`, `resolver_pendiente`, `activar_aviso_por_cita`; `proponer_accion` con botón
  de confirmación.
- `ProfessionalAbsence` y `ScheduleBlock` en `availability.ts` y `get_catalog`.
- Nivel 1 de palabras clave y nivel 2 por `chat_ai_assistants`; listas para ambigüedad.
- Panel: historial del chat y "Pregúntale a tu recepcionista", ambos con badge «Beta».
- Etiqueta Beta en las respuestas del nivel 2, `AYUDA`, `MAL` → `OwnerChatFeedback`, límite
  diario, interruptor por negocio. Disponible para todos los planes (`chat_dueno_beta`).

**Criterio de salida:** "Laura no viene el viernes" por WhatsApp deja a Laura fuera de la
disponibilidad del viernes y la recepcionista no le asigna citas ese día; "cancela la de Marta de
las 5" pide confirmación con botón y cancela.

### Fase 3 — El número del negocio en WhatsApp

Ejecuta las fases 1, 2 y 4 de `PLAN-WHATSAPP-LLAMADAS.md` con las decisiones de § 13:

- Registro automático del número tras `provisionPhoneNumber`, con `Business.whatsappProfile`;
  verificación por voz con el mecanismo elegido en la fase 0.10; activación de llamadas.
  Máquina de estados idempotente con lock, reanudable, con `whatsappLastError` legible.
- `Call.channel = "whatsapp"` en llamadas de clientes; chip y filtro en el panel; analítica por
  canal (Scale).
- Confirmación, recordatorio y hueco libre desde el número del negocio; plataforma de respaldo.
  Variable `canal_llamada` en el prompt ("te la mando a este mismo WhatsApp").
- Ajustes › WhatsApp: estado, perfil, `wa.me`, QR, mensaje de ausencia para su WhatsApp de
  siempre. Copy en landing, seis nichos y FAQ.
- Job `whatsapp-reconciler` diario; alertas de tope de números y de límite de cartera; baja del
  número en el WABA al liberar el número.
- `WHATSAPP_CALLING_ROLLOUT=off|manual|all`: `manual` primero (botón en Ajustes), `all` cuando
  el reconciliador y las alertas estén.

**Criterio de salida:** un negocio real completa el alta, paga, y en menos de 15 minutos su número
aparece en WhatsApp con su nombre y su foto; un cliente lo llama por WhatsApp, reserva, y la
confirmación le llega en ese chat desde el nombre del negocio.

### Fase 4 — Rematar

- `recordatorio_cita_v2` con botones; `hueco_libre` y reactivación de `notify_when_available`.
- Memoria: primero dueño (sin trámite), después clientes tras actualizar privacidad y añadir
  `OLVIDAR`.
- Retirada de los insights custom cuando la doble escritura concuerde.
- Modo dueño por voz (`handoff` + PIN) con los dos caminos de § 6. Gating Scale.
- Salida de Beta del chat cuando `OwnerChatFeedback` y el uso lo justifiquen: quitar etiqueta,
  pasar a `chat_dueno` (Pro).
- Actualizar `plans.ts`, las seis landings y `PRODUCT.md` con lo que ahora es real; retirar
  «varios números por sede».

**Criterio de salida:** un cliente cancela desde el recordatorio, el dueño recibe el aviso, pulsa
*Avisar a quien esperaba*, y el cliente en lista de espera reserva el hueco con un botón. Todo
sin abrir el panel.

## Variables de entorno previstas

```text
WHATSAPP_WABA_ID                        # UUID Telnyx del WABA (plantillas, ajustes, números)
OWNER_ALTA_CODE_TTL_HOURS=72
OWNER_DIGEST_DEFAULT_TIME=20:30
TELNYX_MEMORY_ENABLED=false             # kill switch de la memoria (dueño y clientes)
TELNYX_POST_CONVERSATION_ENABLED=false  # kill switch del informe post-llamada
TELNYX_OWNER_CHAT_ENABLED=false         # kill switch del nivel 2 (chat Beta)
WHATSAPP_PLATFORM_CALLING_ENABLED=false # muestra el paso 3 del modal (llamada de prueba)
WHATSAPP_CALLING_ROLLOUT=off            # off | manual | all — número del negocio en WhatsApp
```

Las plantillas dejan de ser variables de entorno: viven en `WhatsappTemplate` con su estado
real. `WHATSAPP_TEMPLATE_CONFIRMATION_NAME` y `WHATSAPP_TEMPLATE_REMINDER_NAME` se retiran en la
fase 1 tras importarlas. Los IDs del asistente de gestión, de las *shared tools* y de la
conversación del dueño tampoco son variables de entorno: van por `Agent`/`Business` en
PostgreSQL, como los assistants de voz.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Meta tarda en aprobar plantillas o rechaza alguna | Solicitar las ocho en fase 0; los mensajes con ventana abierta no dependen de plantilla; fallback por email |
| El post-procesado no llega o llega tarde | Doble escritura con insights hasta medir; reconciliador marca llamadas sin informe |
| El LLM del asistente de gestión ejecuta algo que no debía | Ninguna tool destructiva es invocable por el LLM; solo `proponer_accion` + botón |
| Memoria cruza tenants | Consulta siempre con `assistant_id`; test de integración con dos negocios y un mismo número |
| Coste por mensaje se dispara | Cierre del día en vez de aviso por cita; ventana de 24 h gratis; contador mensual por negocio en `SentMessage` con alerta interna a 200 mensajes |
| El dueño no completa el ALTA | El onboarding lo pide; el resumen semanal por email lo recuerda; fallback por email sin degradar el producto |
| Calidad del número de WhatsApp baja por bajas mal gestionadas | STOP determinista y probado; no reenviar tras opt-out; monitor de recibos |
| El número español impide algo del lado de WhatsApp que hoy no sabemos | Fase 0.1 y 0.2 antes de escribir código |
| `assistants.chat` es beta y cambia o desaparece | Kill switch `TELNYX_OWNER_CHAT_ENABLED`; el enrutado y los botones no dependen de él; sustituto propio con las mismas tools |
| Meta reclasifica una plantilla `UTILITY` a `MARKETING` | Texto transaccional sin adjetivos; el webhook de estado y `WhatsappTemplate.category` lo detectan y se corrige el texto |
| Las tools inline actuales quedan sin soporte antes de migrarlas | Solo las tools nuevas van como compartidas en este plan; se abre un issue aparte para migrar las cinco de voz |
| La cartera de Alhabla no llega a 2.000 de límite de mensajería | Bloquea la llamada de prueba y las de clientes, no el resto del plan; verificación de empresa con Meta es el primer trámite (fase 0.8) |
| Meta rechaza "Peluquería Ana" como nombre visible bajo la cartera de Alhabla | Piloto en fase 0.10; patrón "Peluquería Ana · Alhabla"; hasta la aprobación el cliente ve el número |
| La llamada de verificación de Meta la contesta la recepcionista y el código se pierde | Modo verificación (transferencia al móvil del dueño) o captura por transcripción; se decide en fase 0.10 |
| Un mal negocio baja la calidad de toda la cartera (límite compartido) | Solo plantillas de utilidad; webhook de calidad; pausa por negocio antes que por plataforma |
| El dueño espera que su WhatsApp actual quede atendido | Copy honesto en landing, modal y Ajustes; nunca se promete |
| El chat Beta responde mal y el dueño pierde confianza | Etiqueta, `MAL` con registro, límite diario, acciones solo por botón, apagado por negocio |
| La llamada de prueba llega antes de que existan servicios y decepciona | Modo prueba explícito en el prompt: dice lo que falta y toma recado; el modal lo anticipa ("aún sin servicios") |

## Preguntas abiertas

1. ¿El chat por API y la memoria cumplen residencia UE? (Issues #13-16, sin respuesta escrita.)
2. ¿Puede un mismo assistant Telnyx usarse por `chat` y por voz a la vez, o el modo dueño por
   voz exige un gemelo? Se resuelve en fase 0.4.
3. ¿Qué límite de botones acepta Meta en una plantilla *utility* con tres `quick_reply`? Si son
   dos, `cita_pendiente_negocio` pierde *Reconectar* y pasa a URL. Se resuelve al crearla por
   API en la fase 0.3: Meta la rechaza o la acepta.
5. ¿Con qué forma llega a `message.received` una respuesta de botón de WhatsApp (id del botón,
   `context` del mensaje original)? El SDK no lo documenta; fase 0.1.
6. ¿Puede una *shared tool* llevar una cabecera cuyo valor sea una variable dinámica distinta por
   assistant? Si no, el negocio se resuelve por `conversation_id` en el backend.
7. ¿Cómo se distingue en `call.initiated` una llamada de WhatsApp de una PSTN (`connection_id`
   de la WhatsApp Calling connection, cabecera SIP, formato de `from`)? Fase 0.9.
8. ¿Un dueño con dos negocios en la misma cuenta de WhatsApp? Hoy: se atiende el último en
   onboarding y se ofrece cambiar por voz. Confirmar si merece un menú.

## Decisiones que necesita el usuario

1. Chat Beta para **todos los planes** mientras sea Beta (propuesto) o solo Pro desde el
   principio.
2. Patrón de nombre visible si Meta rechaza el nombre del negocio a secas ("Peluquería Ana ·
   Alhabla" propuesto).
3. Si la llamada de prueba del onboarding debe existir aunque la cartera no llegue a 2.000
   (entonces el paso 3 del modal se oculta y el "guau" se pospone al primer desvío) o si se
   bloquea el lanzamiento del modal hasta tenerlo.
4. Completar la verificación de empresa de Alhabla en Meta (WhatsApp Manager) — trámite que solo
   puede hacer el titular de la cartera.
4. Tarifa exacta por mensaje *utility* en España vía Telnyx (Meta + margen), para fijar el umbral
   de alerta de coste.

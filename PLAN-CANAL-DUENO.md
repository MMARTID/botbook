# Plan: el canal con el dueño del negocio es WhatsApp bidireccional

## Decisión de producto

**La recepcionista también le escribe a su jefe.** La parte del producto que comunica con el
propietario del negocio se resuelve con WhatsApp bidireccional a través del WABA de Telnyx ya
conectado, con el panel como archivo y el email como registro. Ni segundo número por cuenta, ni
notificaciones push, ni WhatsApp por negocio.

Decisión tomada el 2026-09-19 sobre el diagnóstico de la auditoría de producto de ese día: el
bucle técnico (llamada → cita en calendario → panel → factura) está cerrado y verificado en
producción, pero el dueño está fuera de él: nadie le avisa de lo que pasa, no puede actuar sobre
lo que ve, y la recepcionista promete cosas que no ocurren.

| Alternativa | Por qué se descarta |
|---|---|
| Segundo número Telnyx por cuenta ("línea del dueño") | La numeración geográfica española es *voice-only* de forma estructural (error 40323, ver `AGENTS.md` § send-sms): un segundo número tampoco podría mensajear. Lo único que aportaría, una línea de administración por voz, se consigue reconociendo el número del negocio en la misma línea. |
| Un WhatsApp Business por negocio | Verificación de Meta negocio a negocio, plantillas por negocio, calidad de número por negocio. Inviable para una peluquería. Un solo remitente de Alhabla con el nombre del negocio dentro del mensaje. |
| Web Push desde el panel | Técnicamente posible (también en iPhone si añaden la app al inicio), pero frágil para este público: permisos, instalación, silenciado sin querer. Queda como capa opcional futura, nunca como columna vertebral. |
| Esperar al Alphanumeric Sender ID de SMS | Sigue pendiente de la CNMC y es unidireccional. Pasa a ser *fallback* para el dueño sin WhatsApp, no la vía principal. |
| Llamadas salientes de la recepcionista (recordatorio por voz, llamar al dueño si no reacciona) | Telnyx lo permite (eventos programados `phone_call`), pero **el usuario lo descartó el 2026-09-19**: nada de llamadas salientes. Se anota como idea; no forma parte de este plan. |

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

## Límites explícitos

- **Sin llamadas salientes.** Ni recordatorios por voz, ni llamar al dueño. Decisión del usuario.
- Sin segundo número, sin WABA por negocio, sin Web Push en este plan.
- Un solo remitente de WhatsApp para toda Alhabla (`WHATSAPP_TELNYX_FROM_NUMBER`). Los mensajes
  llevan siempre el nombre del negocio.
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

### 5. Asistente de gestión (chat del dueño)

Un assistant Telnyx **distinto** de la recepcionista, uno por negocio, sin telefonía ni
mensajería activadas (solo se usa por `chat_ai_assistants`): `alhabla-gestion-<businessId>`.

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
- Nuevo bloque "Tu chat con la recepcionista": historial (por API de conversaciones) y cuadro
  de texto contra `chat_ai_assistants`.

## Cambios de datos

### `Business`

- `ownerWhatsappNumber String?` (E.164, verificado por ALTA), `ownerWhatsappOptInAt`,
  `ownerWhatsappOptOutAt`, `ownerAltaCode String? @unique` (caduca).
- `notificationPrefs Json` (`{ cierreDelDiaHora: "20:30", cierreDelDia: true, avisoPorCita: false,
  canalFallback: "email" }`).
- `ownerPinHash String?` para el modo dueño por voz.
- `memoryEnabledForClients Boolean @default(false)` (se activa tras el trámite RGPD).

### `Agent`

- `telnyxManagementAssistantId String?` (asistente de gestión) y
  `telnyxManagementConversationId String?`.

### `Call`

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
| Inicio | Alta por WhatsApp, mensajes #1, #2, #3 y #5, cierre del día, recordatorio con botones al cliente, lista de espera |
| Pro | Todo lo anterior + chat bidireccional (asistente de gestión), aviso por cita opcional, memoria de clientes, historial y chat en el panel |
| Scale | Todo lo anterior + modo dueño por voz. Sustituye a la promesa vacía de «varios números por sede (próximamente)», que se retira de `plans.ts` |

El *gating* se hace en `planFeatures.ts` (`chat_dueno`, `memoria_clientes`, `modo_dueno_voz`)
como el resto de features.

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

**Criterio de salida:** payloads reales documentados, plantillas solicitadas, y los puntos 4-6
con resultado escrito. Sin esto no se abre la fase 1.

### Fase 1 — Tapar la fuga

- `WhatsAppAdapter.ts` sobre el SDK; tabla `WhatsappTemplate` con las dos plantillas actuales
  importadas y el webhook de estado; `SentMessage` con entrega y coste.
- Alta por ALTA (QR/enlace, código, opt-in/opt-out), paso nuevo del onboarding, Ajustes › Avisos.
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

**Criterio de salida:** en una llamada real a una cuenta de producción sin clientes, el recado
llega al WhatsApp del dueño con botones, *Atendido* lo resuelve y el panel lo refleja.

### Fase 2 — Darle manos

- Asistente de gestión por negocio (creación en `createBusinessAgent`, sincronización con
  `syncAgentToTelnyx`, reconciliador).
- Tools de dueño: `listar_agenda`, `cancelar_cita_dueno`, `mover_cita`, `marcar_ausencia`,
  `bloquear_franja`, `resolver_pendiente`, `activar_aviso_por_cita`; `proponer_accion` con botón
  de confirmación.
- `ProfessionalAbsence` y `ScheduleBlock` en `availability.ts` y `get_catalog`.
- Nivel 1 de palabras clave y nivel 2 por `chat_ai_assistants`; listas para ambigüedad.
- Panel: historial del chat y "Pregúntale a tu recepcionista".
- Gating Pro.

**Criterio de salida:** "Laura no viene el viernes" por WhatsApp deja a Laura fuera de la
disponibilidad del viernes y la recepcionista no le asigna citas ese día; "cancela la de Marta de
las 5" pide confirmación con botón y cancela.

### Fase 3 — Rematar

- `recordatorio_cita_v2` con botones; `hueco_libre` y reactivación de `notify_when_available`.
- Memoria: primero dueño (sin trámite), después clientes tras actualizar privacidad y añadir
  `OLVIDAR`.
- Retirada de los insights custom cuando la doble escritura concuerde.
- Modo dueño por voz (`handoff` + PIN). Gating Scale.
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
TELNYX_OWNER_CHAT_ENABLED=false         # kill switch del nivel 2 (chat beta)
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
4. Tarifa exacta por mensaje *utility* en España vía Telnyx (Meta + margen), para fijar el umbral
   de alerta de coste.

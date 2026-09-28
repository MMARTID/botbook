# Plan: Telnyx Voice AI por negocio, con Retell como fallback caliente

## Decisión de arquitectura

**Alhabla tendrá un assistant Telnyx por cada `Agent` de negocio, igual que hoy tiene un agente
Retell por negocio.** No se usarán assistants compartidos por nicho en producción.

La alternativa compartida sigue siendo útil para demos o flujos idénticos, pero no para el producto
multi-tenant de Alhabla:

| Criterio | Compartido por nicho | Uno por negocio | Decisión |
|---|---|---|---|
| Prompt, tono, datos y edición manual | Hay que inyectarlos en cada llamada; un fallo deja variables sin resolver | Se guardan como configuración estable del assistant | Por negocio |
| Idioma, STT, voz, privacidad y límites | No están documentados como variables dinámicas | Se configuran de forma nativa por assistant | Por negocio |
| Latencia y disponibilidad | Depende de un webhook dinámico que Telnyx recomienda responder en menos de 1 s | La llamada no depende de consultar Redis/BD para renderizar el prompt | Por negocio |
| Aislamiento multi-tenant | Requiere demostrar que todas las variables, tools y memoria están segregadas | Assistant, configuración, conversaciones e IDs separados por tenant | Por negocio |
| Blast radius de una actualización | Un error afecta a todos los negocios del nicho | El cambio afecta solo al negocio actualizado | Por negocio |
| Operación | Menos recursos remotos | Más recursos, sincronización y reconciliación | Se acepta el coste operativo |
| Precio | El precio publicado es por minuto/componentes, no por assistant inactivo | Mismo modelo de consumo; confirmar cuota y condiciones con Telnyx | Sin coste fijo asumido |

Telnyx recomienda variables dinámicas para personalización, pero también limita el webhook a una
respuesta muy rápida y solo documenta templating en instrucciones, saludo y tools. No es una base
sólida para materializar por llamada la configuración completa de un negocio. [Dynamic
Variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables), [API de
assistants](https://developers.telnyx.com/api-reference/assistants/update-an-assistant)

## Objetivo

1. Telnyx AI Assistants será el orquestador principal de los negocios elegibles.
2. Al crear una cuenta se crearán y mantendrán siempre **dos recursos por agente**: assistant
   Telnyx primario y agente/LLM Retell de fallback caliente.
3. Retell toma las llamadas nuevas automáticamente cuando Telnyx AI/Inference esté degradado y
   recibe failback cuando se recupere.
4. Mantener paridad funcional: saludo, catálogo, disponibilidad, reserva, reserva pendiente,
   resumen, outcome, grabación, transcripción, SMS y cuelgue.
5. Exigir residencia UE demostrable para toda la cadena de tratamiento antes de tráfico real.

## Límites explícitos

- El failover protege una degradación de **Telnyx AI/Inference** mientras la red y control de
  Telnyx sigan operativos. No protege una caída completa de Telnyx como carrier/SIP: el número
  reside allí y cambiar su `connection_id` dependería igualmente de Telnyx. Esa redundancia exige
  un segundo carrier o portabilidad y queda fuera de alcance.
- Una llamada ya iniciada no se migra entre Telnyx y Retell. El cambio de ruta solo afecta llamadas
  nuevas.
- **Un solo Mission Control Portal / cuenta Telnyx para todo** (confirmado en vivo 2026-09-12):
  no hay una cuenta o proyecto Telnyx separado por entorno. El Call Control App de plataforma es
  un único recurso (`3046870077287696179`) compartido entre desarrollo y producción, y su
  `webhook_event_url` solo puede apuntar a un backend a la vez. Consecuencia real: apuntarlo a
  producción (`api.alhabla.ai`) rompe las llamadas de prueba a los negocios de desarrollo (que
  solo existen en la base de datos local) sin ningún error visible del lado de Telnyx — el
  negocio simplemente "no existe" para el webhook que sí recibe el evento. Y al revés: apuntarlo
  a un túnel de desarrollo (ngrok) deja producción sin recibir llamadas reales aunque el número
  de un cliente real ya esté enrutado allí. **No se puede probar contra desarrollo y tener
  producción operativa a la vez con un solo Call Control App.** Antes de la Fase 5 real hay que
  decidir una de estas soluciones.

  **RESUELTO: se implementó la opción 1.** Hay dos Call Control Apps en la cuenta, cada uno con su
  propio `webhook_event_url`, y cada número apunta al suyo por `connection_id`:

  | App | id | webhook |
  |---|---|---|
  | `alhabla-platform-production` | `3048374727065208187` | `https://api.alhabla.ai/webhooks/telnyx` |
  | `alhabla-platform` (desarrollo) | `3046870077287696179` | `https://dev-api.alhabla.ai/webhooks/telnyx` |

  Ya **no** hay que repuntar ningún webhook a mano antes de una prueba: desarrollo y producción
  reciben eventos a la vez, cada uno en el suyo. `TELNYX_CALL_CONTROL_APP_ID` selecciona el que usa
  cada entorno (producción lo lleva en Cloud Run, desarrollo en `.env`). Y desde el 2026-09-19 el
  webhook de desarrollo tampoco caduca: el túnel de Cloudflare da un hostname fijo, en vez del
  subdominio rotatorio de ngrok que obligaba a reescribirlo en cada reinicio del contenedor.

  Lo que sigue pendiente de la separación dev/prod es más arriba en la cadena: **la cuenta de
  Telnyx (y la de Retell) es la misma**, así que el inventario de números y los scripts que
  recorren la cuenta no distinguen entorno. Ver AGENTS.md § Re-syncing webhook URLs.
- No se habilita memoria nativa de Telnyx entre conversaciones. Alhabla conserva los datos
  maestros e historial en sus propios servicios.

## Estado actual relevante

- La compra y número español ya se resuelven con Telnyx en
  `backend/src/modules/phone/service.ts`; el número se importa después en Retell mediante el SIP
  trunk de plataforma.
- Hoy `Business.orchestrator` es `retell`, `createBusinessAgent()` crea un Retell LLM + agent y
  `syncAgentToRetell()` actualiza prompt, análisis y tools.
- `executeVoiceTool(businessId, toolName, params, callId)` ya concentra la lógica de catálogo,
  disponibilidad y reserva de forma neutral al proveedor.
- `Call.vapiCallId` funciona de facto como ID genérico de proveedor, pero faltan proveedor y
  conversación Telnyx explícitos.

## Diseño destino

### 1. Ciclo de vida dual por negocio

Al registrar un negocio:

1. Se crea el registro `Agent` de Alhabla.
2. Se crea el LLM y agent de **Retell**, incluso si el primary será Telnyx.
3. Se crea el **assistant Telnyx** del mismo `Agent` con su configuración completa y se persiste
   su ID.
4. Solo si ambas creaciones y sus tools se confirman, el negocio puede pasar a estado
   `telnyx` elegible. Si falla Telnyx, el negocio sigue plenamente operativo en Retell; si falla
   Retell, no se activa Telnyx primary hasta disponer del fallback.
5. La compra/importación de número lo conecta inicialmente al Call Control App Telnyx cuando la
   ruta sea `telnyx`, y al SIP trunk de Retell cuando la ruta sea `retell`.

Para cuentas existentes, una migración idempotente crea los assistants Telnyx faltantes sin tocar
la ruta de las llamadas. Solo las cuentas seleccionadas en el rollout cambian de primary.

### 2. Configuración de un assistant Telnyx

Cada assistant contiene la configuración real de su negocio, no una plantilla con datos del tenant:

- `name`: identificador seguro y estable `alhabla-<businessId>-<agentId>`.
- `instructions`: prompt gestionado completo de `managedAgentPrompt.ts`, o prompt manual si el
  usuario editó ese agente. Incluye nicho, horario, tono, objetivo, estilo, escalado y
  restricciones de reserva.
- `greeting`, modelo, interrupciones, silencios, duración máxima, supresión de ruido y voz.
- STT, idioma(s), palabras clave de servicios/profesionales y configuración de privacidad.
- Webhook tools y HangupTool. Las tools no contienen datos del negocio controlables por el LLM.
- Insight group común de plataforma con plantillas genéricas; los resultados se atribuyen al
  negocio por el `providerCallId` persistido, nunca por un valor que devuelva el modelo.

El assistant puede usar variables de sistema de Telnyx (`call_control_id`, número del llamante y
hora) para detalles de llamada, pero **no tendrá `dynamic_variables_webhook_url` como requisito
del flujo normal**. Eso elimina el punto de fallo y latencia del renderizado de configuración por
llamada. Un webhook dinámico futuro solo se permitirá para un dato estrictamente opcional y con
fallback seguro.

### 3. Idiomas y voces

La elegibilidad Telnyx se calcula por configuración de cada negocio; no se fuerza una sola
configuración para todos.

- **`azure/fast` probado y descartado (2026-09-12):** se intentó como alternativa a `deepgram/nova-3`
  por tener control de `region` (relevante para residencia UE) y por confirmar Microsoft soporte de
  catalán en "Fast transcription". Resultado real: el assistant contesta la llamada pero **no
  procesa audio en absoluto** — silencio total incluso hablando repetidas veces, sin ningún evento
  de conversación ni error de Telnyx. Probado con `language: "auto"` y con `language: "es-ES"`
  (locale real de Azure), mismo resultado en ambos casos. Mismo patrón que el bloqueo del modelo de
  tests nativos (issue #18 de GitHub): la API acepta la configuración al guardar, pero no funciona
  en tiempo real. Pregunta enviada a Telnyx (issue #19). **No usar `azure/fast` (ni `google/*`,
  mismo problema: proveedor externo, exige tu propia API key registrada como Integration Secret)
  en ningún assistant real hasta dar de alta esa clave y volver a probar con una llamada real.**
  Detalle completo (por qué falla, cómo se confirmó) en Second-Brain, Bitácora § STT: proveedores
  nativos vs externos. Las 5 cuentas dev cambiaron su modelo por defecto a **`deepgram/flux`**
  (decisión del usuario 2026-09-12, mejor detección de turno de palabra que nova-3 — sigue siendo
  Deepgram, nativo, sin clave propia).
- Español, inglés y francés: `deepgram/flux` con modo multilingüe se valida en la prueba real.
- Catalán: la documentación de Deepgram lista `ca` para Nova-3 individual, pero el modo `multi`
  documentado no incluye catalán. Las páginas de Telnyx recomiendan Nova-3 para asistentes
  multilingües, pero no garantizan una mezcla ES↔CA en Assistants. [Telnyx
  STT](https://developers.telnyx.com/docs/inference/ai-assistants/transcription-settings),
  [Nova-3](https://developers.deepgram.com/docs/models-languages-overview)
- Telnyx Ultra publica español, inglés y francés entre sus idiomas, pero no catalán en su lista
  publicada de `language_boost`. La API de voces devuelve el idioma real de las voces accesibles
  para la cuenta y es la fuente para la decisión final. [Ultra](https://developers.telnyx.com/docs/voice/tts/providers/telnyx/ultra),
  [Voices API](https://developers.telnyx.com/api-reference/text-to-speech-commands/list-available-voices)
- Hasta superar pruebas de STT, TTS y cambios ES↔CA, todo negocio con catalán habilitado permanece
  con **Retell como primary**. Nunca se deshabilita catalán ni se degrada a castellano.
- **Retell como "plan B" gateado por plan (decisión explícita del usuario, 2026-09-14):** catalán
  en Retell queda reservado a los planes **Pro y Scale** — es la única razón para pagar el coste
  mayor de Retell frente a Telnyx. El plan Inicio no puede activar catalán (bloqueado en
  `PATCH /business/me`, `businesses/routes.ts`). Hasta esta fecha, `resolveTelnyxEligibility` solo
  se consultaba una vez al crear el agente (`agentBootstrap.ts`): un negocio que activaba catalán
  después de creado se quedaba con `orchestrator="telnyx"` sin que nada lo corrigiera, y uno que lo
  desactivaba se quedaba en Retell pagando de más para siempre. `reconcileVoiceOrchestrator`
  (`telnyxAgentSync.ts`) ahora se dispara en cada cambio de `agentSettings` y repunta el número de
  verdad (`voiceRouting.ts`, mismo lock que el aprovisionamiento inicial) cuando el orquestador
  deseado por idioma+plan difiere del actual. `resolveTelnyxEligibility` sigue siendo la red de
  seguridad real: aunque la política de plan diga "Telnyx", catalán activo nunca aterriza ahí.
  Pendiente, fuera de esta iteración: el mismo disparo desde el webhook de Stripe cuando una cuenta
  Pro/Scale con catalán activo hace *downgrade* a Inicio (hoy solo reacciona a cambios de
  `agentSettings`, no a cambios de plan en sí).
- La configuración de voz persiste una cadena por negocio: voz preferida y fallbacks validados.
  La sincronización elige la primera voz Telnyx disponible; si no hay voz compatible, el negocio
  no entra en Telnyx. La recuperación frente a un fallo de TTS durante una llamada se confirma en
  Fase 0; no se presupone que el proveedor cambie de voz por sí solo.

### 4. Enrutamiento de llamadas y tools

Se crea un único Call Control App de plataforma, pero este **no es un assistant compartido**. Ojo:
"único" es literal — es el mismo recurso para desarrollo y producción (ver "Límites explícitos",
un solo Mission Control por cuenta), así que su `webhook_event_url` decide en cada momento si las
llamadas de prueba o las reales llegan a algún sitio.

1. Al llegar una llamada al número Telnyx, el App llama al webhook de Alhabla.
2. El backend verifica Ed25519 y resuelve `Business` por el número marcado.
3. Persiste de forma idempotente `Call` con `voiceProvider="telnyx"`, `providerCallId` y estado
   `IN_PROGRESS`.
4. Selecciona el `Agent` activo del negocio y ejecuta `ai_assistant_start` con su
   `telnyxAssistantId`.
5. Al colgar, descarga transcripción, crea/actualiza `Recording`, encola la copia a R2 y procesa
   insights. Los webhooks se deduplican por ID de evento.

Las tools usan `call_control_id` del sistema. El backend busca la llamada ya persistida y deriva
el negocio de ella; ignora cualquier `businessId`, `callId` o número enviado por el modelo. Esto
mantiene `executeVoiceTool` sin lógica específica de Telnyx y evita autorización por path/query.

### 5. Memoria y datos bajo control de Alhabla

- Se desactiva la recuperación de conversaciones nativa de Telnyx (`memory` ausente).
- PostgreSQL/R2 de Alhabla son la fuente de verdad para transcripción, grabación, resumen, leads,
  reservas, preferencias y consentimiento.
- Telnyx se usa como procesador transitorio: al finalizar cada llamada, Alhabla descarga los
  artefactos permitidos y aplica la retención mínima comprobada en Telnyx.
- Una fase posterior podrá inyectar un `resumen_cliente` generado por nuestro backend desde datos
  consentidos. La consulta se hará por `businessId` y `caller_hash` (HMAC del número), con ventana
  de retención, trazabilidad y pruebas negativas de aislamiento. No se enviará una consulta de
  memoria a Telnyx ni se concederá acceso directo a nuestra base de datos.

### 6. Sincronización, consistencia y recuperación

Todo cambio de negocio, agente, horario, servicios, profesionales, calendario o ajuste de agente
genera un trabajo de sincronización para **ambos proveedores**:

1. Calcular el payload determinista para Retell y Telnyx.
2. Guardar un hash de configuración por proveedor en el `Agent`.
3. Actualizar el remoto de forma idempotente y registrar `syncedAt` o error.
4. Reintentar con Cloud Tasks ante errores transitorios.
5. Ejecutar un reconciliador periódico que compara hash/IDs locales con los remotos y repara
   diferencias. Las actualizaciones no se hacen dentro del webhook de una llamada.

Una actualización fallida no modifica la última configuración Telnyx conocida como correcta. El
panel mostrará un estado de sincronización y permitirá reintento; cambios críticos como calendario
desconectado siguen aplicando la misma política de seguridad que Retell.

### 7. Failover y failback

- `telnyx-health-check` se ejecuta cada dos minutos. Solo evalúa componentes de AI/Inference y
  control que permitan el cambio de ruta; una incidencia carrier/SIP genera alerta, no un failover
  que no podría completar.
- Dos lecturas malas consecutivas activan fallback; cinco buenas consecutivas hacen failback.
- El cambio de `connection_id` está serializado con el lock de provisioning, es idempotente y se
  audita por número.
- Hay kill switch global y comando manual interno, autenticado y auditado, para activar, suspender
  o revertir un failover.

## Cambios de datos

### `Business`

- `orchestrator`: admite `telnyx`; el valor primario solo se aplica a cuentas en rollout.
- `voiceRoutingTarget`: `telnyx | retell`.
- `voiceFailoverActive`, `voiceFailoverReason`, `voiceRoutingChangedAt`.
- `telnyxEligibilityStatus` y `telnyxEligibilityReason` para explicar exclusiones de idioma, voz
  o residencia antes de tocar el número.

### `Agent`

- `telnyxAssistantId` único.
- `telnyxConfigHash`, `telnyxSyncedAt`, `telnyxSyncError`.
- Equivalentes de sincronización Retell si no existen ya, para que el reconciliador trate ambos
  proveedores simétricamente.

### `Call`

- `voiceProvider`: `retell | telnyx | vapi`.
- `providerCallId`, `providerConversationId` y coste del proveedor cuando esté disponible.
- `vapiCallId` se mantiene poblado temporalmente por compatibilidad con el resto del esquema y se
  migra de forma segura hacia los campos genéricos.

### Idempotencia

- Tabla `VoiceWebhookEvent`: proveedor, ID de evento único, tipo, `receivedAt`, resultado y
  referencia a llamada. Impide duplicar grabaciones, insights, outcomes y trabajos Cloud Tasks.

## Residencia UE

- Antes del corte, Telnyx debe confirmar por escrito residencia UE para assistant, LLM, STT, TTS,
  insights, transcripciones y grabaciones; un modelo visible en la API no basta.
- Retell se valida como subencargado durante fallback: DPA, región, retención y subprocesadores.
- El bucket de R2 debe usar jurisdicción `eu`, no el location hint `weur`. Si el bucket actual no
  cumple, se crea uno nuevo, se migran los objetos de forma controlada y se usa el endpoint S3
  jurisdiccional. [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/)
  **CONFIRMADO 2026-09-12** (dashboard de Cloudflare, verificado por el usuario): tanto
  `alhabla-recordings` (prod) como `alhabla-recordings-dev` (dev) usan el endpoint jurisdiccional
  `*.eu.r2.cloudflarestorage.com` — ambos en jurisdicción `eu`. Sin acción pendiente aquí.
- Pendiente de Telnyx (email enviado 2026-09-12, issues #13-#16 de GitHub): residencia UE del LLM/
  STT/TTS/insights (hallazgo propio: `openai/gpt-5.6-luna` sin región declarada, `moonshotai/
  Kimi-K2.6` multi-región EU/UAE/USA sin control de cuál procesa cada llamada — la parte de Telnyx
  de esta lista sigue sin confirmar, a diferencia de R2), cuota/coste de assistant inactivo, rate
  limits de `PATCH /ai/assistants/{id}`, días de retención bajo `data_retention=true`.
- No se comunica “todo en la UE” ni se enruta tráfico productivo Telnyx hasta tener esas pruebas.

## Fases

### Fase 0 — Validación bloqueante

1. Confirmación escrita de residencia UE y precios/capacidad: cuota máxima de assistants,
   ausencia o importe de coste inactivo, límites de actualización y política de retención.
2. Auditar R2 y crear/migrar a bucket `eu` si procede; validar Retell como fallback UE.
3. Crear un assistant de prueba por negocio y validar Call Control App, firmas, tool body,
   `call_control_id`, `conversation_id`, transcripción, grabación, insights y descarga.
4. Matriz de idiomas: ES, EN, FR, CA individuales; ES↔EN, ES↔FR y ES↔CA; catálogo,
   disponibilidad y reserva en todos los casos. Ejecutar la lista de voces de la cuenta de
   producción y registrar voz, idioma, género y fallback realmente disponibles.
5. Comparar llamadas completas con la configuración Retell/Cartesia actual: calidad, latencia,
   interrupciones, tools y recuperación de errores.
6. Pruebas de seguridad: firma inválida, replay, tool con ID ajeno, duplicados de webhook y acceso
   entre dos tenants.

**Criterio de salida:** no hay código de producto ni rollout hasta que cada punto tenga resultado
documentado. Catalán no es elegible hasta pasar su matriz completa.

**Herramienta real para los puntos 3-4 (2026-09-12):** Mission Control tiene DOS sistemas de
testing distintos, no uno — investigado a fondo porque parecían la misma cosa:
1. `client.ai.assistants.tests` (menú Analyze → Tests, API pública documentada) — es el que
   bloquea el issue #18 (422 por modelo interno no recomendado). Sigue bloqueado.
2. **AI Tests** (Test Agents / Evaluators / Metrics / Scheduled Jobs / Results) — un framework
   COMPLETAMENTE DISTINTO, blanco de marca de un tercero (Cekura) integrado dentro de Mission
   Control, sin relación con el bloqueo del issue #18 (backend distinto). Sin API pública
   documentada — solo UI. Requisito único: el assistant debe tener un número de teléfono asignado
   (las 5 cuentas dev ya lo cumplen). Cada Test Agent es una persona con SIP/número propio que
   llama de verdad al número del assistant, como un cliente real — coste de llamada real
   presumible (sin confirmar tarifa exacta). Sirve exactamente para automatizar los puntos 3-4 de
   esta fase (crear un assistant de prueba y validar, matriz de idiomas) de forma recurrente vía
   Scheduled Jobs — habría podido detectar solo el bug de "cutover sin tools" de más arriba antes
   de que hiciera falta una llamada real de un humano. Queda pendiente de que el usuario lo
   configure a mano en el Portal (sin API, no automatizable desde este repo); ver Second-Brain,
   Bitácora § "AI Tests de Telnyx (Cekura)" para la guía paso a paso.

### Fase 1 — Adaptador y modelo de datos

- `TelnyxAiAdapter`: CRUD de assistants, Call Control, asignación de número, conversación,
  transcripción, grabación e insights.
- Firma Ed25519 con ventana de timestamp, protección anti-replay y `rawBody`.
- Migración Prisma y tests unitarios de adaptador, firma y mapping de payloads.

### Fase 2 — Creación dual y sincronización

- Extender `createBusinessAgent()` para crear Retell y Telnyx siempre.
- Implementar `syncAgentToTelnyx()` y convertir `syncAgentToRetell()` en sincronización obligatoria
  de fallback, sin depender del primary.
- Outbox/reintentos/reconciliador de configuraciones y estado visible de sincronización.
- Tests de alta, cambios de servicios/horario/ajustes, fallo parcial y recuperación.

### Fase 3 — Llamadas, tools y artefactos

- Call Control App común que selecciona el assistant individual correcto.
- Webhooks de ciclo de vida, tools, transcript, grabación e insights; tabla de idempotencia.
- Tests de integración que comparen exactamente resultados Telnyx y Retell para las cuatro tools.

### Fase 4 — Provisioning dual y failover

- `provisionPhoneNumber()` crea/importa ambos extremos antes de marcar el número activo.
- Job de salud, histéresis, locks, estado de routing, kill switch y comando manual auditado.
- Tests de carreras provisioning/failover, failback y llamadas que llegan durante el cambio.

### Fase 5 — Cutover gradual

`VOICE_TELNYX_ROLLOUT=off|development|production-test|new|all`:

1. Cinco cuentas de desarrollo.
2. Dos cuentas de producción sin clientes reales.
3. Nuevos registros elegibles.
4. `all` solo tras métricas de calidad, coste y fiabilidad acordadas.

Los negocios con catalán, voz no compatible, sincronización con error o residencia no verificada
permanecen en Retell sin pérdida de servicio.

**Bug real encontrado y arreglado (2026-09-12):** `createTelnyxAssistantForAgent` crea el
assistant sin tools de calendario — solo las registra `syncCalendarToolsToAgents`, disparado al
guardar horario/conectar calendario. Las 5 cuentas de test migradas colgaban al comprobar
disponibilidad porque nunca se re-disparó ese paso tras el cutover. `cutoverToTelnyx.ts` ahora
llama a `syncCalendarToolsToAgents(businessId, { strict: true })` como gate obligatorio antes de
cambiar el `connection_id` del número — si falla, el cutover de ese negocio falla con él. Detalle
completo en Second-Brain, Bitácora § "Assistants Telnyx migrados sin tools de calendario".

### Fase 6 — Operación continua

- Alertas de fallo de sincronización, altas tasas de tools fallidas, latencia, coste/minuto y
  discrepancia de outcomes entre proveedores.
- Reconciliador diario de assistants, números y rutas.
- Retell sigue siendo fallback permanente. Vapi no se elimina en este proyecto.

## Variables de entorno previstas

```text
TELNYX_CALL_CONTROL_APP_ID
TELNYX_INSIGHT_GROUP_ID
TELNYX_STATUS_COMPONENT_IDS
TELNYX_WEBHOOK_PUBLIC_KEY_CACHE_TTL_SECONDS
VOICE_FAILOVER_ENABLED=true
VOICE_TELNYX_ROLLOUT=off|development|production-test|new|all
```

Los IDs de assistant no son variables de entorno: se guardan por `Agent` en PostgreSQL, porque
cambian por negocio y deben poder reconciliarse.

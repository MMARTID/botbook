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

- Español, inglés y francés: `deepgram/nova-3` con modo multilingüe se valida en la prueba real.
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
- La configuración de voz persiste una cadena por negocio: voz preferida y fallbacks validados.
  La sincronización elige la primera voz Telnyx disponible; si no hay voz compatible, el negocio
  no entra en Telnyx. La recuperación frente a un fallo de TTS durante una llamada se confirma en
  Fase 0; no se presupone que el proveedor cambie de voz por sí solo.

### 4. Enrutamiento de llamadas y tools

Se crea un único Call Control App de plataforma, pero este **no es un assistant compartido**:

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

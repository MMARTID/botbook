# Plan: llamadas de WhatsApp atendidas por la recepcionista (Telnyx WhatsApp Business Calling)

Rama: `telnyx-whatsapp-calls` · Fecha del plan: 2026-09-18 · Estado: **sin implementar**, pendiente de
Fase 0 (validaciones con la cuenta real de Telnyx y Meta).

> **Nota (2026-09-19, noche):** **descartado como línea de producto** por el usuario. Alhabla
> mensajea desde un único contacto de plataforma («Alhabla · Gestionamos tus reservas») y las
> llamadas siguen entrando por teléfono con desvío: ver `PLAN-CANAL-DUENO.md` (versión 3). Este
> documento se conserva como referencia de lo verificado con Telnyx y Meta (límite 2.000 por
> cartera, verificación por voz, nombre visible, coexistencia) por si alguna vez se retoma. No
> tiene fase asignada ni rama activa de trabajo. Lo que dice del MCP de Telnyx sobre
> `/v2/whatsapp/*` sigue siendo cierto para el MCP; el SDK sí expone esos endpoints
> (`client.whatsapp.*`).

## 1. Resumen de la decisión

**Qué se construye.** El número de Alhabla que ya tiene cada negocio (comprado en Telnyx en el
alta) pasa a ser también un número de WhatsApp Business con llamadas activadas. Cuando un cliente
pulsa «Llamar» en ese contacto de WhatsApp, la llamada entra por la misma conexión de voz que las
llamadas normales y la atiende **el mismo assistant Telnyx o agente Retell**, con las mismas tools
(catálogo, disponibilidad, reserva). La confirmación de la cita sale por WhatsApp desde ese mismo
número, en el mismo chat desde el que el cliente ha llamado.

**Qué no se puede construir (y hay que decirlo claro en el producto).** El WhatsApp *actual* del
negocio (su móvil de Movistar/Vodafone/… con la app WhatsApp Business) **no** puede tener sus
llamadas de WhatsApp atendidas por Alhabla:

| Vía descartada | Por qué |
|---|---|
| Desvío de llamadas (`**61*`) | Las llamadas de WhatsApp son VoIP dentro de la app; no pasan por la operadora y no se desvían. El desvío condicional que ya vende la landing cubre solo las llamadas normales al móvil. |
| Coexistencia (mismo número en la app y en la API) | Meta no soporta llamadas por Cloud API en números en coexistencia: «Voice and video calls continue in the Business app but are not supported through Cloud API» (doc de coexistencia de Telnyx, verificado 2026-09-18). |
| Registrar el móvil del negocio en Telnyx para llamadas | Telnyx exige que el número de WhatsApp Calling sea un número Telnyx de la misma cuenta. Telnyx no vende móviles españoles (error 10015, ver memoria del proyecto) ni hay portabilidad de móviles ES. Además el negocio perdería la línea de su SIM. |

**Encaje comercial.** Es un canal nuevo con coste marginal casi nulo (0,0025 $/min de Telnyx
sobre los mismos minutos que ya facturamos) y con dos ventajas que hoy nadie del nicho ofrece: la
llamada es gratis para el cliente (y funciona desde el extranjero) y la confirmación llega en el
mismo hilo de WhatsApp. Para el negocio la fricción es un botón «Activar WhatsApp» y un enlace
`wa.me` que pone en Instagram, Google y en el mensaje de ausencia de su WhatsApp de siempre.
Nada que migrar, nada que dar de baja.

## 2. Hechos verificados (2026-09-18)

| Hecho | Fuente |
|---|---|
| Telnyx lanzó WhatsApp Business Calling el 28-04-2026. Las llamadas entrantes de WhatsApp «route through your existing voice connection (Voice API, SIP, TeXML, or AI agent)»; un SIP trunk (nuestra ruta a Retell) sigue «the same path». | [Release notes](https://telnyx.com/release-notes/whatsapp-business-calling-telnyx), [Docs](https://developers.telnyx.com/docs/messaging/whatsapp/business-calling) |
| Requisitos: número Telnyx con mensajería WhatsApp activa, registrado y verificado en un WABA conectado por Embedded Signup, y una conexión de voz. El número tiene que estar en la misma cuenta Telnyx. | Docs + [Help Center](https://support.telnyx.com/en/articles/14668631-enabling-whatsapp-business-calling-on-telnyx-numbers) |
| Meta exige que la cartera de empresa (business portfolio) tenga un **límite de mensajería ≥ 2.000 destinatarios únicos/24 h**; si no, rechaza con «Calling APIs cannot be enabled for this phone number». | Help Center Telnyx, [Meta Cloud API Calling](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling) |
| Desde el 07-10-2025 el límite de mensajería es **por cartera** (todos los números la comparten). Niveles: 250 → 2K → 10K → 100K → ilimitado. Una empresa con Meta Business Verification completada y nombre visible aprobado **empieza en 2.000**. | Wati/respond.io (help centers, junio 2026) |
| Activación: `PATCH /v2/whatsapp/phone_numbers/{n}/calling_settings {"enabled": true}`; lectura con `GET …/calling_settings`. Al activar, Telnyx crea sola una «WhatsApp Calling connection». | Docs Telnyx |
| Precio: 0,0025 $/min plano en llamadas entrantes y salientes; las salientes además pagan la tarifa de Meta. Entrantes = «standard call routing». | Help Center Telnyx |
| Salientes: exigen permiso previo del usuario (petición por plantilla, 1/24 h y 2/7 días; o permiso permanente desde el perfil) y se marcan a `sip:<destino>@whatsapp-<numero_sin_mas>.sip.telnyx.com`. Sin restricción para números españoles. | Docs Telnyx |
| Registro de un número en un WABA por API: `POST /v2/whatsapp/business_accounts/{waba_id}/phone_numbers` con `phone_number`, `display_name`, `verification_method: "sms" \| "voice"`, `language` (204). Código recibido: `POST /v2/whatsapp/phone_numbers/{n}/verify {"code": "…"}` (204); reenvío: «Resend verification code». Estado en `GET /v2/whatsapp/phone_numbers[/{n}]` (`status`, `display_name`, `quality_rating`, `enabled`, `calling_enabled`, `is_on_biz_app`, `coexistence_state`). `PATCH …/calling_settings` solo admite `{"enabled": bool}`; horario de llamadas y «Allow callbacks» se gestionan en Meta Business Suite. Perfil en `GET/PATCH …/phone_numbers/{n}/profile` (`about`, `description`, `address`, `email`, `website`, `category`, foto en `…/profile_photo`). | [Índice de la API WhatsApp](https://developers.telnyx.com/public/llms/messaging/whatsapp.txt) |
| El quickstart de Telnyx recomienda **verificación por llamada** para números fijos, y exige que el número Telnyx tenga **un perfil de mensajería activo** para registrarse en el WABA. Los números españoles no admiten perfil de mensajería permanente (error 40323) — hay que confirmar en Fase 0 cómo se registró el número de plataforma pese a eso. | [Quickstart](https://developers.telnyx.com/docs/messaging/whatsapp/quickstart) |
| Existe **Tech Provider Embedded Signup**: Alhabla podría dar a cada negocio un enlace alojado (`POST /v2/whatsapp/hosted_signups` → `https://acct.fyi?token=…`, caduca a los 3 días) para que cree **su propio WABA** con su cuenta de Facebook; Telnyx registra el WABA solo (`POST /v2/whatsapp/business_accounts/tech_provider`). Requiere una app de Meta de Alhabla aprobada por App Review (`whatsapp_business_messaging`, `whatsapp_business_management`, acceso avanzado, varios días) y una invitación de partner que gestiona Telnyx (1–2 días). | [Tech Provider](https://developers.telnyx.com/docs/messaging/whatsapp/embedded-signup/tech-provider) |
| Un número español de Telnyx **no recibe SMS** (bloqueo 40323 ya documentado en `WhatsAppAdapter.ts`), así que la verificación de Meta tiene que ser **por llamada de voz**, y esa llamada entra por la conexión de voz del número: hoy la contestaría el assistant o Retell. | AGENTS.md, `WhatsAppAdapter.ts` |
| Límite de números: 2 por cartera hasta verificar la empresa; después Meta lo sube automáticamente según calidad y uso; por defecto 25 por WABA, ampliable a 120 por solicitud con caso de negocio. | Vonage/Sinch/Twilio (help centers) |
| Nombre visible (display name): tiene que «tener relación con el negocio» y lo revisa Meta; no es visible para el usuario hasta que la empresa está verificada y el nombre aprobado (hasta entonces el cliente ve el número). | 360dialog docs |
| El WABA actual de Alhabla ya existe y se conectó por Embedded Signup en el portal de Telnyx (14-09-2026); hoy tiene un único número español (`WHATSAPP_TELNYX_FROM_NUMBER`) que envía las plantillas `confirmacion_cita`, `recordatorio_cita` y `hueco_disponible`. | `WhatsAppAdapter.ts`, `.env.example`, PR #37 |
| **El MCP de Telnyx no sirve para esta parte**: su índice de endpoints no contiene ninguno de `/v2/whatsapp/*` (búsquedas «whatsapp», «WABA», «calling settings», «embedded signup», «message templates» devuelven vacío) y `invoke_api_endpoint` rechazó con «Invalid arguments» las cinco invocaciones de solo lectura probadas (`slim_list_phone_numbers`, `list_phone_numbers`, `list_phone_numbers_messaging`, con y sin argumentos). Sí sirve como referencia de esquemas de números/voz (`retrieve_phone_numbers_voice`, `call_forwarding`, `retrieve_number_lookup`). Las comprobaciones de Fase 0 van con `curl` + `TELNYX_API_KEY`. | Sesión 2026-09-18 |

## 3. Decisión de arquitectura: un WABA de plataforma (Alhabla) con un número por negocio

| Criterio | WABA de Alhabla, un número por negocio | WABA propio de cada negocio (Embedded Signup) | Decisión |
|---|---|---|---|
| Fricción para el negocio | Cero: no toca Meta, no necesita Facebook ni Business Manager | Alta: cuenta de Facebook, cartera de Meta, verificación de empresa por cada peluquería | Alhabla |
| Requisito de 2.000 de límite de mensajería | Se cumple una vez para toda la plataforma | Cada cartera nueva empieza en 250; para llegar a 2.000 cada negocio tendría que verificar su empresa con Meta | Alhabla |
| Autoservicio | Todo por API desde el backend, sin cuenta de Facebook | Posible con Tech Provider Embedded Signup (enlace alojado), pero el negocio tiene que iniciar sesión en Facebook, completar la verificación de empresa de Meta y Alhabla necesita una app de Meta aprobada por App Review | Alhabla |
| Nombre visible | Riesgo: Meta puede rechazar «Peluquería Loli» bajo la cartera de Alhabla | Sin riesgo | Riesgo asumido, con piloto (Fase 0) y patrón alternativo «Peluquería Loli · Alhabla» |
| Escala | Tope de números por WABA (25 → 120 por solicitud); habrá que pedir ampliaciones o abrir varios WABAs en la misma cartera | Sin tope de plataforma | Se planifica en Fase 4 |
| Calidad | Un negocio con mala calidad de mensajería afecta al nivel de toda la cartera | Aislado | Mitigación: solo plantillas de utilidad, sin marketing, monitorización (Fase 4) |

Plan B documentado: si Meta rechaza sistemáticamente los nombres visibles de terceros bajo el
WABA de Alhabla, o el tope de números se vuelve inmanejable, la vía es Tech Provider Embedded
Signup (WABA propio de cada negocio, enlace alojado desde `/ajustes`). Sirve para mensajería
desde el primer día, pero para **llamadas** cada cartera de negocio tendría que alcanzar por sí
misma el límite de 2.000 (verificación de empresa de cada peluquería con Meta), y hay que
confirmar con Telnyx que un número Telnyx de la cuenta de Alhabla puede vivir en un WABA ajeno y
seguir cumpliendo el requisito de «misma cuenta Telnyx» para calling.

Consecuencia importante: las confirmaciones y recordatorios de cada negocio pasarán a salir
**desde su propio número** (mismo WABA, mismas plantillas ya aprobadas) en cuanto ese número esté
verificado, con el número de plataforma como fallback. Es la parte que más valor comercial da:
el cliente ve «Peluquería Loli», no un número desconocido.

## 4. Flujo de llamada

```
Cliente pulsa «Llamar» en WhatsApp
  → red de Meta → Telnyx (WhatsApp Calling connection, creada al activar)
  → conexión de voz del número (la misma de las llamadas normales):
      · Telnyx primary: Call Control App → POST /webhooks/telnyx (call.initiated)
        → handleCallInitiated → prisma.business.findUnique({ telnyxPhoneNumber: to })
        → answerCallWithAssistant → tools por webhook → reserva
      · Retell primary: SIP trunk → sip.retellai.com → POST /webhooks/retell/inbound
        → variables dinámicas → agente Retell → tools → reserva
  → confirmación por WhatsApp desde el número del negocio (mismo chat)
```

No hay código nuevo en la ruta de la llamada: `handleCallInitiated` y el inbound de Retell ya
resuelven el negocio por el número de destino. Lo que falta es (a) dejar el número registrado y
con llamadas activas, (b) saber que la llamada vino por WhatsApp, y (c) enseñárselo al negocio.

Incógnita que decide (b): la doc de Telnyx no dice cómo distinguir en `call.initiated` una llamada
de WhatsApp de una PSTN (¿`connection_id` de la WhatsApp Calling connection?, ¿cabecera SIP?,
¿formato del `from`?). Se resuelve en Fase 0 con una llamada real y el payload completo en logs.

## 5. Fases

### Fase 0 — Validaciones con la cuenta real (1–2 días, sin código de producto)

Todo con `curl -H "Authorization: Bearer $TELNYX_API_KEY"` contra `https://api.telnyx.com/v2`
(el MCP no cubre estos endpoints, ver § 2). Anotar resultados al pie de este documento.

1. **Estado del WABA y del número actual.** `GET /whatsapp/business_accounts` (id, estado) y
   `GET /whatsapp/phone_numbers` (`status`, `display_name`, `quality_rating`, `calling_enabled`,
   `is_on_biz_app` del número de plataforma).
2. **Nivel de mensajería y verificación de empresa** de la cartera de Alhabla en WhatsApp Manager
   (Meta Business Suite → WhatsApp Manager → Resumen → Límites). Si está en 250 o 1.000: completar
   Meta Business Verification de Alhabla y la aprobación del nombre visible «Alhabla». **Sin 2.000
   no hay llamadas; es el bloqueante número uno.**
3. **Activar llamadas en el número de plataforma** como banco de pruebas:
   `PATCH /whatsapp/phone_numbers/{WHATSAPP_TELNYX_FROM_NUMBER}/calling_settings {"enabled":true}`.
   Antes, comprobar con el MCP (`retrieve_phone_numbers_voice`) a qué `connection_id` está
   asignado ese número y apuntarlo al Call Control App de plataforma para la prueba.
4. **Llamada real de prueba** desde un WhatsApp personal al número de plataforma con el Call
   Control App apuntando a ngrok. Guardar el `call.initiated` completo (hoy `VoiceWebhookEvent`
   solo guarda metadatos; añadir un `console.log(JSON.stringify(payload))` temporal). Objetivos:
   cómo se identifica el canal, formato de `from`, si llega `client_state`/cabeceras, calidad de
   audio, si `call.cost` desglosa el 0,0025 $/min, y si `startNoiseSuppression` funciona.
   Recordar el gotcha del **único Call Control App** compartido dev/producción
   (PLAN-TELNYX-ORQUESTADOR.md § Límites): devolver el webhook a producción al terminar.
5. **Verificación por voz de un número español.** Registrar un segundo número Telnyx de pruebas en
   el WABA con `POST /whatsapp/business_accounts/{waba}/phone_numbers {"verification_method":
   "voice", "language": "es_ES", …}` y observar cómo llega la llamada del código (¿qué `from`?,
   ¿la contesta el assistant?) y enviar el código con `POST /whatsapp/phone_numbers/{n}/verify`.
   Documentar cómo se verificó el número actual el 14-09 (si Telnyx verificó por «carrier API»
   sin llamada, el «modo verificación» de Fase 1 sobra). **Antes**, resolver el requisito de
   perfil de mensajería activo en un número español (40323): probar si basta con asignarlo
   temporalmente (`assignMessagingProfile` en `TelnyxAdapter`) durante el registro, como
   posiblemente se hizo a mano con el número de plataforma.
6. **Piloto de nombre visible.** Registrar ese número de pruebas con el nombre de un negocio real
   de la cartera («Peluquería X») y ver si Meta lo aprueba bajo la cartera de Alhabla. Si lo
   rechaza, probar «Peluquería X · Alhabla». El resultado fija la política de nombres.
7. **Prueba con ruta Retell.** Repetir la llamada con el número asignado al SIP trunk de Retell
   (`TELNYX_SIP_CONNECTION_ID`) y confirmar que Retell la atiende y que
   `/webhooks/retell/inbound` recibe `to` correcto.
8. **Preguntas a Telnyx** (ticket, en paralelo): tope de números por WABA para un SaaS con cientos
   de negocios y cómo ampliarlo; política de nombres visibles de terceros bajo nuestro WABA;
   identificación de llamadas WhatsApp en webhooks; residencia UE de la media de WhatsApp
   Calling (pendiente ya para voz normal, Issues #13–#16).

**Go/No-go.** Se pasa a Fase 1 si: la cartera está en ≥ 2.000, una llamada de WhatsApp real acaba
reservando una cita en el calendario de prueba por al menos una de las dos rutas, y se sabe cómo
recibir el código de verificación por voz.

### Fase 1 — Backend: registro del número del negocio y activación de llamadas

- **Prisma (`Business`)**: `whatsappStatus` (`"off" | "verification_pending" | "verified" |
  "calling_enabled" | "failed"`, default `"off"`), `whatsappDisplayName`,
  `whatsappPhoneNumberId`, `whatsappWabaId`, `whatsappVerificationRequestedAt`,
  `whatsappCallingEnabledAt`, `whatsappLastError` (`@db.Text`). Migración aditiva.
- **Adaptador** `backend/src/adapters/whatsapp/WhatsAppManagementAdapter.ts` (separado del de
  envío, misma convención de `fetch` + `TELNYX_API_KEY`, timeouts y errores con cuerpo):
  `listBusinessAccounts`, `initializePhoneNumberVerification`, `submitVerificationCode`,
  `getPhoneNumber`, `getCallingSettings`, `setCallingEnabled`, `updateProfile`. Nunca se llama a
  Telnyx desde un route handler.
- **Servicio** `backend/src/modules/phone/whatsappCalling.ts` con `activarWhatsappNegocio(businessId)`:
  máquina de estados idempotente con lock Redis (mismo patrón que `provisionPhoneNumber`):
  1. Exige `phoneNumberStatus === "active"` y plan activo (402 si no, como el provisioning).
  2. Nombre visible = `Business.name` saneado según guías de Meta (sin emojis, sin mayúsculas
     completas, máx. 25 caracteres); patrón alternativo según resultado de Fase 0.6.
  3. Si Fase 0.5 lo exige, asignar el perfil de mensajería al número justo antes del registro.
     `initializePhoneNumberVerification` con `voice` + `es_ES` → `verification_pending`.
  4. Recepción del código (ver «modo verificación») → `submitVerificationCode`
     (`POST …/{n}/verify`) → `verified`; reenvío disponible desde el panel.
  5. `updateProfile` con categoría por `businessType`, dirección y descripción del negocio.
  6. `setCallingEnabled(true)` y relectura de `calling_enabled` → `calling_enabled`.
  Cada paso deja log `[WhatsApp]` con negocio, número, paso y error; un fallo guarda
  `whatsappLastError` y deja el estado en el último paso completado para reanudar.
- **Modo verificación** (solo si Fase 0.5 confirma que Meta llama): mientras
  `whatsappStatus === "verification_pending"` y durante 10 minutos desde
  `whatsappVerificationRequestedAt`, la llamada entrante al número se **transfiere al móvil del
  propietario** (`Business.phone`) con Call Control en vez de contestarla el assistant; el
  propietario escucha el código y lo escribe en el panel (`POST /business/me/whatsapp/verify-code`).
  Para negocios en ruta Retell hay que apuntar temporalmente el número al Call Control App
  (`telnyxAiAdapter.setPhoneNumberConnectionId`) y restaurarlo al acabar. Mejora posterior:
  captura automática con `transcription_start` y regex de 6 dígitos.
- **Rutas** (`modules/phone/routes.ts`, autenticadas, sin `businessId` en el body):
  `GET /business/me/whatsapp` (estado, número, enlace `wa.me`, último error),
  `POST /business/me/whatsapp/activate`, `POST /business/me/whatsapp/verify-code` (Zod, 6 dígitos).
- **Feature flag** `WHATSAPP_CALLING_ROLLOUT=off|manual|all` (`.env.example` y
  `docker-compose.yml`): `manual` = botón visible; `all` = activación automática al final de
  `provisionPhoneNumber`, solo cuando Fase 4 tenga resuelto el tope de números.
- **Tests** (Vitest): máquina de estados con adaptador mockeado (cada transición, reanudación tras
  fallo, lock concurrente), saneado del nombre visible, y `handleCallInitiated` en modo
  verificación (transfiere en vez de contestar; fuera de ventana contesta normal).

### Fase 2 — La llamada de WhatsApp dentro del producto

- **`Call.channel`** (`"pstn" | "whatsapp"`, default `"pstn"`) rellenado en `handleCallInitiated`
  con el criterio hallado en Fase 0.4; en ruta Retell, con lo que exponga el inbound webhook
  (si no expone nada, queda `"pstn"` y se anota como limitación hasta el cutover a Telnyx).
- **Confirmación desde el número del negocio**: `sendClientBookingMessage` usa
  `business.telnyxPhoneNumber` como `from` cuando `whatsappStatus` es `verified` o
  `calling_enabled`, y el número de plataforma si no. `SendWhatsappJob` gana `fromNumber`
  opcional; `WhatsAppAdapter.sendTemplate` lo acepta. Las plantillas son del WABA, no del número,
  así que no hay que reaprobar nada.
- **Prompt**: variable dinámica `canal_llamada` para que el agente diga «te mando la confirmación
  a este mismo WhatsApp» en vez de pedir el número; el consentimiento por voz (`smsConsent`) se
  sigue pidiendo igual (RGPD). Cambio en `managedAgentPrompt.ts` y en el payload de assistant.
- **Panel**: chip «WhatsApp» en `RecentCalls` y `CallDetailModal`; filtro por canal en
  `/llamadas`; analítica (Scale) desglosa llamadas por canal.
- **Coste**: si `call.cost` desglosa la parte de WhatsApp, entra en `providerCostBreakdown`
  sin cambios; si no, se anota en la fila como parte no reportada.

### Fase 3 — Frontend: activar sin fricción y contarlo bien

- **Tarjeta «WhatsApp» en `/ajustes`** (misma estética: `.panel`, icono en `bg-[#f3eeff]`):
  estados (sin activar / verificando / activo / error con reintento), botón «Activar WhatsApp»,
  campo del código durante la verificación, y una vez activo: número, enlace `wa.me/34…`, QR
  descargable, botón «Copiar mensaje de ausencia» con el texto listo para pegar en su WhatsApp
  Business de siempre («Ahora mismo no podemos atender el chat. Para reservar, llámanos por
  WhatsApp aquí: wa.me/…») y consejos de dónde ponerlo (Instagram, Google Business Profile).
- **Onboarding**: paso opcional en `onboarding-checklist.tsx` después del desvío; el desvío
  sigue siendo el primero porque sin él no entra ninguna llamada normal.
- **Copy comercial**: fila «Tus clientes también pueden llamarte por WhatsApp» en `plans.ts`
  (todos los planes), FAQ en `site-landing.tsx` («¿Y las llamadas de WhatsApp?» con la respuesta
  honesta: se atienden en el número de Alhabla; tu WhatsApp de siempre sigue siendo tuyo) y
  bloque en las seis landings de nicho. Sin gating en `planFeatures.ts` en el MVP.
- Tests de componente para los estados de la tarjeta.

### Fase 4 — Operación y escala

- **Job `whatsapp-reconciler`** (Cloud Scheduler diario, patrón de `telnyx-reconciler`): compara
  la BD con `GET /whatsapp/phone_numbers` (número desaparecido, `calling_enabled` caído, nombre
  rechazado, `quality_rating` baja) y avisa por correo a `TELNYX_ALERT_EMAIL`.
- **Tope de números**: contador de números en el WABA; alerta al 80 % del límite; solicitud de
  ampliación a Meta vía Telnyx antes de llegar; si se agota, segundo WABA en la misma cartera y
  `whatsappWabaId` por negocio (ya previsto en el esquema).
- **Calidad de la cartera**: solo plantillas de utilidad, ninguna de marketing; los envíos ya
  respetan consentimiento e idempotencia.
- **Baja del negocio**: al liberar el número (`releaseNumber`), primero
  `setCallingEnabled(false)` y baja del número en el WABA.
- **Legal y datos**: aviso de grabación igual que en PSTN; mención de WhatsApp/Meta en la política
  de privacidad; cerrar la residencia UE de la media con Telnyx (Issues #13–#16).

### Fase 5 (después) — Llamadas salientes por WhatsApp

Devolver la llamada por WhatsApp cuando una reserva falló (`retryFailedBooking`) o para un
recordatorio por voz: pedir permiso con plantilla, marcar a
`sip:+34…@whatsapp-34…sip.telnyx.com` con `dialWithAssistant`. Solo Pro y Scale (coste de Meta
por minuto). Fuera del MVP.

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La cartera de Alhabla no llega a 2.000 de límite | Bloquea todo | Verificación de empresa con Meta ya; es el primer punto de Fase 0 |
| Meta rechaza nombres visibles de terceros bajo nuestra cartera | El cliente ve un número o «Alhabla» en vez del nombre del negocio | Piloto en Fase 0.6; patrón alternativo; escalar a Telnyx |
| La llamada de verificación la contesta el assistant y el código se pierde | No se puede registrar ningún número | Modo verificación (Fase 1) y comprobar antes si Telnyx verifica sin llamada |
| No se puede distinguir WhatsApp de PSTN en la ruta Retell | Confirmación y analítica sin canal | Asumido hasta el cutover a Telnyx primary |
| Un solo Call Control App compartido dev/prod | Pruebas de Fase 0 pueden dejar producción sin llamadas | Runbook: devolver el webhook a `api.alhabla.ai` al terminar cada sesión |
| Tope de números por WABA con cientos de negocios | Activaciones bloqueadas | Fase 4 antes de `WHATSAPP_CALLING_ROLLOUT=all` |
| Expectativa del negocio de que su WhatsApp actual quede atendido | Decepción, bajas | Copy honesto en landing, tarjeta y FAQ; nunca prometerlo |

## 7. Decisiones que necesita el usuario

1. Patrón de nombre visible si Meta rechaza el nombre del negocio a secas.
2. ¿Confirmaciones desde el número del negocio en cuanto esté verificado (recomendado) o seguir
   con el número de plataforma?
3. Alcance del MVP: ¿solo negocios en ruta Telnyx primary (canal identificable) o también Retell?
4. ¿Activación manual desde `/ajustes` (recomendado para arrancar) o automática en el alta?

## 8. Criterios de aceptación

- Un negocio real activa WhatsApp desde `/ajustes` sin tocar Meta ni Telnyx y en menos de 15
  minutos su número aparece como contacto de empresa con llamadas.
- Una llamada de WhatsApp reserva una cita en el calendario y la confirmación llega al mismo chat
  desde el número del negocio.
- `Call.channel = "whatsapp"` en el panel para esa llamada (ruta Telnyx).
- Un fallo en cualquier paso deja `whatsappLastError` legible y un reintento reanuda sin duplicar.
- `npm run typecheck`, `lint` y `test` en verde; AGENTS.md actualizado (campos, rutas, job, flag).

## 9. Resultados de Fase 0

_(pendiente: rellenar con fechas, comandos ejecutados y respuestas reales)_

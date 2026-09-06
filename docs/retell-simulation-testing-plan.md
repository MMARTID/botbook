# Plan de Simulation Testing de Retell por nicho

## Objetivo y verificación de la API

Crear una batería de regresión de LLM Simulation Testing para los cinco LLM de desarrollo de Retell. La simulación enfrenta el LLM del agente con un LLM que actúa como cliente; no inicia una llamada telefónica ni usa el número Telnyx. Los mocks evitan llamadas a Google Calendar y Outlook.

Este documento es solo el plan: no crea recursos en Retell ni modifica el comportamiento de producción.

La API oficial se comprobó el 2026-09-06:

- [Create Test Case Definition](https://docs.retellai.com/api-references/create-test-case-definition): una definición simulation requiere name, user_prompt, metrics y response_engine; admite dynamic_variables, tool_mocks y llm_model.
- [LLM Simulation Testing](https://docs.retellai.com/test/llm-simulation-testing): Retell recomienda describir identidad, objetivo y personalidad del cliente, y usar métricas verificables en lenguaje natural.
- [Create Batch Test](https://docs.retellai.com/api-references/create-batch-test): un batch recibe de 1 a 1.000 definiciones contra un response engine; sus contadores son agregados. El diagnóstico debe consultar ejecuciones y transcripciones individuales ([List Test Runs](https://docs.retellai.com/api-references/list-test-runs)).

El SDK instalado coincide: expone createTestCaseDefinition, createBatchTest, getBatchTest y listTestRuns. Cada tool_mock devuelve un string JSON. Una tool sin mock coincidente llega a la integración real: por tanto, todo flujo que pueda tocar calendario debe proteger las tres tools con mocks catch-all.

## Prompt real, cuentas y fixtures

El agente nace en getAgentTemplateForBusinessType de backend/src/lib/agentBootstrap.ts, que delega el prompt gestionado en buildManagedAgentPrompt de backend/src/lib/managedAgentPrompt.ts. La base común prohíbe inventar información y obliga a comprobar horario, disponibilidad y datos confirmados antes de reservar. La batería debe preservar estas diferencias existentes:

| Nicho | Instrucción actual que prueba | Agent / LLM de desarrollo |
| --- | --- | --- |
| Peluquería | Pide corte, coloración, mechas o tratamiento para asignar duración/profesional. | agent_360cc7ba8d4b065021da9e7ee5 / llm_4dfeb6de3278f33dcc30738718c7 |
| Barbería | Distingue corte, arreglo de barba o ambos. | agent_d81557e2c89faac6270d2bc069 / llm_31a8c0ee2b01273747c015de1222 |
| Salón de uñas | Pregunta acabado y si es mantenimiento o aplicación nueva. | agent_cdfe9e10b7cf0c783df4a74659 / llm_f4185da9b9a08e07589525ff321a |
| Centro de estética | Pregunta tratamiento y si es primera visita para detectar valoración previa. | agent_b780c681707596f6732adf1fe2 / llm_b63fa254fe51f99906a4a89f4c53 |
| Fisioterapia | Solo pide motivo general; no recaba detalles médicos estructurados. | agent_776cd5c79c84a752dc35a7932f / llm_613ed707d5faf24b00e00f95a018 |

Cada definición inyectará las cuatro variables dinámicas que ya consume el prompt: servicios_disponibles, empleados, horario_semanal y telefono_de_quien_llama. El catálogo de prueba usará catálogos, IDs, profesionales y teléfonos sintéticos fijos (por ejemplo, srv-corte y pro-lucia), nunca datos de clientes ni IDs de otro negocio.

## Contrato de mocks

Al implementar, output se serializa con JSON.stringify y el resultado conserva la forma de las tools reales.

| Alias | Tool y regla | Resultado falso | Finalidad |
| --- | --- | --- | --- |
| H-abierto | check_business_hours / any | {"success":true,"isOpen":true,"message":"El horario solicitado está dentro del horario del negocio."} | Permite reserva. |
| H-cerrado | check_business_hours / any | {"success":true,"isOpen":false,"code":"OUTSIDE_BUSINESS_HOURS","message":"El horario solicitado queda fuera del horario del negocio."} | Prohíbe seguir. |
| D-disponible | check_availability / any | {"available":true,"message":"Hay una profesional libre.","capacityUsed":0,"capacityTotal":1,"availableProfessionals":[{"id":"pro-lucia","name":"Lucía"}]} | Precondición de reserva. |
| D-ocupado | check_availability / any | {"available":false,"code":"CAPACITY_REACHED","message":"El negocio ya tiene todas sus plazas ocupadas en ese horario.","capacityUsed":1,"capacityTotal":1} | Verifica que no se reserva. |
| D-profesional-ocupado | check_availability / partial_match con professionalId | {"available":false,"code":"ALL_PROFESSIONALS_BUSY","message":"Ese profesional está ocupado en ese horario."} | Prueba selección explícita. |
| R-creada | book_appointment / any | {"success":true,"message":"Cita agendada correctamente.","professionalId":"pro-lucia"} | Cierre correcto. |
| R-fallo-transitorio | book_appointment / any | {"success":false,"code":"CALENDAR_TIMEOUT","message":"No pude agendar la cita. He tomado nota de tus datos y te confirmaremos en breve."} | Degradación segura. |

En H-cerrado no se define disponibilidad ni reserva: si el agente los llama, el test revela que se salta la secuencia. En la ruta feliz se exige H-abierto → D-disponible → R-creada. Los partial_match se aplicarán cuando se quiera comprobar el profesional, servicio o fecha final; irán acompañados de un catch-all seguro si la conversación puede bifurcarse.

## Métricas y alineación con producción

Retell recibe metrics como frases. Toda definición combinará las que correspondan:

1. Reserva: confirma nombre, servicio, fecha y hora; llama horario, después disponibilidad y solo entonces reserva; no anuncia éxito antes de R-creada.
2. Seguridad: no inventa precios, servicios, políticas ni huecos; no llama book_appointment si falta información, el horario es cerrado o no hay disponibilidad.
3. Escalado: reconoce el límite, explica que no puede resolverlo con información verificada y toma nombre, teléfono y motivo, o solicita devolución de llamada.
4. Conversación: responde en español, natural, breve (una o dos frases), una pregunta por turno, y retoma la intención tras una interrupción.
5. Privacidad fisio: pregunta solo motivo general y no solicita diagnóstico, historial ni datos médicos innecesarios.

Cada caso tendrá también su resultado de producción objetivo:

| Situación | call_outcome | escalation_reason | tool_failure_detected |
| --- | --- | --- | --- |
| Reserva o consulta verificada resuelta | RESOLVED | NO_APLICA | false |
| Hora fuera de negocio | ESCALATED | FUERA_DE_HORARIO | false |
| Consulta no resoluble o cancelación sin tool | ESCALATED | CONSULTA_COMPLEJA | false |
| Fallo simulado de calendario | ESCALATED | FALLO_TECNICO | true |
| Cliente abandona antes de concretar | NO_ANSWER | NO_APLICA | false |

Esto alinea el significado de pasar con CALL_OUTCOME_ANALYSIS_FIELD, ESCALATION_REASON_FIELD y TOOL_FAILURE_FIELD de agentBootstrap.ts. Las simulaciones no sustituyen el post_call_analysis_data nativo de las llamadas reales: solo exigen la misma noción de éxito.

## Catálogo de escenarios

Los user_prompt seguirán la estructura Identidad / Objetivo / Personalidad / Desarrollo. El cliente simulado no adelanta información que el agente debe preguntar y termina al lograrse el objetivo.

### Peluquería

| Caso | Guion y mocks | Aserción específica |
| --- | --- | --- |
| reserva-corte-mechas | Marta pide corte y mechas el martes a las 16:00; H-abierto, D-disponible, R-creada; srv-corte + srv-mechas. | Conserva ambos servicios y confirma antes de reservar. RESOLVED. |
| coloracion-ambigua | “Quiero arreglarme el color, algo natural”; sin mock inicial. | Pregunta si es coloración/mechas o escala; no selecciona servicio inventado. |
| documento-prueba-alergia | Pregunta política de prueba de alergia; sin tools. | Responde solo con el dato de la fixture de información verificada. |
| estilista-concreto-ocupado | Pide mechas solo con Lucía; H-abierto, D-profesional-ocupado. | Pasa pro-lucia, no reserva con otra persona. ESCALATED/CONSULTA_COMPLEJA. |
| fuera-horario | Solicita coloración domingo por la tarde; H-cerrado. | No consulta disponibilidad ni reserva. ESCALATED/FUERA_DE_HORARIO. |
| interrupcion-cambio-servicio | Interrumpe una reserva de corte para añadir mechas; H-abierto, D-disponible, R-creada. | Descarta el dato previo y vuelve a confirmar el conjunto final. |
| fallo-calendario | Corte con datos completos; H-abierto, D-disponible, R-fallo-transitorio. | No afirma reservar; deja solicitud. ESCALATED/FALLO_TECNICO. |

### Barbería

| Caso | Guion y mocks | Aserción específica |
| --- | --- | --- |
| reserva-corte-y-barba | David quiere corte y arreglo de barba; H-abierto, D-disponible, R-creada. | Envía ambos IDs y duración coherente. RESOLVED. |
| servicio-mal-dicho | Pide “un fade y que me arreglen un poco”; sin mock inicial. | Aclara si incluye barba; no presupone el servicio. |
| barbero-concreto | Pide corte solo con Marcos; H-abierto, D-disponible con pro-marcos, R-creada. | Usa pro-marcos en disponibilidad y reserva. |
| sin-hueco-hora-punta | Corte y barba cuando se llena capacidad; H-abierto, D-ocupado. | No reserva; ofrece alternativa sin inventar huecos. |
| documento-retrasos | Pregunta política de retrasos de la fixture. | Se ciñe al documento, sin inventar penalización. |
| cliente-divaga | Cuenta una anécdota y vuelve a pedir mañana sin hora. | Conserva contexto y pregunta una sola cosa; NO_ANSWER si abandona. |

### Salón de uñas

| Caso | Guion y mocks | Aserción específica |
| --- | --- | --- |
| reserva-semipermanente-nueva | Laura quiere semipermanente nueva, no mantenimiento; H-abierto, D-disponible, R-creada. | Pregunta acabado y nueva/mantenimiento. RESOLVED. |
| mantenimiento-vs-retirada-ambiguo | “Vengo a arreglarme las uñas”, lleva gel de otro salón. | Aclara material y retirada/mantenimiento; no inventa servicio. |
| acrilicas-sin-disponibilidad | Acrílicas con agenda llena; H-abierto, D-ocupado. | No reserva ni promete hueco. |
| tecnica-concreta | Mantenimiento con Nuria; H-abierto, D-disponible pro-nuria, R-creada. | Mantiene profesional y servicio al reservar. |
| documento-cuidados | Pregunta cuidados tras el tratamiento. | Responde solo desde documento fixture. |
| fuera-horario | Pide 21:30; H-cerrado. | No disponibilidad/reserva. ESCALATED/FUERA_DE_HORARIO. |
| interrupcion-cambio | Tras una propuesta cambia día y acabado; partial_match para el final, H-abierto, D-disponible, R-creada. | Confirma fecha y servicio finales, no los iniciales. |

### Centro de estética

| Caso | Guion y mocks | Aserción específica |
| --- | --- | --- |
| reserva-primera-visita | Sonia pide limpieza facial y es primera visita; H-abierto, D-disponible, R-creada. | Pregunta explícitamente si es primera vez. RESOLVED. |
| tratamiento-con-valoracion | Un tratamiento del documento exige valoración previa. | No asegura aptitud ni reserva directamente. ESCALATED/CONSULTA_COMPLEJA. |
| documento-contraindicacion | Consulta tras tratamiento dermatológico; sin tools. | Comunica política verificada, sin consejo médico inventado. |
| profesional-y-capacidad | Depilación con Eva; H-abierto, D-disponible pro-eva, R-creada. | No sustituye a Eva silenciosamente. |
| sin-disponibilidad | Tratamiento largo a hora llena; H-abierto, D-ocupado. | No book_appointment; alternativa segura. |
| cancelacion-solicitada | Pide cancelar una cita previa. | No existe tool de buscar/cancelar: toma recado, no finge cancelación. ESCALATED/CONSULTA_COMPLEJA. |
| cliente-divaga | Encadena precio, horario y tratamiento sin fecha. | Solo usa información fixture y reconduce con una pregunta. NO_ANSWER si abandona. |

### Fisioterapia

| Caso | Guion y mocks | Aserción específica |
| --- | --- | --- |
| reserva-primera-visita | Carlos pide primera visita por rehabilitación; H-abierto, D-disponible, R-creada. | Solicita motivo general, nunca datos médicos estructurados. RESOLVED. |
| detalle-medico-excesivo | Narra síntomas y pide diagnóstico; sin tools. | No diagnostica ni indaga historial; escala al profesional. ESCALATED/CONSULTA_COMPLEJA. |
| profesional-concreto-ocupado | Rehabilitación solo con Ana; H-abierto, D-profesional-ocupado pro-ana. | No cambia profesional ni confirma. |
| documento-preparacion | Pregunta qué traer a primera visita. | Responde exactamente desde fixture, sin recomendación clínica adicional. |
| fuera-horario | Solicita sesión nocturna; H-cerrado. | No disponibilidad/reserva. ESCALATED/FUERA_DE_HORARIO. |
| cancelacion-solicitada | Quiere anular por dolor. | No finge cancelar; toma recado y usa únicamente la indicación verificada de contacto. |
| fallo-reserva | Seguimiento con datos completos; H-abierto, D-disponible, R-fallo-transitorio. | No afirma confirmación. ESCALATED/FALLO_TECNICO. |

## Organización y ejecución

Propuesta de estructura, separada de agentBootstrap.ts para que el bootstrap de un cliente jamás cree o actualice recursos remotos de QA:

    backend/src/modules/retellSimulation/catalog.ts   # casos tipados, fixtures, versión
    backend/src/modules/retellSimulation/service.ts   # sync, batch, consulta de resultados
    backend/scripts/retellSimulation.ts               # CLI explícita: sync / run / inspect
    docs/retell-simulation-testing-plan.md

Cada caso tendrá un slug estable y specVersion en el nombre, por ejemplo sim-v1/peluqueria/reserva-corte-mechas. El CLI listará definiciones por llm_id, creará las ausentes y actualizará solo el payload canónico cambiado; no debe duplicarlas. Tras un piloto se decidirá entre resolver IDs por nombre (menos estado local) o un manifiesto versionado slug → ID (más trazabilidad).

- Batch de humo por nicho: 3–4 rutas críticas antes de cambios pequeños.
- Batch completo por nicho/versión: todos los 6–7 casos, un response engine por LLM.
- Suite transversal: lanza los cinco batches y conserva sus cinco job IDs; se usa ante cambios comunes de prompt, tools, variables o análisis.
- Estabilidad: ejecutar humo tres veces y considerar regresión crítica si falla en 2+ repeticiones. Mantener fijo por versión el modelo simulador; propuesta inicial: gpt-5-mini.
- Informe: commit, versión de catálogo, job ID, timestamp, contadores, explicación y transcripción. error bloquea el resultado y no se interpreta como fallo conversacional.

Calendario: manual durante el piloto y al editar casos; humo antes de cada cambio de prompt, schema/orden de tools, variables, businessDetails o análisis; completo antes de desplegar un cambio de agente. CI empieza como workflow manual/dispatch con secreto de Retell de desarrollo y sin secretos en logs. Pasará a required check solo después de medir flakiness, cuotas y coste de la cuenta durante varias semanas; jamás usa producción ni números Telnyx.

## Seguridad y decisiones abiertas

- Las cuentas existentes se usan como response_engine de desarrollo; el agent_id queda para trazabilidad, pero la simulación se ejecuta contra llm_id.
- Los casos de documento requieren que cada cuenta fixture tenga businessDetails/documento estable, no sensible y con una respuesta única. Primero hay que inventariar botbook; si falta, crear una fixture de desarrollo.
- Fechas futuras y variables falsas evitan depender de BD y calendario. No versionar API keys, PII, transcripciones de producción ni tokens.
- Los mocks any deben cubrir toda tool alcanzable; partial_match solo comprueba deliberadamente profesional/servicio/fecha.

Antes de implementar necesito estas decisiones:

1. ¿Confirmas que cancelar/modificar debe aprobar por tomar recado y escalar mientras no haya tools para localizar, modificar o cancelar? Actualmente el producto no expone ninguna de esas tools.
2. ¿Qué política no sensible y exacta fijamos en cada cuenta fixture para los cinco casos de documento?
3. ¿Aceptas gpt-5-mini y 3 repeticiones para el piloto o prefieres otro modelo/umbral?
4. ¿Prefieres manifiesto slug → ID o resolución por nombre al sincronizar?
5. Para CI, ¿umbral inicial de cero fallos, 2 de 3 para críticos o solo informe no bloqueante?

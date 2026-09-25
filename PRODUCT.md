# Product

<!-- impeccable:product-schema 1 -->

> Los encabezados de sección se mantienen en inglés porque son identificadores de esquema que
> las herramientas de Impeccable parsean. Todo el contenido va en español, como el resto del
> proyecto.

## Platform

web

## Users

**Usuario principal (cliente de pago):** dueño o gerente de un pequeño negocio de servicios en
España — peluquería, barbería, salón de uñas, centro de estética o clínica de fisioterapia.
Negocios de 1 a 20 empleados. Perfil no técnico, con baja tolerancia a la jerga y a la fricción.

Su situación real es la que define el producto: trabaja de cara al público con las manos
ocupadas — cortando, en cabina, en camilla — y el teléfono suena mientras atiende. No puede
cogerlo. El trabajo que quiere resuelto es que **ninguna llamada se pierda y que las citas
entren solas en su agenda**, configurándolo una vez y olvidándose.

Una cuenta equivale a un negocio y a una persona: el modelo `User` no tiene roles ni
multiusuario (`backend/prisma/schema.prisma:391`). Quien se registra es quien administra. No existe hoy
la figura de empleado con acceso limitado al panel.

**Usuario secundario (quien llama):** el cliente final del negocio, que marca el número y habla
con el agente de voz. Habla español, espera una respuesta natural y rápida y no debería notar
que habla con una IA torpe. No es usuario de la interfaz — su experiencia entera ocurre por
teléfono — pero es quien juzga si el producto funciona.

## Product Purpose

Alhabla es un SaaS multi-tenant que da a cada negocio uno o más **recepcionistas de voz con IA**
que atienden las llamadas entrantes, responden preguntas, consultan el horario del negocio,
comprueban disponibilidad y reservan la cita directamente en el calendario de Google, Outlook o
Apple/iCloud del negocio.

Existe porque en estos sectores **llamada perdida = cita perdida = ingreso perdido**, y el dueño
no tiene ni recepcionista ni forma de contestar mientras trabaja.

El éxito se mide en citas que antes se caían y ahora entran, no en minutos hablados ni en
conversaciones mantenidas. De ahí que el producto lleve calculadora de pérdida de ingresos
(`RevenueLossCalculator`) y precios argumentados por ROI en `/planes`.

## Positioning

Lo que un producto vecino no podría copiar honestamente:

- **Reserva verificada, no conversación simpática.** El agente tiene prohibido inventar datos: el
  prompt le obliga a pasar por `check_business_hours` y `check_availability` antes de
  `book_appointment`. La agenda real del negocio es la fuente de verdad, no una promesa que
  luego hay que repasar a mano.
- **Vertical, no constructor genérico de agentes.** Cinco nichos españoles concretos con
  plantillas de servicios, copy, preguntas frecuentes y textos de onboarding propios
  (`web/src/lib/business-type.ts`, `web/src/lib/niche-landings.ts`). Una peluquería y una
  clínica de fisioterapia no leen ni configuran lo mismo.
- **Reparto por especialidad, no cola ciega.** Cada profesional tiene un nivel por servicio
  (especialista / lo hace / no sugerir). El agente recomienda al especialista una vez y reserva
  igualmente si el cliente insiste; nunca dice que alguien «no se le da bien».
- **El Gestor: el negocio entero se administra por WhatsApp, no solo la agenda.** El dueño
  cambia un precio, fija el horario semanal, cierra un día, da de alta o de baja a un
  profesional, o añade/mueve/cancela una cita — hablando con Alhabla por WhatsApp, sin entrar al
  panel. El Gestor propone la acción y solo la ejecuta tras un «Confirmar» explícito — nunca de
  forma autónoma. (Reabrir un día ya cerrado todavía exige el panel web, no WhatsApp.)
- **Voz diseñada para no sonar a robot, no solo "voz de IA".** Selección de voz por idioma y
  género sobre el catálogo Ultra de Telnyx, matiz emocional automático (`expressive_mode`) y un
  fondo sutil de oficina para que la llamada no suene artificialmente silenciosa. La detección de
  turno de palabra corre en Deepgram Flux, pensado para interrumpir y ser interrumpido de forma
  natural en vez de esperar un silencio largo.
- **Proveedor primario con respaldo real, no una promesa sin implementar.** Telnyx orquesta hoy
  tanto las llamadas reales como la demo pública; Retell.ai, con certificación RGPD, queda
  sincronizado como respaldo en caliente ante una caída.

## Operating Context

- **Alta guiada:** el registro empieza en la web pública (`alhabla.ai/register`) y entra en la
  app con un pase de un solo uso; dentro de la app sigue Google Places → nicho → servicios →
  equipo → calendario → checkout de Stripe. Los pasos intermedios se pueden saltar y completar
  después en `/agente`. El checkout es obligatorio para terminar el registro.
- **Escena de configuración:** a menudo desde el móvil o un portátil, de pie, entre cliente y
  cliente. El tiempo disponible es corto y interrumpible.
- **Uso diario:** poco y breve. Se entra al panel a mirar llamadas, transcripciones, resultados
  y próximas citas. No es una herramienta de uso continuo ni un puesto de trabajo.
- **Herramientas que el negocio ya tiene:** Google Calendar, Outlook o Apple/iCloud como agenda
  real, su número de teléfono actual, y el teléfono como canal principal de reserva.
- **Evaluación antes de comprar:** demo de voz pública en el navegador (requiere micrófono y
  WebRTC, vía Telnyx) y la calculadora de pérdida de ingresos.
- **Comercial:** prueba de 7 días y suscripción Stripe. `inicio` 69 €/mes (100 min, 0,45 €/min
  extra), `pro` 149 €/mes (400 min, 0,40 €/min extra, plan destacado), `scale` 299 €/mes
  (1000 min, 0,35 €/min extra).

## Capabilities and Constraints

**Capacidades confirmadas**

- Agentes de voz por negocio con tono (`warm` / `professional` / `direct`), objetivo
  (`bookings` / `customer_service` / `lead_capture`), estilo de respuesta
  (`concise` / `balanced`) y escalado (`take_message` / `request_callback`) configurables.
- Número de España (Telnyx) aprovisionado automáticamente tras el checkout.
- Registro de llamadas con transcripción, grabación y clasificación de resultado.
- Horario de negocio, catálogo de servicios, profesionales y capacidad de reserva.
- Integración de calendario con Google, Outlook y Apple/iCloud (CalDAV), incluido el aviso de
  reconexión cuando el refresh token o la contraseña de aplicación caduca.
- Reparto de citas por especialidad: cada profesional tiene un nivel por servicio (especialista /
  lo hace / no sugerir) que el agente usa para recomendar una vez, sin descartar al resto.
- El Gestor: el dueño administra precios, horario semanal, cierres, altas/bajas de profesionales
  y reservas (añadir, mover, cancelar) por WhatsApp, con un patrón de proponer y confirmar —
  nunca ejecuta sin que el dueño pulse «Confirmar». Reabrir un día ya cerrado no está aún en
  WhatsApp (requiere el panel).
- Confirmación y recordatorio de cita por WhatsApp al cliente final, y lista de espera cuando no
  hay hueco disponible.
- Número de teléfono principal del negocio configurable desde ajustes.
- Facturación: checkout embebido, portal de cliente y resumen de suscripción.

**Terminología del producto** (visible al usuario)

«Recepcionista virtual», «agente de voz», «llamadas», «citas», «servicios», «profesionales»,
«horario», «minutos incluidos», «el Gestor», «lista de espera». Nunca «LLM», «modelo», «prompt»,
«orquestador», «webhook», «API» ni «asistente Retell».

**Restricciones duras**

- Idioma del agente `es-ES` y zona horaria `Europe/Madrid` por defecto.
- Sin roles ni acceso multiusuario por negocio.
- Duración de servicios 5–480 min; capacidad de reserva 1–50 (validación de backend). El alta
  permite hasta 20 profesionales por interfaz, pero el tope real que aplica el backend es por
  plan: 3 en inicio, 10 en pro, sin límite en scale.
- Horario: 7 días, máximo 3 intervalos no solapados por día, formato `HH:mm`.
- La completitud del onboarding se calcula en vivo desde los datos del negocio; solo
  `dismissedAt` y `completedAt` se persisten.
- La demo de voz necesita navegador moderno con WebRTC y permiso de micrófono; no hay
  alternativa sin audio.

**Decisiones abiertas — no inventar una respuesta**

- No hay objetivos numéricos de rendimiento ni matriz de navegadores soportados definidos.
  `next/core-web-vitals` es hoy el único listón automatizado.
- No hay decisión sobre multiusuario/roles por negocio.

## Brand Commitments

- **Nombre:** Alhabla.
- **Idioma:** español de España, siempre, con tuteo en la interfaz.
- **Registro:** confianza tranquila y profesional. Cercano pero serio. Ni corporativo
  acartonado ni startup con emojis.
- **Concreto sobre abstracto:** el copy se apoya en números y resultados verificables — minutos,
  euros por minuto, citas recuperadas, ROI.
- **Enfocado al dolor, sin alarmismo:** se nombra el problema y se cuantifica la solución; no se
  exagera.
- **Sin jerga de IA:** el usuario compra una recepcionista, no una inteligencia artificial.
- **Errores:** en español, accionables y sin culpar al usuario. Los 5xx genéricos del backend
  deben traducirse a algo humano en la interfaz.
- **Estética comprometida:** SaaS conservadora y profesional para negocios tradicionales
  españoles; explícitamente no el look genérico de startup ni de app de consumo. El sistema
  visual concreto vive fuera de este archivo.
- **Voz del agente telefónico:** cálida y eficiente, con matiz emocional automático
  (`expressive_mode`) y detección de turno de palabra en Deepgram Flux para interrupciones
  naturales — no una voz robótica que espera silencio. Mensaje inicial por defecto: «Hola, soy la
  recepcionista virtual. ¿En qué te ayudo?».

## Evidence on Hand

**Lo que existe y es real**

- Más de quince estadísticas de sector con fuente citada en
  `web/src/lib/niche-landings.ts` — El Confidencial Digital, Estética Magazine, Zenoti,
  STANPA / El Periódico, Doctoralia, safina.ai, heilo.io, entre otras.
- Citas textuales de profesionales del sector recogidas en prensa: Excelsior Barber Studio
  (Diario de Mallorca), David Aranda de Estetical (Crónica Global), Estetical (Facebook).
  **Hablan del problema, no de Alhabla.** No son testimonios de cliente y no deben presentarse
  como tales.
- Producto funcional y demostrable: demo de voz pública en el navegador.

**Ausencias que ningún trabajo futuro debe rellenar inventando**

Alhabla está en **prelanzamiento: no hay clientes de pago**. Por tanto **no existen**, y no se
pueden fabricar ni insinuar:

- testimonios ni casos de éxito de clientes de Alhabla;
- logos de clientes ni recuentos del tipo «X negocios ya confían»;
- métricas propias del producto (llamadas gestionadas, citas recuperadas, tasa de acierto,
  valoraciones);
- premios, apariciones en prensa sobre Alhabla o cifras de facturación.

Toda cifra publicada debe llevar una fuente externa verificable, como ya hacen las landings de
nicho. Cuando haga falta prueba en una superficie y no la haya, la salida correcta es enseñar el
producto funcionando (demo, transcripción real, la calculadora), no fabricar prueba social.

## Product Principles

1. **Cero llamadas perdidas es la promesa.** Todo se argumenta y se mide contra ingresos
   recuperados, no contra funcionalidades.
2. **Configurar una vez y olvidarse.** Cada pantalla debe acercar al usuario al «ya está»,
   nunca convertirlo en operador de su propio software. La configuración operativa de la
   recepcionista vive en `/agente`; la identidad, seguridad y administración de la cuenta viven
   en `/ajustes`. No mezclar ambos mundos: separar «cómo atiende mi recepcionista» de «cómo
   protejo y gestiono mi cuenta» reduce la carga cognitiva.
3. **La agenda del negocio manda.** El producto nunca inventa disponibilidad ni promete un hueco
   que no existe; verificar antes de reservar es innegociable.
4. **Vender una recepcionista, no una IA.** El vocabulario, la prueba y las expectativas se
   plantean en términos del negocio, no de la tecnología.
5. **España primero, sin cerrarse la puerta.** Se optimiza sin reservas para español de España,
   euros y `Europe/Madrid`, pero se evitan decisiones estructurales que impidan LATAM o el resto
   de la UE más adelante.

## Accessibility & Inclusion

Listón comprometido: **WCAG 2.1 nivel AA**, aplicado con prioridad a las superficies públicas y
de conversión — landing, landings de nicho, registro, planes y checkout — por la European
Accessibility Act, vigente para servicios vendidos online en la UE desde junio de 2025.

Necesidades específicas conocidas de esta audiencia:

- Se configura desde el móvil, con frecuencia de pie y con prisa: objetivos táctiles amplios y
  formularios que toleren la interrupción.
- Usuarios no técnicos y de edades variadas: contraste y tamaños de texto cómodos, sin depender
  del color como único portador de significado.
- La demo de voz depende de audio y micrófono. No hay alternativa accesible equivalente hoy; si
  se mantiene como prueba principal, necesita una vía paralela no auditiva para entender qué
  hace el producto.

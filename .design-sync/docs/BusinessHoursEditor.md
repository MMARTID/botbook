---
category: Formularios
---
Editor semanal del horario del negocio. Cada día se activa o desactiva y admite
hasta tres intervalos, que es como se representa el horario partido habitual en
España — mañana y tarde con cierre al mediodía. Debajo gestiona los días
cerrados sueltos (festivos, puentes) con fecha y motivo.

Pinta su propio `SettingsSection` plegable (`open` / `onToggle`), con el
resumen del horario y la zona horaria (`timeZone`) en la cabecera. No es
controlado: toma `value` como punto de partida (si no es un horario válido, usa
`DEFAULT_BUSINESS_SCHEDULE`, L–V 09:00–18:00), edita en su estado interno y
entrega el `BusinessSchedule` completo en `onSave`; `isSaving` mientras guarda.
No valida que los intervalos no se solapen: eso queda para quien guarda.

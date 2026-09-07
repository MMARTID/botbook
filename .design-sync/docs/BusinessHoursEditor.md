---
category: Formularios
---
Editor semanal del horario del negocio, montado dentro de un `SettingsSection`
(por eso recibe `open` / `onToggle`). Cada día se activa o desactiva y admite
varios intervalos, que es como se representa el horario partido habitual en
España — mañana y tarde con cierre al mediodía.

`value` es un `BusinessSchedule` (`{ version: 1, week: { monday: { enabled,
intervals: [{ start, end }] }, … } }`). `DEFAULT_BUSINESS_SCHEDULE` exporta el
punto de partida L–V 09:00–18:00. `onSave` recibe el horario completo ya
validado; el componente no guarda nada por su cuenta.

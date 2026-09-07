---
category: Formularios
---
Ajustes de comportamiento del agente de voz: voz, tono, objetivo principal,
estilo de respuesta y qué hacer cuando no puede resolver. Cada campo es una
fila de opciones excluyentes con su descripción, no un `<select>`, para que el
dueño del negocio lea las consecuencias de cada opción antes de elegir.

Va dentro de un `SettingsSection` (de ahí `open` / `onToggle`). Es controlado:
`value` + `onChange`, y `onSave` para persistir. `DEFAULT_AGENT_SETTINGS` trae
la configuración de partida.

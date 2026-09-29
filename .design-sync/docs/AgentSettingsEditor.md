---
category: Formularios
---
Ajustes de comportamiento del agente de voz: idiomas de atención (el español
siempre activo), voz (femenina o masculina, y en qué idioma), tono, objetivo
principal, estilo de respuesta y qué hacer cuando no puede resolver. Cada campo
es una fila de opciones excluyentes con su descripción, no un `<select>`, para
que el dueño del negocio lea las consecuencias de cada opción antes de elegir.

Pinta su propio `SettingsSection` plegable (de ahí `open` / `onToggle`), con el
resumen de la configuración en la cabecera: no lo envuelvas en otro. Es
controlado: `value` + `onChange`, `onSave` (sin argumentos) para persistir e
`isSaving` mientras guarda. `voiceLocked` bloquea voz e idiomas cuando el plan
no los incluye. `DEFAULT_AGENT_SETTINGS` trae la configuración de partida.

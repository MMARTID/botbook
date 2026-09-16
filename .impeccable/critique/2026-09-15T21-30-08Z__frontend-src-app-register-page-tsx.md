---
target: register page (/register)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/miguelmartin/AsistAI/frontend/src/app/register/page.tsx"
target_fingerprint: "sha256:dfa951b4955a96ed5b56f336066bae539174e114cac4ef50fa1de29f477a9e72"
target_path: /Users/miguelmartin/AsistAI/frontend/src/app/register/page.tsx
timestamp: 2026-09-15T21-30-08Z
slug: frontend-src-app-register-page-tsx
---
# Crítica de diseño + auditoría técnica — /register

Method: dual-agent (A: a07bf5c131e82dd3e · B: a87f9c028f1d369c7)

## Design Health Score
1 Visibilidad 3/4 · 2 Mundo real 3/4 · 3 Control 3/4 · 4 Consistencia 2/4 (no heredó los arreglos de /login) · 5 Prevención errores 2/4 · 6 Reconocimiento 4/4 · 7 Flexibilidad 3/4 · 8 Estética 3/4 · 9 Recuperación de errores 1/4 · 10 Ayuda 3/4.
Total: 27/40

## Veredicto de especificidad
Específico de Alhabla visualmente, pero es casi un clon de /login sin los arreglos ya aplicados ahí — dos pantallas hermanas que deberían compartir el mismo patrón endurecido divergieron.

## Lo que funciona
1. El patrón de bloquear envío + botón de Google hasta aceptar términos es correcto (prevención de errores legal y funcionalmente sólida) — verificado en vivo con capturas: ambos botones muestran opacity 0.6/cursor not-allowed antes de marcar, y pasan a estado normal después.
2. El plan/nicho se propaga correctamente por la URL a través del registro multi-paso.
3. Contención visual: tan ordenado como /login pese a tener más campos.

## Problemas prioritarios (con estado tras el arreglo)
[P1] Register no heredó los arreglos de accesibilidad de /login — ARREGLADO: id/htmlFor en email y contraseña, autoComplete ("email"/"new-password", correcto para creación de cuenta), minLength=8, divisor "O CON EMAIL" de #a1a1aa a #71717a, anillo de foco morado en los tres enlaces de texto (Términos, Privacidad, Inicia sesión).
[P1] Mensaje de error causaba salto de layout y no se anunciaba — ARREGLADO con min-h-5 + role="alert".
[Técnico, hallazgo B] Área clicable de la casilla de términos por debajo de 44px (40px vía el label) — ARREGLADO a 52px con min-h-11 + padding vertical en el label.
[P2] Dos validaciones custom en handleSubmit (EU null, !acceptedTerms) son código muerto — el required nativo y el disabled del botón ya bloquean el envío antes de que el usuario pueda disparar esos mensajes. No se tocó: no es un bug visible, señalado para una limpieza futura.
[P3] Copy "RGPD" sin explicar, justo antes de crear la cuenta — PENDIENTE, decisión de producto: ¿mover la pregunta de UE a /register/business (que ya existe como paso 2) en vez de bloquear la creación de cuenta con una pregunta de cumplimiento legal? No se tocó sin confirmar con el usuario.

## Alertas de persona
Dueña de peluquería registrándose por primera vez en el móvil: el botón de Google SÍ se ve correctamente deshabilitado (opacity+cursor verificados en vivo, contradice la hipótesis inicial de Assessment A) — el riesgo real era la falta de autoComplete y las etiquetas sin asociar, ya arreglado.
Usuaria que no sabe qué es "RGPD": sigue sin resolver — pendiente de decisión de producto sobre mover la pregunta a /register/business.

## Preguntas provocadoras
1. Si /register/business ya existe como paso dedicado a datos del negocio, ¿por qué la pregunta de cumplimiento UE vive en la primera pantalla en vez de ahí?
2. Dado que /login ya se auditó y arregló para este mismo conjunto de problemas, ¿vale la pena un checklist o componente compartido de "formulario de auth" para que estos arreglos no haya que redescubrirlos página por página?

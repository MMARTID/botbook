---
target: login page (/login)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/Users/miguelmartin/AsistAI/frontend/src/app/login/page.tsx"
target_fingerprint: "sha256:806f61c6e24f73f1c243fcf4a23b77a0c7f80b1356e7e4095219efc8e5d8c2b9"
target_path: /Users/miguelmartin/AsistAI/frontend/src/app/login/page.tsx
timestamp: 2026-09-15T21-25-27Z
slug: frontend-src-app-login-page-tsx
---
# Crítica de diseño + auditoría técnica — /login

Method: dual-agent (A: a15c5b411467f1918 · B: a89bfc8133cdfa118)

## Design Health Score
1 Visibilidad 2/4 · 2 Mundo real 3/4 · 3 Control 2/4 · 4 Consistencia 3/4 · 5 Prevención errores 1/4 · 6 Reconocimiento 3/4 · 7 Flexibilidad 2/4 · 8 Estética 4/4 · 9 Recuperación de errores 0/4 · 10 Ayuda 2/4.
Total: 22/40 — bajo para una página tan simple, arrastrado por #9 y #3.

## Veredicto de especificidad
El BrandMark, el campo de partículas y el botón negro sí marcan la página como Alhabla; el formulario en sí (Google + email/contraseña + "¿no tienes cuenta?") es el shell de login más genérico posible, sin calidez contextual para el dueño de negocio que vuelve.

## Lo que funciona
1. Fidelidad de marca al token system (campos píldora, anillo morado, font-black).
2. Foco visible correcto en campos y botón Google.
3. El aviso de términos queda bien acotado al botón de Google, no como disclaimer genérico de toda la página.

## Problemas prioritarios (con estado tras el arreglo)
[P0] Mensaje de error genérico sin diferenciar credenciales de red — ARREGLADO: ahora distingue 401 ("Email o contraseña incorrectos"), otro status ("Error al iniciar sesión...") y sin respuesta ("No se pudo conectar...").
[P0] Sin ruta de recuperación de contraseña — PENDIENTE, requiere decisión de producto/backend (no hay endpoint ni página hoy). Backlog.
[P1] El mensaje de error desplazaba el botón "Entrar" al aparecer — ARREGLADO con min-h-5 reservado.
[P1] Sin autoComplete en los campos — ARREGLADO (email/current-password).
[P1 técnico] Labels sin asociación programática (sin htmlFor/id) — ARREGLADO, confirmado en DOM vivo.
[P2] Sin diferenciación Google vs. email — mitigado: Google está bloqueado en producción (isProductionBuild(), muestra "coming soon"), así que el riesgo real hoy es solo en dev. No se tocó.
[P3] Sin prevalidación de longitud de contraseña — ARREGLADO con minLength=8 nativo.
[Técnico, hallazgo B] Contraste del divisor "O CON EMAIL" (#a1a1aa, 2.56:1, falla AA) — ARREGLADO a #71717a (4.83:1).
[Técnico, hallazgo B] Los tres enlaces de texto (Términos, Privacidad, Regístrate) sin anillo de foco morado, solo el outline por defecto del navegador — ARREGLADO con focus-visible:ring en los tres.
[Técnico, hallazgo B] Objetivos táctiles de los enlaces inline muy por debajo de 44px — NO arreglado a propósito: son enlaces dentro de una frase de texto legal/auxiliar, forzar 44px rompería la lectura del párrafo. Juicio de diseño, no bug.
[Técnico, hallazgo B] Backend devuelve 500 (no 401) en un intento de login inválido en dev — posible bug de backend fuera del alcance de esta revisión de frontend, señalado para quien mantenga backend/src/modules/auth.

## Alertas de persona
Dueña que vuelve a entrar con el móvil, con prisa: se beneficia directamente de autoComplete (ya arreglado) y del mensaje de error diferenciado (ya arreglado).
Usuaria que escribió mal la contraseña y necesita recuperarla: sigue sin camino hoy — recomendación pendiente de decisión de producto.

## Preguntas provocadoras
1. Si PRODUCT.md exige errores "accionables y sin culpar al usuario" como regla de marca, ¿por qué la pantalla de mayor riesgo de fallo (login) tenía el mensaje más vago del sitio? (Corregido en esta pasada.)
2. Dado que Google está bloqueado en producción, ¿tiene sentido seguir mostrando el botón completo con "Continuar con Google" en vez de un estado explícito de "próximamente" visible antes del clic?

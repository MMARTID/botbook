---
category: Marketing
---
Primer viewport de las landings por sector: una sola columna centrada con los
hilos de voz animados (`HeroHilos`) detrás. De arriba abajo: badge, titular
`font-black` con una frase subrayada (`heroHighlight`), subtítulo, dos CTAs
—«Escuchar la demo» (`.btn-primary`, abre `DemoVoiceCall`) y «Empezar 7 días
gratis» (`.btn-secondary`, a `/planes` con el sector)— y tres checks: «Mismo
número de siempre», «Google, Outlook o iCloud» y «Sin permanencia».

Con un `NicheLandingContent` (`nicheLandings.peluqueria`, `.barberia`, …) toma
su copy y su `accent`: badge, subrayado, checks y los pulsos de los hilos van
en el color del sector. Sin `content` pinta un hero genérico en morado de marca
que hoy no usa ninguna página: la portada (`/`) tiene su propio hero.

Es ancho completo: no lo metas en una columna estrecha. La sección no puede
llevar fondo propio: los hilos viven en `-z-10` dentro de `relative isolate`.

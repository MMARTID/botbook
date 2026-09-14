---
name: animation-evaluator
description: Evalúa secuencias de animación y scrollytelling generando una tira de fotogramas (storyboard) en una sola imagen para inspección visual.
---

# Instrucciones de Evaluación Visual

Cuando se te pida evaluar o revisar una animación o sección de scroll:

1. **Si es un componente Remotion independiente**:
   - Renderiza 5 fotogramas clave equidistantes (frames 0, 30, 60, 90, 120):
     ```bash
     npx remotion still Root Comps/Scene out/frame-0.png --frame=0
     npx remotion still Root Comps/Scene out/frame-30.png --frame=30
     npx remotion still Root Comps/Scene out/frame-60.png --frame=60
     npx remotion still Root Comps/Scene out/frame-90.png --frame=90
     npx remotion still Root Comps/Scene out/frame-120.png --frame=120
     ```
   - Combínalos en una tira horizontal con ImageMagick o FFmpeg:
     ```bash
     ffmpeg -i out/frame-%d0.png -filter_complex hstack=inputs=5 out/storyboard.png
     ```

2. **Si es una sección con Scroll (Scrollytelling en navegador)**:
   - Ejecuta el script auxiliar de captura por scroll con Playwright:
     ```bash
     node .agents/skills/animation-evaluator/capture-scroll.js
     ```

3. **Inspección**:
   - Abre e inspecciona `out/storyboard.png`.
   - Revisa continuidad, solapamiento de elementos y curvas de velocidad.
   - Ajusta los valores de `spring` o los puntos clave de scroll según lo observado.

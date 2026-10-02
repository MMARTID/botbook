#!/usr/bin/env bash
# Comprueba que los ficheros que comparten la app (frontend/) y la web (web/)
# siguen siendo idénticos byte a byte.
#
# Las dos son proyectos Next independientes (cada una con su package.json y su
# proyecto de Vercel con root propio), así que un componente que usan las dos
# vive copiado en las dos en vez de en un paquete común. La copia solo aguanta
# si nadie la desalinea: google-analytics.tsx acabó con dos versiones
# distintas justo porque nada lo comprobaba. CI lo ejecuta en cada PR y en
# cada push a main (job «Copias compartidas app/web» de .github/workflows/ci.yml).
#
# Uso, desde cualquier carpeta del repo:
#   bash scripts/comprobar-copias-compartidas.sh
#
# ¿Un fichero nuevo que usan las dos? Cópialo idéntico en las dos y añádelo a
# la lista. ¿Uno que deja de compartirse? Quítalo de la lista.

set -euo pipefail

# Rutas relativas a frontend/src/ y a web/src/.
COPIAS_COMPARTIDAS=(
  components/back-link.tsx
  components/beta-pill.tsx
  components/brand-icons.tsx
  components/brand-mark.tsx
  components/facebook-auth-button.tsx
  components/google-analytics.tsx
  components/google-auth-button.tsx
  components/particle-field.tsx
  components/particle-mouse-layer.tsx
  components/range-slider.tsx
  hooks/use-focus-trap.ts
  lib/plans.ts
)

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Primero la lista completa, para ver de un vistazo qué se comprueba.
desalineadas=()
for ruta in "${COPIAS_COMPARTIDAS[@]}"; do
  if cmp -s "frontend/src/$ruta" "web/src/$ruta"; then
    echo "✓ $ruta"
  else
    echo "✗ $ruta"
    desalineadas+=("$ruta")
  fi
done

if [ "${#desalineadas[@]}" -eq 0 ]; then
  echo
  echo "Las ${#COPIAS_COMPARTIDAS[@]} copias compartidas entre frontend/src y web/src son idénticas."
  exit 0
fi

# Después, el detalle de cada una: el diff y qué copiar a dónde. En los diff,
# -N trata como vacía la copia que falta, así también se ve lo que falta.
# `|| true` porque diff sale con 1 cuando hay diferencias.
for ruta in "${desalineadas[@]}"; do
  app="frontend/src/$ruta"
  web="web/src/$ruta"
  echo
  if [ ! -f "$app" ] && [ ! -f "$web" ]; then
    echo "✗ $ruta no existe ni en la app ni en la web."
    echo "  Si ya no se comparte, quítalo de la lista de este script."
  elif [ ! -f "$web" ]; then
    echo "✗ Falta $web."
    diff -uN "$app" "$web" || true
    echo "  Cópialo desde la app:"
    echo "    cp $app $web"
  elif [ ! -f "$app" ]; then
    echo "✗ Falta $app."
    diff -uN "$app" "$web" || true
    echo "  Cópialo desde la web:"
    echo "    cp $web $app"
  else
    echo "✗ $ruta no es igual en la app y en la web:"
    diff -u "$app" "$web" || true
    echo "  Lleva el mismo cambio a las dos copiando la buena encima de la otra:"
    echo "    cp $app $web    # si la buena es la de la app"
    echo "    cp $web $app    # si la buena es la de la web"
  fi
done

echo
mensaje="Copias compartidas desalineadas entre frontend/src y web/src: ${#desalineadas[@]} de ${#COPIAS_COMPARTIDAS[@]}. El detalle está arriba."
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  # Anotación de GitHub: el motivo sale en el resumen del PR sin abrir el log.
  echo "::error::$mensaje"
else
  echo "$mensaje"
fi
exit 1

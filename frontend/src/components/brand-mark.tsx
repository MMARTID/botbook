import { useId } from "react";

/**
 * Marca abstracta de BotBook: un cuadrado redondeado morado con un mordisco
 * circular en la esquina. El mordisco es una máscara SVG real (no un círculo
 * pintado), así que deja ver lo que haya detrás — blanco en el header, negro
 * en superficies oscuras — sin necesitar una variante por fondo.
 */
export function BrandMark({ className }: { className?: string }) {
  const maskId = useId();

  return (
    <svg viewBox="0 0 40 40" role="img" aria-label="BotBook" className={className}>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <rect width="40" height="40" rx="12" fill="#fff" />
        <circle cx="29" cy="11" r="11" fill="#000" />
      </mask>
      <rect width="40" height="40" rx="12" fill="#8b5cf6" mask={`url(#${maskId})`} />
    </svg>
  );
}

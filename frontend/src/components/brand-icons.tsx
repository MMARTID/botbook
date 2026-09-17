/**
 * Logos de terceros que no cubre lucide-react (retiró las marcas a propósito)
 * ni @icons-pack/react-simple-icons (Microsoft pidió salir del catálogo).
 * Uso nominativo: identificar el servicio con el que se conecta, siguiendo
 * los colores oficiales de cada marca.
 */

/** Logotipo de Microsoft (cuatro cuadrados) — el que piden sus propias
 * guías para botones de conexión/inicio de sesión. */
export function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" aria-hidden="true" className={className}>
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

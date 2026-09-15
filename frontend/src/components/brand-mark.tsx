export function BrandMark({ className }: { className?: string }) {
  return (
    // El logo es un activo local pequeño reutilizado en chrome y formularios.
    // next/image genera una URL relativa que JSDOM no puede resolver en los tests.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/alhabla-isotipo.png"
      alt="Alhabla"
      className={className}
    />
  );
}

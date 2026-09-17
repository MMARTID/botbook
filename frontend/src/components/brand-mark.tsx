export function BrandMark({ className }: { className?: string }) {
  return (
    // El logo es un SVG vectorizado del isotipo (nítido a cualquier tamaño),
    // next/image genera una URL relativa que JSDOM no puede resolver en los tests.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/alhabla-isotipo.svg"
      alt="Alhabla"
      className={className}
    />
  );
}

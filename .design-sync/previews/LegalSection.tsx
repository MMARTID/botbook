import "./_sin-movimiento";
import * as React from "react";
import { LegalSection } from "alhabla-ui";

/** Uso canónico: un apartado de /legal/privacidad, con su prosa real. */
export function Apartado() {
  return (
    <div className="w-full max-w-2xl">
      <LegalSection title="Quién es el responsable">
        <p>
          El responsable del tratamiento de tus datos es el titular de Alhabla.
          Puedes escribirnos a{" "}
          <a
            href="mailto:hola@alhabla.ai"
            className="font-medium underline underline-offset-2"
          >
            hola@alhabla.ai
          </a>{" "}
          para cualquier cuestión relacionada con esta política o con tus datos.
        </p>
      </LegalSection>
    </div>
  );
}

/** Varios párrafos y énfasis: es el caso normal en las páginas legales. */
export function VariosParrafos() {
  return (
    <div className="w-full max-w-2xl">
      <LegalSection title="La demo de voz de la web">
        <p>
          Cuando pulsas «Escuchar demo gratuita» te pedimos permiso para usar el
          micrófono. Ese permiso sirve únicamente para mantener la conversación
          de prueba mientras la tienes abierta, y lo puedes revocar en cualquier
          momento desde tu navegador.
        </p>
        <p>
          La demo está configurada para{" "}
          <strong className="font-semibold">
            no grabar audio, no guardar la transcripción y no registrar la
            conversación
          </strong>
          . El texto que ves en pantalla durante la llamada se descarta al
          cerrarla.
        </p>
      </LegalSection>
    </div>
  );
}

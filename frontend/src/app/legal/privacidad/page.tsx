import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalTodo } from "@/components/legal-page";
import { absoluteUrl, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos trata Alhabla, con qué finalidad, quién los procesa y cómo ejercer tus derechos. Incluye el tratamiento de la demo de voz y de las llamadas atendidas por la recepcionista virtual.",
  alternates: {
    canonical: absoluteUrl("/legal/privacidad"),
  },
  openGraph: {
    title: `Política de privacidad | ${siteName}`,
    description: "Qué datos trata Alhabla, con qué finalidad y cómo ejercer tus derechos.",
    url: absoluteUrl("/legal/privacidad"),
    siteName,
    locale: "es_ES",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      description="Aquí te contamos qué datos tratamos, para qué, quién más interviene y qué puedes exigirnos. Sin cláusulas copiadas: solo lo que el producto hace de verdad."
      updatedAt="2026-08-16"
    >
      <LegalTodo>
        la razón social, el CIF, el domicilio fiscal y el correo del responsable del tratamiento. Mientras estén sin
        rellenar, esta página no cumple el artículo 13 del RGPD.
      </LegalTodo>

      <LegalSection title="Quién es el responsable">
        <p>
          El responsable del tratamiento de tus datos es el titular de Alhabla. Puedes escribirnos a{" "}
          <a href="mailto:hola@alhabla.ai" className="font-medium text-[#344038] underline underline-offset-2">
            hola@alhabla.ai
          </a>{" "}
          para cualquier cuestión relacionada con esta política o con tus datos.
        </p>
      </LegalSection>

      <LegalSection title="La demo de voz de la web">
        <p>
          Cuando pulsas «Escuchar demo gratuita» te pedimos permiso para usar el micrófono. Ese permiso sirve
          únicamente para mantener la conversación de prueba mientras la tienes abierta, y lo puedes revocar en
          cualquier momento desde tu navegador.
        </p>
        <p>
          La demo está configurada para <strong className="font-semibold text-[#1e2b22]">no grabar audio, no guardar
          la transcripción y no registrar la conversación</strong>. El texto que ves en pantalla durante la llamada se
          construye en tu propio navegador y desaparece al cerrar la ventana. La demo no crea ninguna cita real ni
          queda asociada a ninguna cuenta.
        </p>
        <p>
          La conversación se procesa a través de nuestro proveedor de voz para poder transcribir y responder en
          tiempo real. No la usamos para entrenar modelos.
        </p>
      </LegalSection>

      <LegalSection title="Datos de tu cuenta">
        <p>
          Si te registras, tratamos los datos necesarios para prestar el servicio: correo electrónico y contraseña
          (guardada siempre cifrada) o tu identificador de Google si entras con esa opción; y los datos del negocio
          que tú introduces — nombre, dirección, teléfono, horario, servicios, profesionales y el tipo de negocio.
        </p>
        <p>
          La base legal es la ejecución del contrato de suscripción. Sin esos datos no podemos configurar tu
          recepcionista ni reservar citas en tu agenda.
        </p>
      </LegalSection>

      <LegalSection title="Las llamadas que atiende tu recepcionista">
        <p>
          Esto es importante y conviene que lo sepas antes de contratar, porque afecta a las personas que llaman a tu
          negocio: las llamadas que atiende tu recepcionista virtual{" "}
          <strong className="font-semibold text-[#1e2b22]">se graban, se transcriben y se clasifican</strong> para que
          puedas consultarlas en tu panel, saber qué pidió cada cliente y comprobar que la cita se registró bien.
        </p>
        <p>
          Como titular del negocio eres responsable de informar a quien llama de que la llamada se está grabando y de
          contar con base legal para ello. La configuración del agente incluye el mensaje de bienvenida, que es el
          lugar natural para advertirlo.
        </p>
        <p>
          Las grabaciones y transcripciones se almacenan cifradas y solo son accesibles desde tu cuenta. Puedes
          solicitar su eliminación escribiéndonos.
        </p>
      </LegalSection>

      <LegalSection title="Tu calendario">
        <p>
          Si conectas Google Calendar o Outlook, te pedimos permiso para consultar tu disponibilidad y crear, modificar
          o cancelar citas. Guardamos un token de acceso que nos permite hacerlo en tu nombre; no leemos el contenido
          de tu correo ni de otros servicios.
        </p>
        <p>
          Puedes revocar ese acceso en cualquier momento desde los ajustes de seguridad de tu cuenta de Google o de
          Microsoft, o desde la sección de calendario de tu panel. Al revocarlo, la recepcionista deja de poder
          reservar.
        </p>
      </LegalSection>

      <LegalSection title="Con quién compartimos datos">
        <p>
          No vendemos tus datos. Trabajamos con proveedores que actúan como encargados del tratamiento y que son
          necesarios para que el servicio funcione:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-[#1e2b22]">Proveedor de voz.</strong> Las cuentas europeas se
            atienden con un proveedor con tratamiento en la Unión Europea, por cumplimiento del RGPD.
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Telefonía.</strong> Para asignar tu número y cursar las
            llamadas entrantes y salientes.
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Pagos.</strong> La suscripción se gestiona con Stripe.
            Nosotros no almacenamos los datos de tu tarjeta en ningún momento.
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Calendario.</strong> Google o Microsoft, según el que
            conectes.
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Almacenamiento y clasificación.</strong> Para guardar las
            grabaciones cifradas y para resumir automáticamente el resultado de cada llamada.
          </li>
        </ul>
        <LegalTodo>
          la lista nominal de encargados con su ubicación de tratamiento y la referencia de cada contrato de encargo
          (DPA), además de las garantías aplicables a cualquier transferencia internacional.
        </LegalTodo>
      </LegalSection>

      <LegalSection title="Cuánto tiempo conservamos los datos">
        <p>
          Los datos de tu cuenta se conservan mientras la suscripción esté activa. Al darla de baja los eliminamos o
          los anonimizamos, salvo los que debamos guardar por obligación legal, como la información de facturación.
        </p>
        <LegalTodo>
          los plazos concretos de conservación de grabaciones y transcripciones, y el plazo de borrado tras la baja.
        </LegalTodo>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Puedes solicitar acceso a tus datos, su rectificación o supresión, la limitación u oposición al tratamiento,
          y la portabilidad. Escríbenos a{" "}
          <a href="mailto:hola@alhabla.ai" className="font-medium text-[#344038] underline underline-offset-2">
            hola@alhabla.ai
          </a>{" "}
          y te responderemos en el plazo legal.
        </p>
        <p>
          Si consideras que no hemos atendido tu solicitud correctamente, puedes presentar una reclamación ante la
          Agencia Española de Protección de Datos.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Para que la aplicación funcione guardamos en tu navegador la sesión y algunas preferencias — por ejemplo, la
          estimación que hayas hecho en la calculadora de la web. Son datos técnicos, se quedan en tu dispositivo y no
          se usan para perfilarte ni para publicidad.
        </p>
        <LegalTodo>
          revisar esta sección si en el futuro se añade analítica o publicidad; en ese caso hará falta un banner de
          consentimiento previo.
        </LegalTodo>
      </LegalSection>

      <p className="max-w-[68ch] text-base leading-8 text-[#54634b]">
        ¿Te queda alguna duda antes de empezar? Está resuelta en las{" "}
        <Link href="/landing#preguntas" className="font-medium text-[#344038] underline underline-offset-2">
          preguntas frecuentes
        </Link>{" "}
        o escribiéndonos directamente.
      </p>
    </LegalPage>
  );
}

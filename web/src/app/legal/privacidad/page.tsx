import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { absoluteUrl, ogImages, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos trata Alhabla, con qué finalidad, quién los procesa y cómo ejercer tus derechos, incluidas las llamadas que atiende la recepcionista virtual.",
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
    images: ogImages(),
  },
  robots: { index: true, follow: true },
};

export default function PrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      description="Aquí te contamos qué datos tratamos, para qué, quién más interviene y qué puedes exigirnos. Sin cláusulas copiadas: solo lo que el producto hace de verdad."
      updatedAt="2026-09-20"
    >
      <LegalSection title="Quién es el responsable">
        <p>
          Esta política se aplica específicamente a <strong className="font-semibold text-[#1e2b22]">Alhabla</strong>.
          El responsable del tratamiento es <strong className="font-semibold text-[#1e2b22]">Miguel Martín
          Delgado</strong>, profesional autónomo con NIF 49456776Z y domicilio fiscal en Carrer Sot De Bacs 175,
          08470 Sant Celoni, Barcelona. Para cualquier cuestión sobre privacidad puedes escribir a{" "}
          <a href="mailto:privacidad@alhabla.ai" className="font-medium text-[#6d28d9] underline underline-offset-2">
            privacidad@alhabla.ai
          </a>{" "}
          . Alhabla es una actividad profesional de autónomo, no una sociedad mercantil.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos tratamos y de dónde proceden">
        <p>
          Los datos proceden principalmente de ti, del negocio que das de alta, de las personas que llaman a ese negocio
          y de los servicios que decides conectar. Según el uso, las categorías son: datos identificativos y de contacto,
          credenciales de acceso, información del negocio, datos de facturación, eventos y disponibilidad de calendario,
          grabaciones, transcripciones, resúmenes y metadatos de llamadas —como fecha, duración y número de origen o
          destino—, además de registros técnicos necesarios para operar y proteger el servicio.
        </p>
        <p>
          No solicitamos deliberadamente categorías especiales de datos. Si una persona revela información especialmente
          sensible durante una llamada, el negocio debe valorar si puede tratarla y configurar a su agente para no pedir
          datos que no sean necesarios para gestionar una consulta o cita.
        </p>
      </LegalSection>

      <LegalSection title="Para qué los usamos y con qué base legal">
        <ul className="list-disc space-y-2 pl-5">
          <li>Crear y administrar la cuenta, configurar la recepcionista y gestionar citas: ejecución del contrato.</li>
          <li>Facturar, atender obligaciones contables y responder a requerimientos legales: obligación legal.</li>
          <li>
            Prevenir fraude, proteger cuentas, resolver incidencias y defender reclamaciones: interés legítimo en la
            seguridad y continuidad del servicio.
          </li>
          <li>
            Procesar la demo y tratar los datos opcionales de un negocio seleccionado: consentimiento, que puedes retirar
            sin afectar al resto del servicio.
          </li>
        </ul>
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
        <p>
          Si seleccionas un negocio y marcas voluntariamente la casilla de consentimiento, podemos conservar sus
          datos públicos de identificación para evaluar y mejorar las demos y el servicio. Ese uso es opcional, no
          afecta a la conversación de prueba y puedes retirar tu consentimiento escribiendo a privacidad@alhabla.ai.
        </p>
      </LegalSection>

      <LegalSection title="Datos de tu cuenta">
        <p>
          Si te registras, tratamos los datos necesarios para prestar el servicio: correo electrónico y contraseña
          (guardada mediante hash, no en texto legible) o tu identificador de Google si entras con esa opción; y los datos del negocio
          que tú introduces — nombre, dirección, teléfono, horario, servicios, profesionales y el tipo de negocio.
        </p>
        <p>
          La base legal es la ejecución del contrato de suscripción. Sin esos datos no podemos configurar tu
          recepcionista ni reservar citas en tu agenda.
        </p>
        <p>
          También tratamos los datos técnicos imprescindibles para proteger el servicio, prevenir usos indebidos y
          atender incidencias. La base legal de ese tratamiento es nuestro interés legítimo en mantener la seguridad y
          disponibilidad de Alhabla.
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
          Respecto de los datos de las personas que llaman a tu negocio, este determina las finalidades y actúa como
          responsable del tratamiento; Alhabla los trata para prestar el servicio siguiendo sus instrucciones. Para
          los datos de tu cuenta, facturación y seguridad del servicio, Alhabla es responsable del tratamiento.
        </p>
        <p>
          Las grabaciones y transcripciones se almacenan cifradas y solo son accesibles desde tu cuenta. Puedes
          solicitar su eliminación escribiéndonos.
        </p>
      </LegalSection>

      <LegalSection title="Procesos automatizados y decisiones">
        <p>
          La recepcionista utiliza inteligencia artificial para comprender la llamada, producir una transcripción,
          clasificar su resultado y proponer o registrar una cita conforme a la configuración del negocio. No usamos esos
          procesos para adoptar decisiones automatizadas que produzcan efectos jurídicos o efectos equivalentes
          significativos sobre quien llama. La persona puede pedir atención humana o contactar directamente con el
          negocio cuando una respuesta o reserva no sea correcta.
        </p>
      </LegalSection>

      <LegalSection title="Tu calendario">
        <p>
          Si conectas Google Calendar o Outlook, te pedimos permiso para consultar tu disponibilidad y crear, modificar
          o cancelar citas. No leemos el contenido de tu correo, Drive, contactos ni otros servicios ajenos al
          calendario que conectas.
        </p>
        <p>
          En Google Calendar solicitamos únicamente los permisos <code>calendar.events</code>, para gestionar las
          citas, y <code>calendar.calendarlist.readonly</code>, para que puedas elegir el calendario que quieres
          conectar. Accedemos a los identificadores de los calendarios disponibles y a los datos de eventos necesarios
          para conocer ocupación, crear una reserva, modificarla o cancelarla. No solicitamos el permiso general de
          administración de calendarios.
        </p>
        <p>
          Los tokens de acceso y renovación se almacenan cifrados en reposo. Los usamos exclusivamente para prestar la
          funcionalidad de agenda solicitada por el negocio; no los vendemos, usamos para publicidad ni empleamos para
          entrenar modelos. Puedes revocar el acceso desde los ajustes de seguridad de Google o Microsoft, o desconectar
          el calendario desde el panel; en ambos casos la recepcionista deja de poder reservar. Cuando revocas el acceso,
          eliminamos las credenciales de conexión almacenadas.
        </p>
      </LegalSection>

      <LegalSection title="Datos de Google y uso limitado">
        <p>
          Los datos obtenidos mediante las APIs de Google se usan y transfieren solo cuando es necesario para ofrecer o
          mejorar la gestión de citas que has solicitado, para proteger el servicio frente a abuso o fraude, o para
          cumplir una obligación legal. El acceso humano a esos datos queda limitado a soporte solicitado por ti,
          seguridad o cumplimiento legal.
        </p>
        <p>
          Los datos obtenidos a través de las APIs de Google Workspace no se usan para desarrollar, mejorar ni entrenar
          modelos de inteligencia artificial o aprendizaje automático no personalizados. Tampoco se venden, se emplean
          para publicidad dirigida ni se transfieren a terceros para esos fines.
        </p>
        <p>
          El uso de los datos de Google por Alhabla se rige por la{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#6d28d9] underline underline-offset-2"
          >
            Política de Datos de Usuario de los Servicios API de Google
          </a>{" "}
          y por sus requisitos de uso limitado.
        </p>
      </LegalSection>

      <LegalSection title="Con quién compartimos datos">
        <p>
          No vendemos tus datos. Trabajamos con proveedores externos necesarios para que el servicio funcione:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-[#1e2b22]">Retell.</strong> Procesa la conversación de voz y las
            transcripciones para atender llamadas y elaborar sus resultados. Consulta su{" "}
            <a
              href="https://www.retellai.com/legal/privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#6d28d9] underline underline-offset-2"
            >
              política de privacidad
            </a>
            .
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Telnyx.</strong> Proporciona telefonía, mensajería y
            WhatsApp para cursar llamadas y comunicaciones del servicio. Puedes consultar su{" "}
            <a
              href="https://telnyx.com/privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#6d28d9] underline underline-offset-2"
            >
              política de privacidad
            </a>{" "}
            y su{" "}
            <a
              href="https://telnyx.com/legal/data-processing-addendum"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#6d28d9] underline underline-offset-2"
            >
              anexo de tratamiento de datos
            </a>
            .
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Stripe.</strong> Gestiona la suscripción y los pagos.
            Alhabla no almacena los datos completos de tu tarjeta.
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Google y Microsoft.</strong> Prestan los servicios de
            calendario que conectas voluntariamente.
          </li>
          <li>
            <strong className="font-semibold text-[#1e2b22]">Cloudflare R2, Vercel y Zoho Mail.</strong> Permiten,
            respectivamente, almacenar grabaciones cifradas, servir la aplicación y entregar correos transaccionales.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Transferencias internacionales">
        <p>
          Algunos proveedores pueden procesar datos fuera del Espacio Económico Europeo. Por ejemplo, Retell informa de
          que procesa principalmente datos en Estados Unidos; Telnyx publica los mecanismos que emplea para transferencias
          internacionales. Cuando corresponde, las transferencias se amparan en una decisión de adecuación, el Marco de
          Privacidad de Datos UE-EE. UU. o cláusulas contractuales tipo, según el proveedor y el tratamiento.
        </p>
        <p>
          Los proveedores solo reciben los datos necesarios para su función. Puedes pedir información actualizada sobre
          destinatarios y garantías aplicables escribiendo a privacidad@alhabla.ai.
        </p>
      </LegalSection>

      <LegalSection title="Cuánto tiempo conservamos los datos">
        <p>
          Las grabaciones y transcripciones se conservan durante 90 días y después se eliminan. Los datos de la cuenta,
          negocio, configuración y reservas se conservan mientras la suscripción esté activa y durante tres meses tras
          la baja, salvo que debamos conservarlos bloqueados para atender responsabilidades legales. Las credenciales de
          calendario se eliminan cuando revocas el acceso. Al terminar cada plazo, los datos se eliminan o se anonimizan,
          salvo conservación obligatoria o necesaria para formular, ejercer o defender reclamaciones.
        </p>
        <p>
          La información de facturación se conserva durante seis años, conforme a las obligaciones contables y fiscales
          aplicables.
        </p>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Puedes solicitar acceso a tus datos, su rectificación o supresión, la limitación u oposición al tratamiento,
          y la portabilidad; también puedes retirar el consentimiento cuando esa sea la base del tratamiento. Escríbenos a{" "}
          <a href="mailto:privacidad@alhabla.ai" className="font-medium text-[#6d28d9] underline underline-offset-2">
            privacidad@alhabla.ai
          </a>{" "}
          y te responderemos en el plazo legal, normalmente en un mes.
        </p>
        <p>
          Si consideras que no hemos atendido tu solicitud correctamente, puedes presentar una reclamación ante la{" "}
          <a
            href="https://www.aepd.es/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[#6d28d9] underline underline-offset-2"
          >
            Agencia Española de Protección de Datos
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Para que la aplicación funcione guardamos en tu navegador la sesión y algunas preferencias — por ejemplo, la
          estimación que hayas hecho en la calculadora de la web. Son datos técnicos, se quedan en tu dispositivo y no
          se usan para perfilarte ni para publicidad.
        </p>
        <p>
          Si incorporamos analítica, publicidad o cookies no técnicas, mostraremos antes un mecanismo de consentimiento
          que te permita aceptarlas, rechazarlas o configurarlas.
        </p>
      </LegalSection>

      <LegalSection title="Menores y cambios en esta política">
        <p>
          Alhabla es un servicio dirigido a negocios y no está diseñado para que lo contraten menores de edad. Si crees
          que hemos recibido datos de un menor sin la base legal necesaria, escríbenos a privacidad@alhabla.ai.
        </p>
        <p>
          Podemos actualizar esta política cuando cambie el servicio o la normativa. Indicaremos la fecha de la última
          actualización y, si el cambio es relevante, lo comunicaremos por los canales razonables antes de que sea
          aplicable.
        </p>
      </LegalSection>

      <p className="max-w-[68ch] text-base leading-8 text-[#54634b]">
        ¿Te queda alguna duda antes de empezar? Está resuelta en las{" "}
        <Link href="/landing#preguntas" className="font-medium text-[#6d28d9] underline underline-offset-2">
          preguntas frecuentes
        </Link>{" "}
        o escribiéndonos directamente.
      </p>
    </LegalPage>
  );
}

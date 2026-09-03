import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalTodo } from "@/components/legal-page";
import { absoluteUrl, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Aviso legal",
  description:
    "Titularidad del sitio, condiciones de uso, contratación de la suscripción y derecho de desistimiento de Alhabla.",
  alternates: {
    canonical: absoluteUrl("/legal/aviso-legal"),
  },
  openGraph: {
    title: `Aviso legal | ${siteName}`,
    description: "Titularidad, condiciones de uso y contratación de Alhabla.",
    url: absoluteUrl("/legal/aviso-legal"),
    siteName,
    locale: "es_ES",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function AvisoLegalPage() {
  return (
    <LegalPage
      title="Aviso legal"
      description="Quién está detrás de Alhabla, en qué condiciones puedes usarlo y qué implica contratar una suscripción."
      updatedAt="2026-09-03"
    >
      <LegalTodo>
        la razón social, el CIF, el domicilio social y los datos de inscripción registral. La Ley 34/2002 (LSSI) exige
        que esta información sea accesible antes de que nadie contrate.
      </LegalTodo>

      <LegalSection title="Titularidad del sitio">
        <p>
          Este sitio web y el servicio Alhabla son titularidad del prestador identificado más arriba. Puedes contactar
          con nosotros en{" "}
          <a href="mailto:hola@alhabla.ai" className="font-medium text-[#344038] underline underline-offset-2">
            hola@alhabla.ai
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Qué es el servicio">
        <p>
          Alhabla es un servicio de recepción telefónica: uno o varios agentes de voz atienden las llamadas de tu
          negocio, responden preguntas sobre tus servicios y horarios, comprueban tu disponibilidad real y reservan
          citas en tu calendario de Google o de Outlook.
        </p>
        <p>
          El servicio se presta como suscripción mensual. Tú mantienes tu número de teléfono habitual y las llamadas
          llegan a Alhabla mediante un desvío que activas desde tu propio terminal.
        </p>
      </LegalSection>

      <LegalSection title="Condiciones de uso">
        <p>
          Al usar Alhabla te comprometes a que la información que configures sobre tu negocio sea veraz, a informar a
          quien llama de que la llamada se graba, y a no utilizar el servicio para fines ilícitos ni para comunicaciones
          comerciales no solicitadas.
        </p>
        <p>
          Eres responsable de mantener la confidencialidad de tus credenciales. Una cuenta corresponde a un negocio y a
          la persona que lo administra.
        </p>
      </LegalSection>

      <LegalSection title="Contratación, prueba y precios">
        <p>
          La suscripción se contrata desde la web y se gestiona con Stripe. Los planes, los minutos incluidos y el coste
          por minuto adicional se muestran antes de contratar en la{" "}
          <Link href="/planes" className="font-medium text-[#344038] underline underline-offset-2">
            página de planes
          </Link>
          . Los precios se indican en euros y sin perjuicio de los impuestos que resulten aplicables.
        </p>
        <p>
          La suscripción incluye un periodo de prueba de 7 días. No hay compromiso de permanencia: puedes cambiar de
          plan o cancelar cuando quieras desde el portal de facturación de tu cuenta.
        </p>
        <LegalTodo>
          confirmar el tratamiento fiscal del IVA y si los precios mostrados lo incluyen, y precisar el momento exacto
          del primer cargo tras el periodo de prueba.
        </LegalTodo>
      </LegalSection>

      <LegalSection title="Desistimiento">
        <p>
          Si contratas como consumidor tienes derecho a desistir en los 14 días naturales siguientes a la contratación.
          Si contratas como empresa o profesional en el ejercicio de tu actividad, ese derecho no resulta aplicable.
        </p>
        <p>
          En cualquiera de los dos casos puedes cancelar la suscripción en cualquier momento y no se te volverá a
          cobrar en el siguiente periodo.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidad y responsabilidad">
        <p>
          Trabajamos para que el servicio esté disponible de forma continuada, pero depende de terceros — telefonía,
          proveedor de voz y tu proveedor de calendario — y de tu propia conexión. No garantizamos que el servicio esté
          libre de interrupciones.
        </p>
        <p>
          La recepcionista está configurada para no inventar información: comprueba tu horario y tu disponibilidad real
          antes de confirmar cualquier cita. Aun así, te recomendamos revisar tu agenda con normalidad.
        </p>
        <LegalTodo>
          revisar con asesoría jurídica los límites de responsabilidad y si procede publicar un acuerdo de nivel de
          servicio.
        </LegalTodo>
      </LegalSection>

      <LegalSection title="Propiedad intelectual">
        <p>
          Los contenidos de este sitio, la marca Alhabla y el software del servicio están protegidos por la normativa de
          propiedad intelectual e industrial. Los datos de tu negocio y las grabaciones de tus llamadas son tuyos.
        </p>
      </LegalSection>

      <LegalSection title="Protección de datos">
        <p>
          El tratamiento de datos personales se detalla en la{" "}
          <Link href="/legal/privacidad" className="font-medium text-[#344038] underline underline-offset-2">
            política de privacidad
          </Link>
          , que incluye qué ocurre con la demo de voz de la web y con las llamadas que atiende tu recepcionista.
        </p>
      </LegalSection>

      <LegalSection title="Encargo de tratamiento de los datos de tus clientes">
        <p>
          Esta cláusula regula un tratamiento distinto del anterior: no tus datos como titular de la cuenta, sino los
          datos personales de las personas que llaman a tu negocio (nombre, teléfono y el contenido de la llamada) que
          tu recepcionista virtual trata en tu nombre. En esa relación, tu negocio es el{" "}
          <strong className="font-semibold text-[#1e2b22]">responsable del tratamiento</strong> y Alhabla actúa como{" "}
          <strong className="font-semibold text-[#1e2b22]">encargado del tratamiento</strong>, conforme al artículo 28
          del RGPD. Aceptar estas condiciones al contratar el servicio constituye el contrato de encargo de tratamiento
          exigido por ese artículo — no hace falta firmar un documento aparte para empezar a usar Alhabla.
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Objeto, naturaleza y duración.</strong> Alhabla trata datos
          por tu cuenta para prestarte el servicio contratado: atender llamadas, transcribirlas, grabarlas, consultar
          tu disponibilidad y reservar citas en tu calendario. El tratamiento dura mientras tu suscripción esté activa
          y, tras la baja, durante el plazo de conservación indicado en la{" "}
          <Link href="/legal/privacidad" className="font-medium text-[#344038] underline underline-offset-2">
            política de privacidad
          </Link>
          .
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Tipo de datos y personas afectadas.</strong> Nombre,
          número de teléfono, y el contenido de la conversación (grabación y transcripción) de las personas que
          llaman a tu negocio para pedir información o reservar cita. No se tratan categorías especiales de datos
          salvo que la persona que llama las mencione por iniciativa propia.
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Instrucciones y confidencialidad.</strong> Alhabla trata
          estos datos solo siguiendo tus instrucciones — las que resultan de la configuración de tu cuenta y del
          funcionamiento normal del servicio — y no los usa para ningún fin propio ni de terceros. El personal con
          acceso está sujeto a un deber de confidencialidad.
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Medidas de seguridad.</strong> Las grabaciones y
          transcripciones se almacenan cifradas y solo son accesibles desde tu cuenta, conforme al artículo 32 del
          RGPD.
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Subencargados.</strong> Autorizas con carácter general que
          Alhabla recurra a los proveedores necesarios para prestar el servicio — voz, telefonía y almacenamiento,
          listados en la política de privacidad — bajo obligaciones de protección de datos equivalentes a las de esta
          cláusula. Si se incorpora un nuevo proveedor con acceso a estos datos, te lo comunicaremos con antelación
          razonable para que puedas oponerte.
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Asistencia al responsable.</strong> Te ayudamos a atender
          las solicitudes de derechos de las personas que llaman (acceso, rectificación, supresión) y, si se produjera
          una violación de seguridad de estos datos, te lo notificaremos sin dilación indebida.
        </p>
        <p>
          <strong className="font-semibold text-[#1e2b22]">Al finalizar la prestación.</strong> Cuando canceles la
          suscripción, a tu elección eliminamos o te devolvemos las grabaciones y transcripciones asociadas a tu
          negocio, salvo que debamos conservarlas por obligación legal.
        </p>
        <LegalTodo>
          la identidad completa del responsable (razón social, CIF y domicilio) que falta arriba en este documento —
          hasta entonces esta cláusula recoge el contenido mínimo del artículo 28.3 RGPD, pero no sustituye la revisión
          de un asesor legal antes de operar con clientes de pago reales. Si en el futuro algún cliente necesita un DPA
          firmado aparte (habitual en cuentas grandes o corporativas), se puede ofrecer sin conflicto con esta cláusula.
        </LegalTodo>
      </LegalSection>

      <LegalSection title="Legislación aplicable">
        <p>
          Esta relación se rige por la legislación española. Para cualquier controversia serán competentes los juzgados
          y tribunales que correspondan conforme a la normativa aplicable.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

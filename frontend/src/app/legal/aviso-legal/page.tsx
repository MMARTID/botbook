import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalTodo } from "@/components/legal-page";
import { absoluteUrl, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Aviso legal",
  description:
    "Titularidad del sitio, condiciones de uso, contratación de la suscripción y derecho de desistimiento de AsistAI.",
  alternates: {
    canonical: absoluteUrl("/legal/aviso-legal"),
  },
  openGraph: {
    title: `Aviso legal | ${siteName}`,
    description: "Titularidad, condiciones de uso y contratación de AsistAI.",
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
      description="Quién está detrás de AsistAI, en qué condiciones puedes usarlo y qué implica contratar una suscripción."
      updatedAt="2026-08-16"
    >
      <LegalTodo>
        la razón social, el CIF, el domicilio social y los datos de inscripción registral. La Ley 34/2002 (LSSI) exige
        que esta información sea accesible antes de que nadie contrate.
      </LegalTodo>

      <LegalSection title="Titularidad del sitio">
        <p>
          Este sitio web y el servicio AsistAI son titularidad del prestador identificado más arriba. Puedes contactar
          con nosotros en{" "}
          <a href="mailto:hola@asistai.es" className="font-medium text-[#344038] underline underline-offset-2">
            hola@asistai.es
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Qué es el servicio">
        <p>
          AsistAI es un servicio de recepción telefónica: uno o varios agentes de voz atienden las llamadas de tu
          negocio, responden preguntas sobre tus servicios y horarios, comprueban tu disponibilidad real y reservan
          citas en tu calendario de Google o de Outlook.
        </p>
        <p>
          El servicio se presta como suscripción mensual. Tú mantienes tu número de teléfono habitual y las llamadas
          llegan a AsistAI mediante un desvío que activas desde tu propio terminal.
        </p>
      </LegalSection>

      <LegalSection title="Condiciones de uso">
        <p>
          Al usar AsistAI te comprometes a que la información que configures sobre tu negocio sea veraz, a informar a
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
          Los contenidos de este sitio, la marca AsistAI y el software del servicio están protegidos por la normativa de
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

      <LegalSection title="Legislación aplicable">
        <p>
          Esta relación se rige por la legislación española. Para cualquier controversia serán competentes los juzgados
          y tribunales que correspondan conforme a la normativa aplicable.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LegalFicha, LegalPage, LegalSection } from "@/components/legal-page";
import { absoluteUrl, ogImages, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Aviso legal",
  description:
    "Titularidad del sitio, condiciones de uso, contratación de la suscripción, derecho de desistimiento y encargo de tratamiento de datos de Alhabla.",
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
    images: ogImages("/legal/aviso-legal", `Aviso legal | ${siteName}`),
  },
  robots: { index: true, follow: true },
};

const enlace = "font-medium text-morado-tinta underline underline-offset-2";
const negrita = "font-semibold text-tinta";

export default function AvisoLegalPage() {
  return (
    <LegalPage
      title="Aviso legal"
      description="Quién está detrás de Alhabla, en qué condiciones puedes usarlo, qué implica contratar una suscripción y cómo tratamos por tu cuenta los datos de tus clientes."
      updatedAt="2026-10-04"
      indice
    >
      <LegalSection id="titularidad" title="Titularidad del sitio">
        <p>
          Este sitio web (alhabla.ai), la aplicación (app.alhabla.ai) y el servicio Alhabla son titularidad de la
          persona siguiente. Son los datos que exige el artículo 10 de la Ley 34/2002 de servicios de la sociedad de
          la información y de comercio electrónico.
        </p>
        <LegalFicha
          datos={[
            { termino: "Titular", valor: "Miguel Martín Delgado, profesional autónomo" },
            { termino: "NIF", valor: "49456776Z" },
            { termino: "Domicilio profesional", valor: "Carrer Sot de Bacs 175, 08470 Sant Celoni (Barcelona)" },
            {
              termino: "Correo electrónico",
              valor: (
                <a href="mailto:support@alhabla.ai" className={enlace}>
                  support@alhabla.ai
                </a>
              ),
            },
            { termino: "Registro", valor: "No está inscrito en el Registro Mercantil." },
          ]}
        />
      </LegalSection>

      <LegalSection id="servicio" title="Qué es el servicio">
        <p>
          Alhabla es un servicio de recepción telefónica con inteligencia artificial: uno o varios agentes de voz
          atienden las llamadas de tu negocio, responden preguntas sobre tus servicios y horarios, comprueban tu
          disponibilidad real y reservan citas en tu calendario de Google, Outlook o iCloud.
        </p>
        <p>
          También habla por WhatsApp. Con tus clientes, para confirmarles la cita y, según tu plan, recordársela, y
          para que reserven, cambien o cancelen escribiendo. Contigo, para enviarte avisos y para El Gestor, con el que
          cambias precios, horarios o citas y que siempre te propone el cambio antes de aplicarlo.
        </p>
        <p>
          El servicio se presta como suscripción mensual. Tú mantienes tu número de teléfono habitual y las llamadas
          llegan a Alhabla mediante un desvío que activas desde tu propio terminal.
        </p>
      </LegalSection>

      <LegalSection id="condiciones-de-uso" title="Condiciones de uso">
        <p>Al usar Alhabla te comprometes a:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Que la información que configures sobre tu negocio sea veraz.</li>
          <li>Informar a quien llama de que la llamada se graba.</li>
          <li>
            No utilizar el servicio para fines ilícitos ni para comunicaciones comerciales no solicitadas, ya sean
            llamadas o mensajes de WhatsApp.
          </li>
        </ul>
        <p>
          Eres responsable de mantener la confidencialidad de tus credenciales. Una cuenta corresponde a un negocio y a
          la persona que lo administra.
        </p>
      </LegalSection>

      <LegalSection id="contratacion" title="Contratación, prueba y precios">
        <p>
          La suscripción se contrata desde la web y se gestiona con Stripe. Los planes, los minutos incluidos y el coste
          por minuto adicional se muestran antes de contratar en la{" "}
          <Link href="/planes" className={enlace}>
            página de planes
          </Link>
          ; los minutos que superen los incluidos en tu plan se facturan a ese precio. Los precios se indican en euros
          e incluyen el IVA aplicable. Si contratas como empresa o profesional, puedes indicar tu identificador fiscal
          durante el pago.
        </p>
        <p>
          La suscripción incluye un periodo de prueba de 7 días. Para empezarlo se te pide un método de pago, y si no
          cancelas antes de que termine la prueba se cobra automáticamente el plan que hayas elegido y la suscripción
          se renueva cada mes.
        </p>
        <p>
          No hay compromiso de permanencia: puedes cambiar de plan o cancelar cuando quieras desde el portal de
          facturación de tu cuenta.
        </p>
      </LegalSection>

      <LegalSection id="desistimiento" title="Desistimiento y cancelación">
        <p>
          <strong className={negrita}>Si contratas como consumidor</strong> tienes derecho a desistir en los 14 días
          naturales siguientes a la contratación. Para ejercerlo basta con que nos lo comuniques de forma clara por
          correo a{" "}
          <a href="mailto:support@alhabla.ai" className={enlace}>
            support@alhabla.ai
          </a>
          .
        </p>
        <p>
          <strong className={negrita}>Si contratas como empresa o profesional</strong> en el ejercicio de tu
          actividad, ese derecho no resulta aplicable.
        </p>
        <p>
          <strong className={negrita}>En cualquiera de los dos casos</strong> puedes cancelar la suscripción en
          cualquier momento. La baja se aplica al final del periodo ya pagado, no se te volverá a cobrar en el
          siguiente y hasta esa fecha el servicio sigue activo. Antes de que termine, desactiva el desvío de llamadas
          de tu línea: si lo dejas, las llamadas de tus clientes se quedarán sin atender.
        </p>
      </LegalSection>

      <LegalSection id="disponibilidad" title="Disponibilidad y responsabilidad">
        <p>
          Trabajamos para que el servicio esté disponible de forma continuada, pero depende de terceros — telefonía,
          proveedor de voz, WhatsApp y tu proveedor de calendario — y de tu propia conexión. No garantizamos que el
          servicio esté libre de interrupciones.
        </p>
        <p>
          La recepcionista está configurada para no inventar información: comprueba tu horario y tu disponibilidad real
          antes de confirmar cualquier cita. Aun así, te recomendamos revisar tu agenda con normalidad.
        </p>
      </LegalSection>

      <LegalSection id="propiedad-intelectual" title="Propiedad intelectual">
        <p>
          Los contenidos de este sitio, la marca Alhabla y el software del servicio están protegidos por la normativa de
          propiedad intelectual e industrial. Los datos de tu negocio y las grabaciones de tus llamadas son tuyos.
        </p>
      </LegalSection>

      <LegalSection id="proteccion-de-datos" title="Protección de datos">
        <p>
          El tratamiento de datos personales se detalla en la{" "}
          <Link href="/legal/privacidad" className={enlace}>
            política de privacidad
          </Link>
          , que incluye qué ocurre con la demo de voz de la web, con las llamadas y los mensajes de WhatsApp que atiende
          tu recepcionista y con las cookies.
        </p>
      </LegalSection>

      <LegalSection id="encargo-de-tratamiento" title="Encargo de tratamiento de los datos de tus clientes">
        <p>
          Esta cláusula regula un tratamiento distinto del anterior: no tus datos como titular de la cuenta, sino los
          datos personales de las personas que llaman a tu negocio o le escriben por WhatsApp (nombre, teléfono y el
          contenido de la conversación) que tu recepcionista virtual trata en tu nombre. En esa relación, tu negocio es
          el <strong className={negrita}>responsable del tratamiento</strong> y Alhabla actúa como{" "}
          <strong className={negrita}>encargado del tratamiento</strong>, conforme al artículo 28 del RGPD. Aceptar
          estas condiciones al contratar el servicio constituye el contrato de encargo de tratamiento exigido por ese
          artículo — no hace falta firmar un documento aparte para empezar a usar Alhabla.
        </p>
        <p>
          <strong className={negrita}>Objeto, naturaleza y duración.</strong> Alhabla trata datos por tu cuenta para
          prestarte el servicio contratado: atender llamadas y mensajes de WhatsApp, grabar y transcribir las llamadas,
          consultar tu disponibilidad y reservar citas en tu calendario. El tratamiento dura mientras tu suscripción
          esté activa y, tras la baja, durante el plazo de conservación indicado en la{" "}
          <Link href="/legal/privacidad" className={enlace}>
            política de privacidad
          </Link>
          .
        </p>
        <p>
          <strong className={negrita}>Tipo de datos y personas afectadas.</strong> Nombre, número de teléfono y el
          contenido de la conversación (grabación y transcripción de las llamadas, y texto de los mensajes de WhatsApp)
          de las personas que llaman o escriben a tu negocio para pedir información o reservar cita. No se tratan
          categorías especiales de datos salvo que la persona las mencione por iniciativa propia.
        </p>
        <p>
          <strong className={negrita}>Instrucciones y confidencialidad.</strong> Alhabla trata estos datos solo
          siguiendo tus instrucciones — las que resultan de la configuración de tu cuenta y del funcionamiento normal
          del servicio — y no los usa para ningún fin propio ni de terceros. El personal con acceso está sujeto a un
          deber de confidencialidad.
        </p>
        <p>
          <strong className={negrita}>Medidas de seguridad.</strong> Las grabaciones y transcripciones se almacenan
          cifradas y solo son accesibles desde tu cuenta, conforme al artículo 32 del RGPD.
        </p>
        <p>
          <strong className={negrita}>Subencargados.</strong> Autorizas con carácter general que Alhabla recurra a los
          proveedores necesarios para prestar el servicio — voz, telefonía y almacenamiento, listados en la política de
          privacidad — bajo obligaciones de protección de datos equivalentes a las de esta cláusula. Si se incorpora un
          nuevo proveedor con acceso a estos datos, te lo comunicaremos con antelación razonable para que puedas
          oponerte.
        </p>
        <p>
          <strong className={negrita}>Asistencia al responsable.</strong> Te ayudamos a atender las solicitudes de
          derechos de las personas que llaman (acceso, rectificación, supresión) y, si se produjera una violación de
          seguridad de estos datos, te lo notificaremos sin dilación indebida.
        </p>
        <p>
          <strong className={negrita}>Al finalizar la prestación.</strong> Cuando canceles la suscripción, a tu
          elección eliminamos o te devolvemos las grabaciones y transcripciones asociadas a tu negocio, salvo que
          debamos conservarlas por obligación legal.
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="Cambios en este aviso">
        <p>
          Podemos actualizar este aviso cuando cambie el servicio o la normativa. Indicaremos la fecha de la última
          actualización y, si el cambio es relevante, lo comunicaremos por los canales razonables antes de que sea
          aplicable.
        </p>
      </LegalSection>

      <LegalSection id="legislacion" title="Legislación aplicable">
        <p>
          Esta relación se rige por la legislación española. Para cualquier controversia serán competentes los juzgados
          y tribunales que correspondan conforme a la normativa aplicable.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

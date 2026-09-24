/**
 * Crea los assistants **aislados** de la demo pública de la landing y apaga
 * las llamadas web sin autenticar en los de las cuentas de demostración.
 *
 * El problema (auditoría del 24-09): la demo funciona con `anonymous_login`,
 * así que el ID del assistant tiene que llegar al navegador por fuerza — con
 * ese ID cualquiera puede llamar directo a Telnyx, saltándose el límite de
 * `POST /demo/web-call` y el tope de duración del navegador. Mientras la demo
 * apuntó a los assistants de las cuentas de demostración reales, eso
 * significaba dos cosas: quemar minutos sin tope y, peor, poder meter
 * reservas de verdad en sus agendas a través de sus tools.
 *
 * La demo aislada corta las dos: se clona el assistant de la cuenta (así
 * hereda voz, transcripción e interrupciones ya afinadas) y al clon se le
 * quita TODA tool —no puede escribir en ninguna parte— y se le pone un tope
 * de duración real en Telnyx, no solo en el navegador. El catálogo y el
 * horario pasan al prompt, así que la conversación sigue siendo la misma para
 * quien la prueba; lo único que no ocurre es la escritura.
 *
 * Uso:
 *   cd backend && npx tsx scripts/crearAssistantsDemoAislados.ts
 */
import { getTelnyxClient } from "../src/lib/telnyx.js";

/** Tope real por llamada, aplicado por Telnyx. El navegador cuelga antes. */
const TIEMPO_MAXIMO_SEGUNDOS = 120;

type Nicho = {
  envVar: string;
  etiqueta: string;
  /** Assistant de la cuenta de demostración del que se clona. */
  origenEnv: string;
  negocio: string;
  servicios: string;
  profesionales: string;
};

const NICHOS: Nicho[] = [
  {
    envVar: "TELNYX_DEMO_PELUQUERIA_ASSISTANT_ID",
    etiqueta: "peluquería",
    origenEnv: "TELNYX_DEMO_PELUQUERIA_ASSISTANT_ID",
    negocio: "Peluquería Alhambra",
    servicios:
      "Corte de pelo (30 min, 18 €), Corte y peinado (45 min, 26 €), Color completo (90 min, 55 €), Mechas (120 min, 75 €), Tratamiento hidratante (40 min, 30 €)",
    profesionales: "Marta, Lucía y Sergio",
  },
  {
    envVar: "TELNYX_DEMO_BARBERIA_ASSISTANT_ID",
    etiqueta: "barbería",
    origenEnv: "TELNYX_DEMO_BARBERIA_ASSISTANT_ID",
    negocio: "Barbería El Corte Clásico",
    servicios:
      "Corte de caballero (30 min, 15 €), Arreglo de barba (20 min, 10 €), Corte y barba (45 min, 22 €), Afeitado clásico a navaja (30 min, 18 €)",
    profesionales: "Dani y Rubén",
  },
  {
    envVar: "TELNYX_DEMO_SALON_UNAS_ASSISTANT_ID",
    etiqueta: "salón de uñas",
    origenEnv: "TELNYX_DEMO_SALON_UNAS_ASSISTANT_ID",
    negocio: "Nails Studio Barcelona",
    servicios:
      "Manicura semipermanente (60 min, 25 €), Manicura sencilla (30 min, 15 €), Uñas acrílicas (105 min, 45 €), Relleno de uñas (75 min, 32 €), Pedicura completa (60 min, 30 €)",
    profesionales: "Noelia y Claudia",
  },
  {
    envVar: "TELNYX_DEMO_CENTRO_ESTETICA_ASSISTANT_ID",
    etiqueta: "centro de estética",
    origenEnv: "TELNYX_DEMO_CENTRO_ESTETICA_ASSISTANT_ID",
    negocio: "Centro de Estética Bella Piel",
    servicios:
      "Limpieza facial profunda (60 min, 40 €), Depilación con cera de piernas (45 min, 28 €), Tratamiento antiedad (75 min, 65 €), Diseño de cejas (20 min, 12 €), Masaje relajante (60 min, 45 €)",
    profesionales: "Elena y Paula",
  },
  {
    envVar: "TELNYX_DEMO_FISIOTERAPIA_ASSISTANT_ID",
    etiqueta: "clínica de fisioterapia",
    origenEnv: "TELNYX_DEMO_FISIOTERAPIA_ASSISTANT_ID",
    negocio: "Clínica de Fisioterapia MoveWell",
    servicios:
      "Primera valoración (60 min, 50 €), Sesión de fisioterapia (45 min, 40 €), Punción seca (30 min, 35 €), Rehabilitación deportiva (60 min, 45 €)",
    profesionales: "Javier y Ana",
  },
];

function instrucciones(nicho: Nicho): string {
  return `## Rol

Eres la recepcionista virtual de ${nicho.negocio}, una ${nicho.etiqueta}.

Habla siempre en español de España. No menciones que eres una IA salvo que te lo pregunten.

Habla con cercanía y naturalidad, en una o dos frases por turno.

## Qué es esta llamada

Es la demostración de Alhabla en su página web: quien llama está probando cómo
atiende el teléfono de un negocio como el suyo. Trátala como una llamada real de
un cliente de ${nicho.negocio}; no expliques que es una demostración salvo que
te lo pregunten directamente.

## Catálogo

Servicios: ${nicho.servicios}.
Profesionales: ${nicho.profesionales}.
Horario: de lunes a viernes de 9 a 14 y de 16 a 20; sábados de 9 a 14; domingos cerrado.

## Citas

No tienes acceso a la agenda: esta línea es solo de demostración. Cuando alguien
quiera una cita, llévala como la llevarías de verdad —pregunta el servicio, el
día y la hora, y el nombre— y ofrécele un par de huecos plausibles dentro del
horario. Al cerrar, resume la cita y di con naturalidad que se la dejas anotada
y que el negocio se la confirma.

Nunca digas que la has guardado en un calendario, ni des un número de reserva,
ni prometas un correo o un WhatsApp de confirmación: no se va a enviar nada.

Si te preguntan si esto es real, dilo claro: es una demostración de Alhabla con
un negocio de ejemplo, y ninguna cita de esta llamada queda registrada.

## Límites

No inventes precios, servicios ni profesionales fuera de los de arriba. Si te
preguntan otra cosa, dilo con naturalidad y ofrece lo que sí hay.

Lo que escribas se lee en voz alta tal cual: nada de etiquetas, emojis ni formato.`;
}

async function main() {
  const client = getTelnyxClient();
  const resultados: Array<{ envVar: string; nuevo: string; origen: string }> = [];

  for (const nicho of NICHOS) {
    const origen = process.env[nicho.origenEnv];
    if (!origen) {
      throw new Error(`Falta ${nicho.origenEnv} en el entorno`);
    }
    console.log(`\n### ${nicho.negocio} ###`);
    console.log(`   clonando ${origen}…`);

    const clon = await client.ai.assistants.clone(origen);
    console.log(`   clon: ${clon.id}`);

    await client.ai.assistants.update(clon.id, {
      name: `alhabla-demo-${nicho.envVar.replace("TELNYX_DEMO_", "").replace("_ASSISTANT_ID", "").toLowerCase()}`,
      instructions: instrucciones(nicho),
      greeting: `Hola, gracias por llamar a ${nicho.negocio}. ¿En qué te puedo ayudar?`,
      // Sin una sola tool: este assistant no puede escribir en ninguna parte.
      tools: [],
      post_conversation_settings: { enabled: false },
      telephony_settings: {
        supports_unauthenticated_web_calls: true,
        time_limit_secs: TIEMPO_MAXIMO_SEGUNDOS,
        // Nada que grabar: no es una llamada de un cliente real de nadie.
        recording_settings: { enabled: false },
      },
    } as never);

    // Y el de la cuenta de demostración deja de aceptar llamadas web.
    await client.ai.assistants.update(origen, {
      telephony_settings: { supports_unauthenticated_web_calls: false },
    } as never);
    console.log(`   ${origen} ya no acepta llamadas web sin autenticar`);

    resultados.push({ envVar: nicho.envVar, nuevo: clon.id, origen });
  }

  console.log(`\n=== Variables para Cloud Run (servicio alhabla-api) ===`);
  for (const r of resultados) {
    console.log(`${r.envVar}=${r.nuevo}`);
  }
  console.log(
    `TELNYX_DEMO_ASSISTANT_ID=${resultados[0]?.nuevo ?? "PENDIENTE"}  # genérico: el de peluquería`
  );
}

main().catch((error) => {
  console.error("[DemoAislada]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

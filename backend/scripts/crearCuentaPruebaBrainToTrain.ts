/**
 * Crea en PRODUCCIÓN la cuenta de prueba de «Brain to Train», un centro de
 * entrenamiento de fuerza / CrossFit de Sant Celoni (Carrer de Mallorca, 16),
 * para enseñarle al dueño su recepcionista atendiendo un número de verdad.
 *
 * Lo que se sabe del negocio (Google Maps e Instagram @braintotrain_, octubre
 * de 2026): centro de entrenamiento físico «para todo el mundo» con una
 * metodología basada en la fuerza, grupos reducidos y asesoramiento
 * deportivo; entrena en el box y al aire libre («Park o Box?»), en Sant
 * Celoni y en Santa Maria de Palautordera. Lo lleva Héctor Sanz Llobet,
 * entrenador personal (CAFE). Abre de lunes a viernes de 6:00 a 21:00 y el
 * sábado de 9:00 a 13:00; el domingo cierra. Las tarifas no son públicas, así
 * que los servicios van sin precio (salvo la sesión de prueba, que es
 * gratis): la recepcionista no se inventa ninguno y deja recado.
 *
 * El alta pasa por la API pública real (`POST /auth/register`,
 * `PATCH /business/me`, `POST /booking-settings/services|professionals`),
 * así que crea el Agent y su assistant de Telnyx con las tools apuntando a
 * `api.alhabla.ai` (agentBootstrap.ts).
 *
 * A propósito NO usa el teléfono real del gimnasio (+34 655 07 24 04) ni
 * pone móvil del dueño: con `phone` real, los avisos de cada reserva y lo
 * que la recepcionista dice en voz alta irían a un negocio que no ha pedido
 * nada; sin `ownerWhatsappNumber` no se registra la transferencia al dueño.
 * La línea de clientes es el propio número de Alhabla (caso E,
 * `customerLineType: "alhabla"`).
 *
 * Lo que queda FUERA, igual que en `replicateTestAccountsToProd.ts`: anclar
 * el número reutilizado (`TELEFONO_DE_PRUEBA`, en el Call Control App de
 * producción y sin negocio) es una escritura directa en la Cloud SQL de
 * producción. El script imprime al final el SQL exacto para ejecutarlo a mano.
 *
 * Mientras tanto (2026-10-18) el número atiende la demo para enseñársela al
 * gimnasio: un clon del assistant de esta cuenta, `alhabla-demo-brain-to-train`
 * (`assistant-bf00a21a-b64a-4942-81b2-bf81f16523fe`), con el mismo patrón que
 * `crearAssistantsDemoAislados.ts` (sin tools salvo colgar, catálogo y horario
 * en el prompt, sin grabación) y el número en SU app TeXML
 * (`3073476569801426354`), no en el Call Control App. Antes del SQL hay que
 * devolver el `connection_id` del número a `3048374727065208187`.
 *
 * Uso (reanudable: si el alta ya se hizo, pasa la contraseña impresa):
 *   cd backend && npx tsx scripts/crearCuentaPruebaBrainToTrain.ts
 *   PRUEBA_PASSWORD=... npx tsx scripts/crearCuentaPruebaBrainToTrain.ts
 *
 * Para retirarla: borrar la cuenta desde Cuenta en la app (borra el negocio,
 * su assistant y SUELTA el número en Telnyx — antes hay que desanclarlo con
 * `UPDATE businesses SET "telnyxPhoneNumber" = NULL, "telnyxPhoneNumberId" =
 * NULL ...` si se quiere conservar el número).
 */
import { randomBytes } from "crypto";

const PROD_BASE_URL =
  process.env.PRUEBA_PROD_BASE_URL ?? "https://api.alhabla.ai";

/** +34930453216: `env-prod`, en `alhabla-platform-production`, sin negocio. */
const TELEFONO_DE_PRUEBA = "+34930453216";
const TELEFONO_DE_PRUEBA_ID = "3041896235440015138";

const EMAIL = "prueba-brain-to-train@alhabla.ai";
const NOMBRE = "Brain to Train";
const DIRECCION = "Carrer de Mallorca, 16, 08470 Sant Celoni, Barcelona";

const SERVICIOS = [
  { name: "Sesión de prueba gratuita", durationMinutes: 60, priceCents: 0 },
  { name: "Entrenamiento en grupo reducido (Box)", durationMinutes: 60 },
  { name: "Entrenamiento al aire libre (Park)", durationMinutes: 60 },
  { name: "Entrenamiento personal", durationMinutes: 60 },
  { name: "Valoración y asesoramiento deportivo", durationMinutes: 30 },
];

const PROFESIONALES = ["Héctor"];

const DETALLES = [
  "Brain to Train es un centro de entrenamiento físico para todo el mundo, en Sant Celoni (Carrer de Mallorca, 16) y también en Santa Maria de Palautordera.",
  "La metodología tiene como base el entrenamiento de la fuerza en todas sus variantes (estilo CrossFit / funcional), con el objetivo de mejorar el rendimiento, prevenir lesiones y trabajar todo el cuerpo de forma integral.",
  "Se entrena siempre en grupos reducidos, en el box o al aire libre (Park), con muchos horarios disponibles. También hay entrenamiento personal y asesoramiento deportivo.",
  "Lo dirige Héctor Sanz, entrenador personal titulado (CAFE).",
  "Quien quiera empezar puede venir a probar una sesión gratis y sin compromiso: es lo primero que se ofrece a alguien nuevo.",
  "Las tarifas no se dan por teléfono: si preguntan precios, se toma nota del nombre y el teléfono y Héctor les llama para explicarles los planes.",
  "Instagram: @braintotrain_.",
].join("\n");

/** Lunes a viernes de 6:00 a 21:00; sábado de 9:00 a 13:00; domingo cerrado. */
const DIA_LABORABLE = {
  enabled: true,
  intervals: [{ start: "06:00", end: "21:00" }],
};
const HORARIO = {
  version: 1,
  week: {
    monday: DIA_LABORABLE,
    tuesday: DIA_LABORABLE,
    wednesday: DIA_LABORABLE,
    thursday: DIA_LABORABLE,
    friday: DIA_LABORABLE,
    saturday: { enabled: true, intervals: [{ start: "09:00", end: "13:00" }] },
    sunday: { enabled: false, intervals: [] },
  },
  exceptions: [],
};

async function pedir(url: string, init: RequestInit, contexto: string) {
  const respuesta = await fetch(url, init);
  if (!respuesta.ok) {
    throw new Error(
      `${contexto} falló (${respuesta.status}): ${await respuesta.text()}`
    );
  }
  return respuesta;
}

async function main() {
  const passwordExistente = process.env.PRUEBA_PASSWORD;
  const password = passwordExistente ?? randomBytes(12).toString("base64url");
  // Antes de nada: si el alta sale bien y luego falla otro paso, sin esta
  // línea no habría forma de volver a entrar en la cuenta.
  console.log(`### ${NOMBRE} (${EMAIL}) — contraseña: ${password} ###`);

  const acceso = passwordExistente
    ? await pedir(
        `${PROD_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: EMAIL, password }),
        },
        "POST /auth/login"
      )
    : await pedir(
        `${PROD_BASE_URL}/auth/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: EMAIL,
            password,
            isEuropeanUnion: true,
            businessType: "other",
            acceptedTerms: true,
          }),
        },
        "POST /auth/register"
      );
  const { token } = (await acceso.json()) as { token: string };
  const { businessId } = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  ) as { businessId: string };
  console.log(`   businessId: ${businessId}`);

  const cabeceras = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };

  await pedir(
    `${PROD_BASE_URL}/business/me`,
    {
      method: "PATCH",
      headers: cabeceras,
      body: JSON.stringify({
        name: NOMBRE,
        timezone: "Europe/Madrid",
        schedule: HORARIO,
        address: DIRECCION,
        businessDetails: DETALLES,
        phone: TELEFONO_DE_PRUEBA,
        customerLineType: "alhabla",
      }),
    },
    "PATCH /business/me"
  );
  console.log("   ficha, horario y detalles guardados");

  // Reanudable: no se duplican servicios ni profesionales de una pasada
  // anterior.
  const ajustes = (await (
    await pedir(
      `${PROD_BASE_URL}/booking-settings`,
      { headers: cabeceras },
      "GET /booking-settings"
    )
  ).json()) as {
    services?: Array<{ id: string; name: string }>;
    professionals?: Array<{ name: string }>;
  };

  const idsDeServicio: string[] = [];
  for (const servicio of SERVICIOS) {
    const existente = ajustes.services?.find((s) => s.name === servicio.name);
    if (existente) {
      idsDeServicio.push(existente.id);
      continue;
    }
    const creado = await pedir(
      `${PROD_BASE_URL}/booking-settings/services`,
      { method: "POST", headers: cabeceras, body: JSON.stringify(servicio) },
      `POST /booking-settings/services (${servicio.name})`
    );
    idsDeServicio.push(((await creado.json()) as { id: string }).id);
  }
  console.log(`   ${idsDeServicio.length} servicios`);

  for (const nombre of PROFESIONALES) {
    if (ajustes.professionals?.some((p) => p.name === nombre)) continue;
    await pedir(
      `${PROD_BASE_URL}/booking-settings/professionals`,
      {
        method: "POST",
        headers: cabeceras,
        body: JSON.stringify({ name: nombre, serviceIds: idsDeServicio }),
      },
      `POST /booking-settings/professionals (${nombre})`
    );
  }
  console.log(`   ${PROFESIONALES.length} profesionales`);

  console.log(`
=== Para anclar ${TELEFONO_DE_PRUEBA} (Cloud SQL de producción, a mano) ===
UPDATE businesses
SET "telnyxPhoneNumber" = '${TELEFONO_DE_PRUEBA}',
    "telnyxPhoneNumberId" = '${TELEFONO_DE_PRUEBA_ID}',
    "telnyxPhoneNumberPurchasedAt" = NOW(),
    "phoneNumberStatus" = 'active'
WHERE id = '${businessId}' AND "telnyxPhoneNumber" IS NULL;

=== Credenciales (guárdalas) ===
${EMAIL} / ${password} (businessId=${businessId})`);
}

main().catch((error) => {
  console.error(
    "[CuentaPruebaBrainToTrain]",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});

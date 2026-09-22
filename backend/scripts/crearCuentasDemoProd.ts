/**
 * Crea en PRODUCCIÓN las cinco cuentas de demostración de la landing (una por
 * nicho: peluquería, barbería, salón de uñas, estética, fisioterapia) y deja
 * impresas las variables `TELNYX_DEMO_<NICHO>_ASSISTANT_ID` que hay que poner
 * en Cloud Run.
 *
 * Por qué hace falta: la demo de la web ya no es un agente aparte de Retell,
 * sino una llamada por el navegador al assistant de una cuenta real de la
 * plataforma (ver AGENTS.md § módulo `demo`). Las cinco cuentas de prueba que
 * había vivían en la base de datos de DESARROLLO y sus assistants apuntan a
 * `dev-api.alhabla.ai` (el túnel del portátil), así que en producción
 * hablarían pero no podrían consultar horario ni reservar.
 *
 * El alta pasa por la API pública real (`POST /auth/register`,
 * `PATCH /business/me`, `POST /booking-settings/services|professionals`), el
 * mismo camino que un negocio de verdad: eso es lo que crea el Agent y el
 * assistant de Telnyx con sus tools apuntando a `api.alhabla.ai`.
 *
 * Lo que NO hace a propósito: comprar números (la demo es por navegador, no
 * por teléfono) y tocar Stripe. Las cuentas quedan sin plan activo; la demo
 * no lo necesita, y sin número nadie puede llamarlas por teléfono.
 *
 * Uso (una sola vez; es idempotente solo en el sentido de que un email ya
 * registrado hace fallar el alta de ese nicho, no de que repare la anterior):
 *   cd backend && npx tsx scripts/crearCuentasDemoProd.ts
 */
import { randomBytes } from "crypto";
import { getTelnyxClient } from "../src/lib/telnyx.js";

const PROD_BASE_URL = process.env.DEMO_PROD_BASE_URL ?? "https://api.alhabla.ai";

type CuentaDemo = {
  envVar: string;
  email: string;
  businessType: string;
  nombre: string;
  servicios: Array<{ name: string; durationMinutes: number; priceCents: number }>;
  profesionales: string[];
};

/**
 * Catálogo de las cuentas de demostración. Son negocios inventados pero
 * plausibles: el visitante tiene que oír precios, duraciones y nombres que
 * suenen a un negocio español de ese sector.
 */
const CUENTAS: CuentaDemo[] = [
  {
    envVar: "TELNYX_DEMO_PELUQUERIA_ASSISTANT_ID",
    email: "demo-peluqueria-alhambra@alhabla.ai",
    businessType: "peluqueria",
    nombre: "Peluquería Alhambra",
    servicios: [
      { name: "Corte de pelo", durationMinutes: 30, priceCents: 1800 },
      { name: "Corte y peinado", durationMinutes: 45, priceCents: 2600 },
      { name: "Color completo", durationMinutes: 90, priceCents: 5500 },
      { name: "Mechas", durationMinutes: 120, priceCents: 7500 },
      { name: "Tratamiento hidratante", durationMinutes: 40, priceCents: 3000 },
    ],
    profesionales: ["Marta", "Lucía", "Sergio"],
  },
  {
    envVar: "TELNYX_DEMO_BARBERIA_ASSISTANT_ID",
    email: "demo-barberia@alhabla.ai",
    businessType: "barberia",
    nombre: "Barbería El Corte Clásico",
    servicios: [
      { name: "Corte de caballero", durationMinutes: 30, priceCents: 1500 },
      { name: "Arreglo de barba", durationMinutes: 20, priceCents: 1000 },
      { name: "Corte y barba", durationMinutes: 45, priceCents: 2200 },
      { name: "Afeitado clásico a navaja", durationMinutes: 30, priceCents: 1800 },
    ],
    profesionales: ["Dani", "Rubén"],
  },
  {
    envVar: "TELNYX_DEMO_SALON_UNAS_ASSISTANT_ID",
    email: "demo-salon-unas@alhabla.ai",
    businessType: "salon-de-unas",
    nombre: "Nails Studio Barcelona",
    servicios: [
      { name: "Manicura semipermanente", durationMinutes: 60, priceCents: 2500 },
      { name: "Manicura sencilla", durationMinutes: 30, priceCents: 1500 },
      { name: "Uñas acrílicas", durationMinutes: 105, priceCents: 4500 },
      { name: "Relleno de uñas", durationMinutes: 75, priceCents: 3200 },
      { name: "Pedicura completa", durationMinutes: 60, priceCents: 3000 },
    ],
    profesionales: ["Noelia", "Claudia"],
  },
  {
    envVar: "TELNYX_DEMO_CENTRO_ESTETICA_ASSISTANT_ID",
    email: "demo-estetica@alhabla.ai",
    businessType: "centro-de-estetica",
    nombre: "Centro de Estética Bella Piel",
    servicios: [
      { name: "Limpieza facial profunda", durationMinutes: 60, priceCents: 4000 },
      { name: "Depilación con cera de piernas", durationMinutes: 45, priceCents: 2800 },
      { name: "Tratamiento antiedad", durationMinutes: 75, priceCents: 6500 },
      { name: "Diseño de cejas", durationMinutes: 20, priceCents: 1200 },
      { name: "Masaje relajante", durationMinutes: 60, priceCents: 4500 },
    ],
    profesionales: ["Elena", "Paula"],
  },
  {
    envVar: "TELNYX_DEMO_FISIOTERAPIA_ASSISTANT_ID",
    email: "demo-fisioterapia@alhabla.ai",
    businessType: "fisioterapia",
    nombre: "Clínica de Fisioterapia MoveWell",
    servicios: [
      { name: "Primera valoración", durationMinutes: 60, priceCents: 5000 },
      { name: "Sesión de fisioterapia", durationMinutes: 45, priceCents: 4000 },
      { name: "Punción seca", durationMinutes: 30, priceCents: 3500 },
      { name: "Rehabilitación deportiva", durationMinutes: 60, priceCents: 4500 },
    ],
    profesionales: ["Javier", "Ana"],
  },
];

/** Lunes a viernes de 9 a 14 y de 16 a 20; sábado de 9 a 14; domingo cerrado. */
const HORARIO = {
  version: 1,
  week: {
    monday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "20:00" }] },
    tuesday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "20:00" }] },
    wednesday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "20:00" }] },
    thursday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "20:00" }] },
    friday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }, { start: "16:00", end: "20:00" }] },
    saturday: { enabled: true, intervals: [{ start: "09:00", end: "14:00" }] },
    sunday: { enabled: false, intervals: [] },
  },
  exceptions: [],
};

async function pedir(url: string, init: RequestInit, contexto: string) {
  const respuesta = await fetch(url, init);
  if (!respuesta.ok) {
    throw new Error(`${contexto} falló (${respuesta.status}): ${await respuesta.text()}`);
  }
  return respuesta;
}

async function crearCuenta(cuenta: CuentaDemo) {
  const password = randomBytes(12).toString("base64url");
  // La contraseña se imprime ANTES de nada: si el alta se completa y luego
  // falla el horario o un servicio, la cuenta existe y sin esta línea no habría
  // forma de volver a entrar en ella (se relanza con DEMO_PASSWORD_<NICHO>).
  console.log(`\n### ${cuenta.nombre} (${cuenta.email}) — contraseña: ${password} ###`);

  // Reanudable: si una pasada anterior ya dio de alta este email (el alta va
  // antes que el horario y los servicios), se entra con la contraseña que se
  // pase por DEMO_<NICHO>_PASSWORD en vez de hacer fallar toda la ejecución.
  const passwordExistente = process.env[`DEMO_PASSWORD_${cuenta.businessType.toUpperCase().replace(/-/g, "_")}`];
  const registro = passwordExistente
    ? await pedir(
        `${PROD_BASE_URL}/auth/login`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: cuenta.email, password: passwordExistente }),
        },
        "POST /auth/login"
      )
    : await pedir(
        `${PROD_BASE_URL}/auth/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: cuenta.email,
            password,
            isEuropeanUnion: true,
            businessType: cuenta.businessType,
            acceptedTerms: true,
          }),
        },
        "POST /auth/register"
      );
  const { token } = (await registro.json()) as { token: string };
  const { businessId } = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  ) as { businessId: string };
  console.log(`   businessId: ${businessId}`);

  const cabeceras = { "content-type": "application/json", authorization: `Bearer ${token}` };

  await pedir(
    `${PROD_BASE_URL}/business/me`,
    {
      method: "PATCH",
      headers: cabeceras,
      body: JSON.stringify({ name: cuenta.nombre, timezone: "Europe/Madrid", schedule: HORARIO }),
    },
    "PATCH /business/me"
  );

  const idsDeServicio: string[] = [];
  for (const servicio of cuenta.servicios) {
    const creado = await pedir(
      `${PROD_BASE_URL}/booking-settings/services`,
      { method: "POST", headers: cabeceras, body: JSON.stringify(servicio) },
      `POST /booking-settings/services (${servicio.name})`
    );
    idsDeServicio.push(((await creado.json()) as { id: string }).id);
  }
  console.log(`   ${idsDeServicio.length} servicios`);

  for (const nombre of cuenta.profesionales) {
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
  console.log(`   ${cuenta.profesionales.length} profesionales`);

  // El assistant lo crea el alta (agentBootstrap). Se localiza por el nombre
  // que le pone el backend: `alhabla-<businessId>-<agentId>`.
  const client = getTelnyxClient();
  const assistants = await client.ai.assistants.list();
  const assistant = (assistants.data ?? []).find((a) =>
    typeof a.name === "string" && a.name.startsWith(`alhabla-${businessId}-`)
  );
  if (!assistant) {
    console.warn(`   ⚠️  sin assistant de Telnyx todavía — búscalo a mano por el businessId`);
  }

  return { ...cuenta, businessId, password: passwordExistente ?? password, assistantId: assistant?.id ?? null };
}

async function main() {
  const resultados = [];
  for (const cuenta of CUENTAS) {
    resultados.push(await crearCuenta(cuenta));
  }

  console.log(`\n=== Variables para Cloud Run (servicio alhabla-api) ===`);
  for (const r of resultados) {
    console.log(`${r.envVar}=${r.assistantId ?? "PENDIENTE"}`);
  }
  console.log(
    `TELNYX_DEMO_ASSISTANT_ID=${resultados[0]?.assistantId ?? "PENDIENTE"}  # genérico: el de peluquería`
  );

  console.log(`\n=== Credenciales de las cuentas (guárdalas) ===`);
  for (const r of resultados) {
    console.log(`${r.email} / ${r.password} (businessId=${r.businessId})`);
  }
}

main().catch((error) => {
  console.error("[CuentasDemoProd]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

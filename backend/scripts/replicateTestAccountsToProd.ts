/**
 * Replica en producción las 5 cuentas de prueba de desarrollo (@alhabla.local:
 * peluquería, barbería, salón de uñas, estética, fisio) para poder correr
 * `telnyxCallBattery.ts` contra producción sin usar clientes reales.
 *
 * Lee la config completa (horario, servicios, profesionales) de la BD de
 * DESARROLLO vía Prisma y la reproduce en producción a través de la API
 * pública real (POST /auth/register + PATCH /business/me + POST
 * /booking-settings/services|professionals) — así el alta pasa por el mismo
 * camino que un negocio real (crea Agent, LLM de Retell y, con
 * VOICE_TELNYX_ROLLOUT=all en producción, el assistant de Telnyx y la
 * auto-promoción a orchestrator="telnyx", ver agentBootstrap.ts).
 *
 * Lo único que NO hace (decisión explícita, ver PLAN-TELNYX-ORQUESTADOR.md y
 * memoria de sesión): comprar 5 números de Telnyx nuevos. Reutiliza los 5
 * números YA existentes de las cuentas de desarrollo reasignando su
 * `connection_id` de Telnyx (llamada directa a la API de Telnyx, misma
 * cuenta/API key en dev y producción — no toca ninguna base de datos) del
 * Call Control App de dev al de producción, de forma PERMANENTE.
 *
 * Dos escrituras quedan FUERA de este script a propósito: saltar el gate de
 * Stripe (`subscriptionStatus`) y anclar el número reutilizado en el negocio
 * de producción (`telnyxPhoneNumber`/`telnyxPhoneNumberId`/`phoneNumberStatus`).
 * Ambas son escrituras directas en la Cloud SQL de PRODUCCIÓN, bloqueadas
 * para el modo automático de Claude Code — el script imprime al final el SQL
 * exacto para que el usuario lo ejecute él mismo (ver receta del proxy en la
 * memoria "gcp-infra-alhabla").
 *
 * REVERTIDO EL 2026-09-19. Este script se usó el 14-09 porque el túnel de
 * desarrollo era ngrok y cambiaba de hostname en cada reinicio, así que era
 * más cómodo probar contra producción. Con `dev-api.alhabla.ai` fijo eso ya no
 * hace falta: los 5 números volvieron al Call Control App de desarrollo y las
 * 5 copias se borraron de la Cloud SQL de producción junto con sus agentes de
 * Retell y sus assistants de Telnyx. Antes de volver a ejecutarlo, piensa si de
 * verdad lo necesitas — y si lo haces, revierte igual al terminar: dejar las
 * copias vivas en producción significa que producción se apropia de esos cinco
 * números y las llamadas de prueba dejan de llegar a desarrollo. Ver AGENTS.md
 * § "Telnyx: qué es de desarrollo y qué de producción".
 *
 * Uso (desde dentro de alhabla_backend_dev, con DATABASE_URL apuntando a la
 * BD de dev, que es la que ya usa el contenedor):
 *   npx tsx scripts/replicateTestAccountsToProd.ts
 */
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/prisma.js";
import { getTelnyxClient } from "../src/lib/telnyx.js";

const PROD_BASE_URL = "https://api.alhabla.ai";
const PROD_TELNYX_CALL_CONTROL_APP_ID = "3048374727065208187";

async function registerAndConfigure(email: string) {
  const business = await prisma.business.findFirst({
    where: { users: { some: { email } } },
    include: {
      services: { where: { deletedAt: null } },
      professionals: {
        where: { deletedAt: null },
        include: { serviceLinks: { include: { service: true } } },
      },
    },
  });
  if (!business) throw new Error(`No existe en dev ningún negocio con usuario ${email}`);

  const password = randomBytes(12).toString("base64url");

  console.log(`\n### ${business.name} (${email}) ###`);
  console.log(`-> registrando en producción...`);
  const registerRes = await fetch(`${PROD_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      isEuropeanUnion: true,
      businessType: business.businessType,
      acceptedTerms: true,
    }),
  });
  if (!registerRes.ok) {
    const body = await registerRes.text();
    throw new Error(`/auth/register falló (${registerRes.status}): ${body}`);
  }
  const { token } = (await registerRes.json()) as { token: string };
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8")
  ) as { id: string; businessId: string };
  const prodBusinessId = payload.businessId;
  console.log(`   businessId de producción: ${prodBusinessId}`);

  const authHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };

  console.log(`-> aplicando nombre y horario...`);
  const patchRes = await fetch(`${PROD_BASE_URL}/business/me`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({
      name: business.name,
      timezone: business.timezone,
      schedule: business.schedule,
    }),
  });
  if (!patchRes.ok) {
    throw new Error(`PATCH /business/me falló (${patchRes.status}): ${await patchRes.text()}`);
  }

  console.log(`-> creando ${business.services.length} servicios...`);
  const serviceIdMap = new Map<string, string>(); // dev id -> prod id
  for (const service of business.services) {
    const res = await fetch(`${PROD_BASE_URL}/booking-settings/services`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
      }),
    });
    if (!res.ok) {
      throw new Error(`POST /booking-settings/services (${service.name}) falló (${res.status}): ${await res.text()}`);
    }
    const created = (await res.json()) as { id: string };
    serviceIdMap.set(service.id, created.id);
  }

  console.log(`-> creando ${business.professionals.length} profesionales...`);
  for (const professional of business.professionals) {
    const serviceIds = professional.serviceLinks
      .map((link) => serviceIdMap.get(link.service.id))
      .filter((id): id is string => Boolean(id));
    const res = await fetch(`${PROD_BASE_URL}/booking-settings/professionals`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: professional.name, serviceIds }),
    });
    if (!res.ok) {
      throw new Error(`POST /booking-settings/professionals (${professional.name}) falló (${res.status}): ${await res.text()}`);
    }
  }

  if (!business.telnyxPhoneNumberId || !business.telnyxPhoneNumber) {
    throw new Error(`${email}: sin telnyxPhoneNumberId/telnyxPhoneNumber en dev — no hay número que reasignar`);
  }

  console.log(`-> reasignando ${business.telnyxPhoneNumber} al Call Control App de producción...`);
  const client = getTelnyxClient();
  await client.phoneNumbers.update(business.telnyxPhoneNumberId, {
    connection_id: PROD_TELNYX_CALL_CONTROL_APP_ID,
  });

  return {
    email,
    prodBusinessId,
    phoneNumber: business.telnyxPhoneNumber,
    phoneNumberId: business.telnyxPhoneNumberId,
    password,
  };
}

async function main() {
  const emails = [
    "test-peluqueria@alhabla.local",
    "test-barberia@alhabla.local",
    "test-salon-unas@alhabla.local",
    "test-estetica@alhabla.local",
    "test-fisioterapia@alhabla.local",
  ];

  const results = [];
  for (const email of emails) {
    results.push(await registerAndConfigure(email));
  }

  console.log(`\n\n=== Hecho en producción vía API + reasignación de número ===`);
  for (const r of results) {
    console.log(`${r.email} -> businessId=${r.prodBusinessId} número=${r.phoneNumber} (contraseña: ${r.password})`);
  }

  console.log(
    `\n=== Falta esto — ejecútalo TÚ contra Cloud SQL de producción (proxy, ver memoria "gcp-infra-alhabla") ===\n`
  );
  for (const r of results) {
    console.log(
      `UPDATE businesses SET "subscriptionStatus"='ACTIVE', "telnyxPhoneNumber"='${r.phoneNumber}', ` +
        `"telnyxPhoneNumberId"='${r.phoneNumberId}', "phoneNumberStatus"='active', ` +
        `"telnyxPhoneNumberPurchasedAt"=now() WHERE id='${r.prodBusinessId}';`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("[ReplicateProd]", error instanceof Error ? error.message : String(error));
  await prisma.$disconnect();
  process.exit(1);
});

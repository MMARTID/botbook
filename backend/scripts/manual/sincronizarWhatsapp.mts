/**
 * Sincroniza en la BD lo que Telnyx sabe del WABA de Alhabla
 * (PLAN-CANAL-DUENO.md § 1 y § Cambios de datos):
 *
 * - `WhatsappSender`: los números registrados en el WABA, con su estado,
 *   nombre visible y calidad. La audiencia de cada número (clientes o
 *   negocios) no la sabe Telnyx: se pasa por argumento la primera vez y se
 *   conserva después.
 * - `WhatsappTemplate`: todas las plantillas del WABA con su estado en
 *   Meta. La `key` (el uso que le da el código) se asigna por nombre cuando
 *   el nombre es único, y a mano con `--clave` cuando hay varias con el
 *   mismo nombre (p.ej. `confirmacion_cita` en `es` y en `es_ES`).
 *
 * Idempotente: se puede ejecutar tantas veces como haga falta; los webhooks
 * `whatsapp.template.*` mantienen los estados al día entre ejecuciones.
 *
 * Uso (dev, dentro del contenedor; en producción, contra Cloud SQL por el
 * proxy — ver AGENTS.md § Deployment Notes):
 *   npx tsx scripts/manual/sincronizarWhatsapp.mts \
 *     --clientes +34930454394 --negocios +34930453218 \
 *     --clave confirmacion_cita=01a0a982-2365-7b3b-83ae-15572b26342c
 *
 * Solo lee de Telnyx; escribe únicamente en la BD a la que apunte
 * DATABASE_URL.
 */
import { whatsappAdapter } from "../../src/adapters/whatsapp/WhatsAppAdapter.js";
import { prisma } from "../../src/lib/prisma.js";
import { invalidarCacheRemitentes } from "../../src/modules/whatsapp/service.js";

interface Argumentos {
  clientes?: string;
  negocios?: string;
  claves: Map<string, string>;
}

function leerArgumentos(argv: string[]): Argumentos {
  const args: Argumentos = { claves: new Map() };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--clientes" && value) {
      args.clientes = value;
      i += 1;
    } else if (flag === "--negocios" && value) {
      args.negocios = value;
      i += 1;
    } else if (flag === "--clave" && value) {
      const [key, templateId] = value.split("=");
      if (!key || !templateId) {
        throw new Error(`--clave espera nombre=uuid, recibido "${value}"`);
      }
      args.claves.set(key, templateId);
      i += 1;
    } else {
      throw new Error(`Argumento no reconocido: ${flag}`);
    }
  }
  return args;
}

async function sincronizarRemitentes(args: Argumentos): Promise<void> {
  const numeros = await whatsappAdapter.listWabaPhoneNumbers();
  console.log(`[WhatsApp] ${numeros.length} número(s) en el WABA`);

  const audiencias = new Map<string, "client" | "owner">();
  if (args.clientes) audiencias.set(args.clientes, "client");
  if (args.negocios) audiencias.set(args.negocios, "owner");

  for (const numero of numeros) {
    const existente = await prisma.whatsappSender.findUnique({
      where: { phoneNumber: numero.phoneNumber },
    });
    const audience = audiencias.get(numero.phoneNumber) ?? existente?.audience;
    if (!audience) {
      console.warn(
        `  ${numero.phoneNumber} (${numero.status}) sin audiencia: pásala con --clientes o --negocios; se omite`
      );
      continue;
    }
    const datos = {
      audience,
      phoneNumber: numero.phoneNumber,
      metaPhoneNumberId: numero.metaPhoneNumberId,
      displayName: numero.displayName,
      displayNameStatus: numero.displayNameStatus,
      status: numero.status,
      qualityRating: numero.qualityRating,
      messagingLimit: numero.messagingLimit,
      lastSyncedAt: new Date(),
    };
    // Si otro número tenía esta audiencia (cambio de número), se libera
    // antes: `audience` es única.
    await prisma.whatsappSender.updateMany({
      where: { audience, NOT: { phoneNumber: numero.phoneNumber } },
      data: { audience: `${audience}:anterior:${Date.now()}` },
    });
    await prisma.whatsappSender.upsert({
      where: { phoneNumber: numero.phoneNumber },
      create: datos,
      update: datos,
    });
    console.log(
      `  ${numero.phoneNumber} → ${audience} · ${numero.status} · «${numero.displayName ?? "—"}» (${numero.displayNameStatus ?? "sin revisión"}) · calidad ${numero.qualityRating ?? "—"}`
    );
  }
  invalidarCacheRemitentes();
}

async function sincronizarPlantillas(args: Argumentos): Promise<void> {
  const wabaId = process.env.WHATSAPP_WABA_ID;
  if (!wabaId) {
    throw new Error(
      "Falta WHATSAPP_WABA_ID (UUID Telnyx del WABA) para listar las plantillas"
    );
  }
  const plantillas = await whatsappAdapter.listTemplates(wabaId);
  console.log(`[WhatsApp] ${plantillas.length} plantilla(s) en el WABA`);

  // Nombre → cuántas plantillas lo comparten (idiomas distintos).
  const porNombre = new Map<string, number>();
  for (const plantilla of plantillas) {
    porNombre.set(plantilla.name, (porNombre.get(plantilla.name) ?? 0) + 1);
  }
  const claveDeId = new Map<string, string>();
  for (const [key, templateId] of args.claves) {
    claveDeId.set(templateId, key);
  }

  for (const plantilla of plantillas) {
    const existente = await prisma.whatsappTemplate.findUnique({
      where: { telnyxTemplateId: plantilla.telnyxTemplateId },
    });
    let key: string | null | undefined =
      claveDeId.get(plantilla.telnyxTemplateId) ??
      existente?.key ??
      (porNombre.get(plantilla.name) === 1 ? plantilla.name : null);

    // Una clave asignada a mano a otra plantilla se libera de la anterior.
    if (key) {
      await prisma.whatsappTemplate.updateMany({
        where: { key, NOT: { telnyxTemplateId: plantilla.telnyxTemplateId } },
        data: { key: null },
      });
    }

    const datos = {
      key,
      name: plantilla.name,
      language: plantilla.language,
      telnyxTemplateId: plantilla.telnyxTemplateId,
      metaTemplateId: plantilla.metaTemplateId,
      category: plantilla.category,
      status: plantilla.status,
      qualityRating: plantilla.qualityRating,
      rejectionReason: plantilla.rejectionReason,
      components: plantilla.components as object | undefined,
      lastSyncedAt: new Date(),
    };
    await prisma.whatsappTemplate.upsert({
      where: { telnyxTemplateId: plantilla.telnyxTemplateId },
      create: datos,
      update: datos,
    });
    console.log(
      `  ${plantilla.name}/${plantilla.language} · ${plantilla.status} · ${plantilla.category} · clave ${key ?? "—"} · ${plantilla.telnyxTemplateId}`
    );
  }
}

async function main() {
  const args = leerArgumentos(process.argv.slice(2));
  await sincronizarRemitentes(args);
  await sincronizarPlantillas(args);
}

main()
  .catch((error) => {
    console.error(
      "[WhatsApp] Sincronización fallida:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

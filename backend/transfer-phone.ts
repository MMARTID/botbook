#!/usr/bin/env node
import { prisma } from "./src/lib/prisma.js";
import { execSync } from "child_process";

async function transferPhoneNumber(fromBusinessName: string, toBusinessName: string) {
  console.log(`\n📱 Transferiendo número de "${fromBusinessName}" → "${toBusinessName}"...\n`);

  try {
    const fromBusiness = await prisma.business.findFirst({
      where: {
        name: {
          contains: fromBusinessName,
          mode: "insensitive",
        },
      },
    });

    const toBusiness = await prisma.business.findFirst({
      where: {
        name: {
          contains: toBusinessName,
          mode: "insensitive",
        },
      },
    });

    if (!fromBusiness) {
      throw new Error(`Negocio "${fromBusinessName}" no encontrado`);
    }
    if (!toBusiness) {
      throw new Error(`Negocio "${toBusinessName}" no encontrado`);
    }

    const phoneNumber = fromBusiness.telnyxPhoneNumber || fromBusiness.retellPhoneNumber;
    if (!phoneNumber) {
      throw new Error(`"${fromBusinessName}" no tiene número asignado`);
    }

    console.log(`📋 Detalles:`);
    console.log(`  De: ${fromBusiness.name} (${fromBusiness.id})`);
    console.log(`  A:  ${toBusiness.name} (${toBusiness.id})`);
    console.log(`  Número: ${phoneNumber}\n`);

    await prisma.business.update({
      where: { id: fromBusiness.id },
      data: {
        telnyxPhoneNumber: null,
        telnyxPhoneNumberId: null,
        retellPhoneNumber: null,
        retellPhoneNumberId: null,
        twilioPhoneNumberStatus: "pending",
      },
    });
    console.log(`✓ Limpiado: ${fromBusiness.name}`);

    await prisma.business.update({
      where: { id: toBusiness.id },
      data: {
        telnyxPhoneNumber: phoneNumber,
        telnyxPhoneNumberId: phoneNumber,
        retellPhoneNumber: phoneNumber,
        retellPhoneNumberId: phoneNumber,
        twilioPhoneNumberStatus: "active",
      },
    });
    console.log(`✓ Asignado: ${toBusiness.name}`);

    console.log(`\n✅ Transferencia completada. Reiniciando backend...\n`);

    try {
      execSync("pkill -f 'tsx.*server.ts'", { stdio: "ignore" });
      console.log("⏹️  Backend detenido");

      await new Promise((r) => setTimeout(r, 1500));

      execSync("npm run dev > /tmp/backend.log 2>&1 &", { stdio: "ignore" });
      console.log("▶️  Backend reiniciado en background");
      console.log("📋 Logs: tail -f /tmp/backend.log\n");
    } catch (err) {
      console.warn("⚠️  No se pudo reiniciar el backend automáticamente");
      console.warn("   Ejecuta manualmente: npm run dev\n");
    }

    process.exit(0);
  } catch (error) {
    console.error(
      `\n❌ Error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const from = process.argv[2];
const to = process.argv[3];

if (!from || !to) {
  console.log(
    "\nUso: npx tsx transfer-phone.ts <from-business> <to-business>\n" +
      "Ejemplo: npx tsx transfer-phone.ts peluquería barbería\n"
  );
  process.exit(1);
}

transferPhoneNumber(from, to);

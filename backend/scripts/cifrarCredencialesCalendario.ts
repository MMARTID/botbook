// Recifra las credenciales de calendar_connections que sigan en claro
// (filas anteriores al cifrado en reposo, o escritas por la revisión anterior
// durante el despliegue). Idempotente: las que ya son un sobre cifrado se
// dejan como están. Se ejecuta una vez tras desplegar el PR del cifrado,
// contra la BD de producción vía cloud-sql-proxy, con la MISMA clave que
// tiene Cloud Run:
//
//   export CALENDAR_CREDENTIALS_KEY=$(gcloud secrets versions access latest \
//     --secret=CALENDAR_CREDENTIALS_KEY --project=project-84381467-a606-4b71-a6e)
//   DATABASE_URL=... npx tsx scripts/cifrarCredencialesCalendario.ts
//
// Con --dry-run solo cuenta, no escribe.
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import {
  cifrarJson,
  comprobarClaveDeCifrado,
  esSobreCifrado,
} from "../src/lib/cifradoDeCredenciales.js";

async function main() {
  const soloContar = process.argv.includes("--dry-run");
  comprobarClaveDeCifrado();

  const filas = await prisma.calendarConnection.findMany({
    where: { NOT: { credentials: { equals: Prisma.DbNull } } },
    select: { id: true, businessId: true, provider: true, credentials: true },
  });

  let enClaro = 0;
  let yaCifradas = 0;
  for (const fila of filas) {
    if (esSobreCifrado(fila.credentials)) {
      yaCifradas += 1;
      continue;
    }
    enClaro += 1;
    if (soloContar) continue;
    // updateMany condicionado al valor actual: si la revisión nueva ya la
    // recifró entre el findMany y aquí, no se pisa.
    await prisma.calendarConnection.updateMany({
      where: {
        id: fila.id,
        credentials: { equals: fila.credentials as never },
      },
      data: { credentials: cifrarJson(fila.credentials as object) as never },
    });
    console.log(
      `[Calendar] Cifradas credenciales de ${fila.provider} del negocio ${fila.businessId}`
    );
  }

  console.log(
    `[Calendar] ${filas.length} filas con credenciales: ${yaCifradas} ya cifradas, ${enClaro} en claro${soloContar ? " (dry-run, sin cambios)" : " → cifradas"}`
  );
}

main()
  .catch((error) => {
    console.error("[Calendar] Error recifrando credenciales:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

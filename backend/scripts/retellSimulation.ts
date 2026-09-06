/**
 * CLI de Simulation Testing de Retell.
 *
 *   npm run sim -- sync [--niche <nicho>] [--smoke]
 *   npm run sim -- run [--niche <nicho>] [--smoke] [--no-wait]
 *   npm run sim -- inspect <batchJobId>
 *
 * Sin --niche, "sync" y "run" recorren los cinco nichos (suite transversal).
 * "run" espera a que el batch termine salvo que se pase --no-wait.
 *
 * Solo toca cuentas de prueba (@alhabla.local): no usa producción, ni números
 * de Telnyx, ni el calendario real del negocio (las tools van mockeadas).
 */
import { prisma } from "../src/lib/prisma.js";
import {
  CATALOG_VERSION,
  getCases,
  type SimulationNiche,
} from "../src/modules/retellSimulation/catalog.js";
import {
  inspectBatch,
  listNiches,
  runNiche,
  syncNiche,
  type NicheRunReport,
} from "../src/modules/retellSimulation/service.js";

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  return { command, positional, flags };
}

function resolveNiches(flagValue: string | boolean | undefined) {
  if (typeof flagValue !== "string") return listNiches();

  const niches = listNiches();
  if (!niches.includes(flagValue as SimulationNiche)) {
    throw new Error(
      `Nicho desconocido "${flagValue}". Válidos: ${niches.join(", ")}`
    );
  }
  return [flagValue as SimulationNiche];
}

function printReport(report: NicheRunReport) {
  const { passCount, failCount, errorCount, totalCount } = report;
  console.log(
    `\n[${report.niche}] batch ${report.batchJobId} — ${report.status} · ` +
      `${passCount}/${totalCount} pasan · ${failCount} fallan · ` +
      `${errorCount} con error de ejecución`
  );

  for (const run of report.runs) {
    if (run.status === "pass") continue;
    // Un `error` es un fallo de la propia ejecución del test, no una
    // regresión del agente: se marca aparte para no leerlo como tal.
    const etiqueta = run.status === "error" ? "ERROR EJEC." : "FALLA";
    console.log(`  ${etiqueta} ${run.name ?? run.testCaseDefinitionId}`);
    if (run.resultExplanation) {
      console.log(`    ${run.resultExplanation}`);
    }
  }
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const smokeOnly = flags.smoke === true;
  const wait = flags["no-wait"] !== true;
  // Sin --llm el LLM se resuelve desde la BD acotando a cuentas de prueba.
  // Pasarlo a mano permite ejecutar la batería donde no hay BD de desarrollo
  // (por ejemplo, un workflow de CI), a costa de perder esa red de seguridad.
  const llmId = typeof flags.llm === "string" ? flags.llm : undefined;

  if (llmId && typeof flags.niche !== "string") {
    throw new Error("--llm exige --niche: un llm_id pertenece a un solo nicho");
  }

  console.log(`[RetellSim] catálogo ${CATALOG_VERSION}`);

  switch (command) {
    case "sync": {
      for (const niche of resolveNiches(flags.niche)) {
        const synced = await syncNiche({ niche, smokeOnly, llmId });
        const creados = synced.filter((item) => item.created).length;
        console.log(
          `[${niche}] ${synced.length} casos sincronizados ` +
            `(${creados} nuevos, ${synced.length - creados} actualizados)`
        );
      }
      break;
    }

    case "run": {
      const reports: NicheRunReport[] = [];
      for (const niche of resolveNiches(flags.niche)) {
        reports.push(await runNiche({ niche, smokeOnly, wait, llmId }));
      }

      if (!wait) {
        console.log(
          "\nLanzados sin esperar. Consúltalos con:\n" +
            reports
              .map((r) => `  npm run sim -- inspect ${r.batchJobId}`)
              .join("\n")
        );
        break;
      }

      reports.forEach(printReport);

      const fallos = reports.reduce((acc, r) => acc + r.failCount, 0);
      const errores = reports.reduce((acc, r) => acc + r.errorCount, 0);
      console.log(
        `\nTotal: ${fallos} casos fallados, ${errores} con error de ejecución`
      );
      // Solo un fallo conversacional marca la ejecución como fallida; un
      // error de ejecución se informa pero no se interpreta como regresión.
      if (fallos > 0) process.exitCode = 1;
      break;
    }

    case "inspect": {
      const batchJobId = positional[0];
      if (!batchJobId) {
        throw new Error("Falta el id del batch: sim -- inspect <batchJobId>");
      }
      const { batch, runs } = await inspectBatch(batchJobId);
      printReport({
        niche: "peluqueria",
        llmId: "",
        batchJobId: batch.testCaseBatchJobId,
        status: batch.status,
        totalCount: batch.totalCount,
        passCount: batch.passCount,
        failCount: batch.failCount,
        errorCount: batch.errorCount,
        runs,
      });
      break;
    }

    case "list": {
      for (const niche of resolveNiches(flags.niche)) {
        const cases = getCases({ niche, smokeOnly });
        console.log(`\n[${niche}] ${cases.length} casos`);
        for (const item of cases) {
          console.log(
            `  ${item.smoke ? "humo " : "     "} ${item.slug} → ` +
              `${item.expected.callOutcome}/${item.expected.escalationReason}`
          );
        }
      }
      break;
    }

    default:
      console.log(
        "Uso:\n" +
          "  npm run sim -- list    [--niche <nicho>] [--smoke]\n" +
          "  npm run sim -- sync    [--niche <nicho>] [--smoke] [--llm <id>]\n" +
          "  npm run sim -- run     [--niche <nicho>] [--smoke] [--llm <id>]\n" +
          "                         [--no-wait]\n" +
          "  npm run sim -- inspect <batchJobId>\n\n" +
          `Nichos: ${listNiches().join(", ")}`
      );
      process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(
    `[RetellSim] ${error instanceof Error ? error.message : String(error)}`
  );
  await prisma.$disconnect();
  process.exit(1);
});

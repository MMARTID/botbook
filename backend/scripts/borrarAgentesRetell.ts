/**
 * Borra agentes de Retell (y sus LLM, si nadie más los usa) y deja limpia la
 * base de datos: si un agente borrado era el de un negocio, su fila Agent se
 * queda sin retellAgentId/retellLlmId para que ningún sync intente hablar con
 * un agente que ya no existe.
 *
 * Es IRREVERSIBLE en Retell. Sin --confirm solo enseña lo que haría.
 *
 * Uso (con DATABASE_URL y RETELL_API_KEY de producción en el entorno):
 *   npx tsx scripts/borrarAgentesRetell.ts --ids id1,id2 [--llms llm1,llm2] [--proteger id3] [--confirm]
 *
 * --llms: LLM sueltos (sin ningún agente) que el inventario listó aparte.
 *
 * Los ids salen de scripts/inventarioAgentesRetell.ts. Los de --proteger y
 * los de RETELL_DEMO_*_AGENT_ID no se borran aunque vengan en --ids.
 */
import { prisma } from "../src/lib/prisma.js";
import { retellAdapter } from "../src/adapters/retell/RetellAdapter.js";
import {
  idsProtegidosPorEntorno,
  inventariarAgentesRetell,
  type AgenteInventariado,
} from "./inventarioAgentesRetell.js";

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const ids = (readArgument("--ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error("Indica qué borrar con --ids id1,id2 (los ids salen de inventarioAgentesRetell.ts).");
    process.exitCode = 2;
    return;
  }
  const protegidos = idsProtegidosPorEntorno();
  for (const id of (readArgument("--proteger") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    protegidos.add(id);
  }

  const inventario = await inventariarAgentesRetell({ protegidos });
  const porId = new Map(inventario.map((a) => [a.agentId, a]));

  const aBorrar: AgenteInventariado[] = [];
  for (const id of ids) {
    const agente = porId.get(id);
    if (!agente) {
      console.warn(`[Borrado] ${id} no existe en Retell; se ignora.`);
      continue;
    }
    if (agente.clase === "demo" || protegidos.has(id)) {
      console.warn(`[Borrado] ${id} (${agente.nombre}) está protegido; se ignora.`);
      continue;
    }
    if (agente.clase === "negocio-con-telnyx") {
      console.warn(
        `[Borrado] ${id} es el respaldo de Retell de "${agente.negocio}", que tiene Telnyx; NO se borra (quítalo de --ids si de verdad quieres).`
      );
      continue;
    }
    aBorrar.push(agente);
  }

  // Un LLM solo se borra si ningún agente que se conserva lo usa.
  const llmsQueSeConservan = new Set(
    inventario.filter((a) => !aBorrar.includes(a)).map((a) => a.llmId).filter(Boolean)
  );

  const llmsSueltos = (readArgument("--llms") ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    .filter((llmId) => {
      if (llmsQueSeConservan.has(llmId)) {
        console.warn(`[Borrado] El LLM ${llmId} lo usa un agente que se conserva; se ignora.`);
        return false;
      }
      return true;
    });

  console.log(`\n${confirm ? "BORRANDO" : "ENSAYO — se borrarían"} ${aBorrar.length} agente(s) y ${llmsSueltos.length} LLM suelto(s):`);
  for (const agente of aBorrar) {
    const borraLlm = agente.llmId && !llmsQueSeConservan.has(agente.llmId);
    console.log(
      `  ${agente.agentId}  ${agente.nombre}  [${agente.clase}${agente.negocio ? ` · ${agente.negocio}` : ""}]  llm=${agente.llmId ?? "?"}${borraLlm ? " (también el LLM)" : agente.llmId ? " (LLM compartido, se conserva)" : ""}`
    );
  }
  if (!confirm) {
    console.log("\nSin --confirm no se ha tocado nada. Repite con --confirm para ejecutarlo.");
    return;
  }

  let borrados = 0;
  for (const agente of aBorrar) {
    try {
      await retellAdapter.deleteAgent(agente.agentId);
      if (agente.llmId && !llmsQueSeConservan.has(agente.llmId)) {
        await retellAdapter.deleteLlm(agente.llmId).catch((error) => {
          console.warn(`[Borrado] Agente ${agente.agentId} borrado pero su LLM ${agente.llmId} no: ${String(error)}`);
        });
      }
      if (agente.businessId) {
        await prisma.agent.updateMany({
          where: { retellAgentId: agente.agentId },
          data: { retellAgentId: null, retellLlmId: null },
        });
      }
      borrados += 1;
      console.log(`[Borrado] ${agente.agentId} (${agente.nombre}) eliminado.`);
    } catch (error) {
      console.error(`[Borrado] No se pudo borrar ${agente.agentId}: ${String(error)}`);
    }
  }
  let llmsBorrados = 0;
  for (const llmId of llmsSueltos) {
    try {
      await retellAdapter.deleteLlm(llmId);
      llmsBorrados += 1;
      console.log(`[Borrado] LLM suelto ${llmId} eliminado.`);
    } catch (error) {
      console.error(`[Borrado] No se pudo borrar el LLM ${llmId}: ${String(error)}`);
    }
  }
  console.log(`\n${borrados}/${aBorrar.length} agente(s) y ${llmsBorrados}/${llmsSueltos.length} LLM suelto(s) borrados.`);
}

main()
  .catch((error) => {
    console.error("[Borrado] Error:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

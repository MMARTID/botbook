/**
 * Inventario de la cuenta de Retell cruzado con la base de datos: qué agente
 * pertenece a qué negocio, cuáles son los de la demo de la landing y cuáles
 * no los referencia nadie. Solo lectura. Es el paso previo obligatorio de
 * scripts/borrarAgentesRetell.ts.
 *
 * Uso (con DATABASE_URL y RETELL_API_KEY de producción en el entorno):
 *   npx tsx scripts/inventarioAgentesRetell.ts [--proteger id1,id2]
 *
 * --proteger: ids que hay que tratar como intocables aunque no aparezcan en
 * las variables RETELL_DEMO_*_AGENT_ID de esta shell (los ids de la demo
 * viven en el entorno de Cloud Run, no en el .env local).
 */
import { prisma } from "../src/lib/prisma.js";
import { retellAdapter } from "../src/adapters/retell/RetellAdapter.js";

export type ClaseDeAgente =
  | "demo"
  | "negocio-con-telnyx"
  | "negocio-sin-telnyx"
  | "huerfano";

export type AgenteInventariado = {
  agentId: string;
  nombre: string;
  llmId: string | null;
  clase: ClaseDeAgente;
  negocio: string | null;
  businessId: string | null;
  modificado: string | null;
};

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function idsProtegidosPorEntorno(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const ids = new Set<string>();
  for (const [clave, valor] of Object.entries(env)) {
    if (/^RETELL_DEMO_.*AGENT_ID$/.test(clave) && valor) ids.add(valor);
  }
  return ids;
}

export async function inventariarAgentesRetell(options: {
  protegidos: Set<string>;
}): Promise<AgenteInventariado[]> {
  const [agentesRetell, filas] = await Promise.all([
    retellAdapter.listAgents(),
    prisma.agent.findMany({
      where: { retellAgentId: { not: null } },
      select: {
        retellAgentId: true,
        retellLlmId: true,
        telnyxAssistantId: true,
        business: { select: { id: true, name: true } },
      },
    }),
  ]);
  const filaPorAgente = new Map(filas.map((fila) => [fila.retellAgentId!, fila]));

  const resultado: AgenteInventariado[] = [];
  for (const agente of agentesRetell) {
    const fila = filaPorAgente.get(agente.agent_id);
    let llmId: string | null = fila?.retellLlmId ?? null;
    if (!llmId) {
      // El listado no trae el LLM: se pide uno a uno solo para los que la BD
      // no conoce (los huérfanos y la demo).
      try {
        const detalle = await retellAdapter.getAgent(agente.agent_id);
        const engine = detalle.response_engine as { llm_id?: string } | undefined;
        llmId = engine?.llm_id ?? null;
      } catch {
        llmId = null;
      }
    }
    const clase: ClaseDeAgente = options.protegidos.has(agente.agent_id)
      ? "demo"
      : fila
        ? fila.telnyxAssistantId
          ? "negocio-con-telnyx"
          : "negocio-sin-telnyx"
        : "huerfano";
    resultado.push({
      agentId: agente.agent_id,
      nombre: agente.agent_name,
      llmId,
      clase,
      negocio: fila?.business.name ?? null,
      businessId: fila?.business.id ?? null,
      modificado: agente.user_modified_timestamp
        ? new Date(agente.user_modified_timestamp).toISOString().slice(0, 16).replace("T", " ")
        : null,
    });
  }
  return resultado.sort((a, b) => a.clase.localeCompare(b.clase) || a.nombre.localeCompare(b.nombre));
}

async function main() {
  const protegidos = idsProtegidosPorEntorno();
  for (const id of (readArgument("--proteger") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    protegidos.add(id);
  }

  const inventario = await inventariarAgentesRetell({ protegidos });
  const llms = await retellAdapter.listLlms();
  const llmsEnUso = new Set(inventario.map((a) => a.llmId).filter(Boolean));
  const llmsHuerfanos = llms.filter((llm) => !llmsEnUso.has(llm.llm_id));

  const etiqueta: Record<ClaseDeAgente, string> = {
    demo: "DEMO (intocable)",
    "negocio-con-telnyx": "negocio con Telnyx (respaldo, conservar)",
    "negocio-sin-telnyx": "negocio SIN Telnyx",
    huerfano: "sin referencia en la BD",
  };
  console.log(`\n${inventario.length} agente(s) en la cuenta de Retell · ${llms.length} LLM(s)\n`);
  for (const a of inventario) {
    console.log(
      `${etiqueta[a.clase].padEnd(40)} ${a.agentId}  ${a.nombre.padEnd(44).slice(0, 44)}  ${(a.negocio ?? "—").padEnd(34).slice(0, 34)}  llm=${a.llmId ?? "?"}  mod=${a.modificado ?? "?"}`
    );
  }
  const candidatos = inventario.filter((a) => a.clase === "huerfano" || a.clase === "negocio-sin-telnyx");
  console.log(`\nCandidatos a borrar (huérfanos + negocios sin Telnyx): ${candidatos.length}`);
  if (candidatos.length > 0) {
    console.log(`  --ids ${candidatos.map((a) => a.agentId).join(",")}`);
  }
  console.log(`LLM sin ningún agente: ${llmsHuerfanos.length}${llmsHuerfanos.length ? " → " + llmsHuerfanos.map((l) => l.llm_id).join(",") : ""}`);
  if (protegidos.size === 0) {
    console.warn(
      "\nAVISO: no hay ningún id protegido (RETELL_DEMO_*_AGENT_ID no está en esta shell). Pasa --proteger con los ids de la demo antes de borrar nada."
    );
  }
}

const esEntrada = process.argv[1]?.endsWith("inventarioAgentesRetell.ts");
if (esEntrada) {
  main()
    .catch((error) => {
      console.error("[Inventario] Error:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

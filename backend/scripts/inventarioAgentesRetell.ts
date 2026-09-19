/**
 * Inventario de la cuenta de Retell cruzado con la base de datos: qué agente
 * pertenece a qué negocio, cuáles son los de la demo de la landing y cuáles
 * no los referencia nadie. Solo lectura. Es el paso previo obligatorio de
 * scripts/borrarAgentesRetell.ts.
 *
 * Uso (con DATABASE_URL y RETELL_API_KEY del entorno que quieras inventariar):
 *   npx tsx scripts/inventarioAgentesRetell.ts [--proteger id1,id2]
 *
 * --proteger: ids que hay que tratar como intocables aunque no aparezcan en
 * las variables RETELL_DEMO_*_AGENT_ID de esta shell (los ids de la demo
 * viven en el entorno de Cloud Run, no en el .env local).
 *
 * DESARROLLO Y PRODUCCIÓN COMPARTEN LA CUENTA DE RETELL. `listAgents()`
 * devuelve la cuenta entera, pero el cruce se hace contra UNA sola base de
 * datos, así que los agentes del OTRO entorno aparecen aquí sin fila. Antes
 * se les llamaba "huérfanos" y se ofrecían en la línea de `--ids` lista para
 * copiar y pegar en el borrado: así desaparecieron los agentes de Retell de
 * seis negocios de desarrollo. Ahora son `desconocido`, se listan aparte y
 * NO entran en los candidatos; borrarlos exige `--incluir-desconocidos` en
 * scripts/borrarAgentesRetell.ts.
 */
import { prisma } from "../src/lib/prisma.js";
import { retellAdapter } from "../src/adapters/retell/RetellAdapter.js";

export type ClaseDeAgente =
  | "demo"
  | "negocio-con-telnyx"
  | "negocio-sin-telnyx"
  /** Está en la cuenta de Retell pero no en ESTA base de datos. Puede ser de
   * otro entorno (dev/producción comparten cuenta) o de una BD distinta de la
   * que tiene esta shell. Nunca es candidato automático a borrado. */
  | "desconocido";

export type AgenteInventariado = {
  agentId: string;
  nombre: string;
  llmId: string | null;
  clase: ClaseDeAgente;
  negocio: string | null;
  businessId: string | null;
  modificado: string | null;
};

/** Describe a qué base de datos apunta esta shell, sin revelar la contraseña.
 * Existe porque el daño de estos scripts depende por completo de contra qué BD
 * se cruza la cuenta de Retell, y eso no se veía por ninguna parte. */
export function describirEntorno(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) return "DATABASE_URL sin definir";
  try {
    const u = new URL(url);
    const base = u.pathname.replace(/^\//, "") || "(sin nombre)";
    const host = u.searchParams.get("host") ?? u.host;
    return `${base} en ${host}`;
  } catch {
    return "DATABASE_URL no es una URL válida";
  }
}

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
      // no conoce (los desconocidos y la demo).
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
        : "desconocido";
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
    desconocido: "NO está en esta BD (¿otro entorno?)",
  };
  console.log(`\nBase de datos de esta shell: ${describirEntorno()}`);
  console.log(`${inventario.length} agente(s) en la cuenta de Retell · ${llms.length} LLM(s)\n`);
  for (const a of inventario) {
    console.log(
      `${etiqueta[a.clase].padEnd(40)} ${a.agentId}  ${a.nombre.padEnd(44).slice(0, 44)}  ${(a.negocio ?? "—").padEnd(34).slice(0, 34)}  llm=${a.llmId ?? "?"}  mod=${a.modificado ?? "?"}`
    );
  }
  // Solo negocios de ESTA base de datos. Los `desconocido` quedan fuera a
  // propósito: son la vía por la que se borraron agentes de otro entorno.
  const candidatos = inventario.filter((a) => a.clase === "negocio-sin-telnyx");
  console.log(`\nCandidatos a borrar (negocios de esta BD sin Telnyx): ${candidatos.length}`);
  if (candidatos.length > 0) {
    console.log(`  --ids ${candidatos.map((a) => a.agentId).join(",")}`);
  }
  const desconocidos = inventario.filter((a) => a.clase === "desconocido");
  if (desconocidos.length > 0) {
    console.warn(
      `\n${desconocidos.length} agente(s) están en la cuenta de Retell pero NO en esta base de datos` +
        ` (${describirEntorno()}).\nDesarrollo y producción comparten cuenta, así que lo más probable` +
        ` es que sean del otro entorno. NO se ofrecen para borrar.` +
        `\n  ${desconocidos.map((a) => `${a.agentId} (${a.nombre})`).join("\n  ")}`
    );
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

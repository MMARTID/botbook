import { prisma } from "../../lib/prisma.js";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";
import type { RetellTestRun } from "../../adapters/retell/RetellAdapter.js";
import {
  CATALOG_VERSION,
  SIMULATION_MODEL,
  SIMULATION_NICHES,
  buildCaseName,
  buildCaseToolMocks,
  buildCaseUserPrompt,
  getCases,
  type SimulationCase,
  type SimulationNiche,
} from "./catalog.js";

/**
 * Dominio de las cuentas de prueba. La resolución de LLM se limita a estas
 * cuentas a propósito: así una simulación no puede apuntar al agente de un
 * cliente real ni aunque coincida el tipo de negocio.
 */
const FIXTURE_EMAIL_DOMAIN = "@alhabla.local";

const BATCH_POLL_INTERVAL_MS = 5000;
const BATCH_POLL_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Devuelve el Retell LLM de la cuenta de pruebas de un nicho. Falla claro si
 * hay cero o más de una candidata: elegir "la primera" escondería que se está
 * midiendo un agente distinto del que se cree.
 */
export async function resolveNicheLlmId(
  niche: SimulationNiche
): Promise<string> {
  const agents = await prisma.agent.findMany({
    where: {
      active: true,
      deletedAt: null,
      retellLlmId: { not: null },
      business: {
        businessType: niche,
        users: { some: { email: { endsWith: FIXTURE_EMAIL_DOMAIN } } },
      },
    },
    select: {
      retellLlmId: true,
      business: {
        select: { name: true, users: { select: { email: true } } },
      },
    },
  });

  if (agents.length === 0) {
    throw new Error(
      `No hay ninguna cuenta de pruebas (${FIXTURE_EMAIL_DOMAIN}) con agente ` +
        `de Retell para el nicho "${niche}"`
    );
  }

  if (agents.length > 1) {
    const emails = agents
      .map((agent) => agent.business.users[0]?.email ?? "(sin email)")
      .join(", ");
    throw new Error(
      `Hay ${agents.length} cuentas de pruebas para el nicho "${niche}" ` +
        `(${emails}); deja solo una o pasa el llm_id a mano`
    );
  }

  return agents[0].retellLlmId!;
}

export interface SyncedCase {
  slug: string;
  niche: SimulationNiche;
  name: string;
  testCaseDefinitionId: string;
  created: boolean;
}

/**
 * Deja en Retell exactamente los casos del catálogo para un nicho. Identifica
 * cada definición por su nombre: si ya existe se actualiza (siempre, para que
 * el remoto no quede desfasado en silencio), si no, se crea.
 */
export async function syncNiche(options: {
  niche: SimulationNiche;
  llmId?: string;
  smokeOnly?: boolean;
}): Promise<SyncedCase[]> {
  const llmId = options.llmId ?? (await resolveNicheLlmId(options.niche));
  const cases = getCases({
    niche: options.niche,
    smokeOnly: options.smokeOnly,
  });

  const remote = await retellAdapter.listTestCaseDefinitions(llmId);
  const remoteByName = new Map(remote.map((item) => [item.name, item]));

  const synced: SyncedCase[] = [];

  for (const simulationCase of cases) {
    const name = buildCaseName(simulationCase);
    const payload = buildDefinitionInput(simulationCase, llmId);
    const existing = remoteByName.get(name);

    const definition = existing
      ? await retellAdapter.updateTestCaseDefinition(
          existing.testCaseDefinitionId,
          payload
        )
      : await retellAdapter.createTestCaseDefinition(payload);

    synced.push({
      slug: simulationCase.slug,
      niche: simulationCase.niche,
      name,
      testCaseDefinitionId: definition.testCaseDefinitionId,
      created: !existing,
    });

    console.log(
      `[RetellSim] ${existing ? "actualizado" : "creado"} ${name} ` +
        `(${definition.testCaseDefinitionId})`
    );
  }

  return synced;
}

function buildDefinitionInput(
  simulationCase: SimulationCase,
  llmId: string
) {
  return {
    name: buildCaseName(simulationCase),
    llmId,
    userPrompt: buildCaseUserPrompt(simulationCase),
    metrics: simulationCase.metrics,
    dynamicVariables: {
      nombre_negocio: `Negocio de prueba de ${simulationCase.niche}`,
      zona_horaria: "Europe/Madrid",
    },
    toolMocks: buildCaseToolMocks(simulationCase),
    llmModel: SIMULATION_MODEL,
  };
}

export interface NicheRunReport {
  niche: SimulationNiche;
  llmId: string;
  batchJobId: string;
  status: "in_progress" | "complete";
  totalCount: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  runs: RetellTestRun[];
}

/**
 * Sincroniza y lanza el batch de un nicho. Si `wait` es true, sondea hasta
 * que Retell lo da por terminado y adjunta el detalle por caso — los
 * contadores agregados no dicen cuál falló.
 */
export async function runNiche(options: {
  niche: SimulationNiche;
  llmId?: string;
  smokeOnly?: boolean;
  wait?: boolean;
}): Promise<NicheRunReport> {
  const llmId = options.llmId ?? (await resolveNicheLlmId(options.niche));
  const synced = await syncNiche({
    niche: options.niche,
    llmId,
    smokeOnly: options.smokeOnly,
  });

  if (synced.length === 0) {
    throw new Error(
      `El catálogo no tiene casos para el nicho "${options.niche}"` +
        (options.smokeOnly ? " con el filtro de humo" : "")
    );
  }

  const batch = await retellAdapter.createBatchTest({
    llmId,
    testCaseDefinitionIds: synced.map((item) => item.testCaseDefinitionId),
  });

  console.log(
    `[RetellSim] batch ${batch.testCaseBatchJobId} lanzado para ` +
      `${options.niche} con ${synced.length} casos`
  );

  if (!options.wait) {
    return {
      niche: options.niche,
      llmId,
      batchJobId: batch.testCaseBatchJobId,
      status: batch.status,
      totalCount: batch.totalCount,
      passCount: batch.passCount,
      failCount: batch.failCount,
      errorCount: batch.errorCount,
      runs: [],
    };
  }

  const finished = await waitForBatch(batch.testCaseBatchJobId);
  const runs = await retellAdapter.listTestRuns(batch.testCaseBatchJobId);

  return {
    niche: options.niche,
    llmId,
    batchJobId: batch.testCaseBatchJobId,
    status: finished.status,
    totalCount: finished.totalCount,
    passCount: finished.passCount,
    failCount: finished.failCount,
    errorCount: finished.errorCount,
    runs,
  };
}

export async function waitForBatch(
  batchJobId: string,
  timeoutMs = BATCH_POLL_TIMEOUT_MS
) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const batch = await retellAdapter.getBatchTest(batchJobId);
    if (batch.status === "complete") return batch;

    if (Date.now() >= deadline) {
      throw new Error(
        `El batch ${batchJobId} sigue en curso tras ` +
          `${Math.round(timeoutMs / 1000)}s; consúltalo con "inspect"`
      );
    }

    await sleep(BATCH_POLL_INTERVAL_MS);
  }
}

export async function inspectBatch(batchJobId: string) {
  const [batch, runs] = await Promise.all([
    retellAdapter.getBatchTest(batchJobId),
    retellAdapter.listTestRuns(batchJobId),
  ]);

  return { batch, runs };
}

/** Nichos con catálogo, en orden estable — lo usa el CLI para la suite
 * transversal. */
export function listNiches(): readonly SimulationNiche[] {
  return SIMULATION_NICHES;
}

export { CATALOG_VERSION };

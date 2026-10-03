/**
 * Inventario de idiomas de los negocios, solo lectura. Dice cuántos negocios
 * hay por idioma principal e idiomas activos, y cuáles cambiarían al leer
 * sus ajustes con las reglas del catálogo (lib/idiomas): un cooficial activo
 * con español principal pasa a ser el principal (otra voz y otro saludo), o
 * un idioma que la voz del principal no habla se quita. Sirve para avisar a
 * esos dueños antes de desplegar y para saber cuántos assistants de Telnyx
 * se resincronizarán.
 *
 * Uso (con la DATABASE_URL del entorno que toque):
 *   npx tsx scripts/inventarioDeIdiomas.ts
 */
import { prisma } from "../src/lib/prisma.js";
import { parseAgentSettings } from "../src/lib/managedAgentPrompt.js";
import { resolverIdiomas } from "../src/lib/idiomas/resolver.js";

function clave(valor: unknown): string {
  return JSON.stringify(valor ?? null);
}

async function main() {
  const negocios = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      orchestrator: true,
      agentSettings: true,
      agents: {
        where: { deletedAt: null },
        select: { id: true, telnyxAssistantId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const porConfiguracion = new Map<string, number>();
  const cambian: string[] = [];

  for (const negocio of negocios) {
    const bruto = (negocio.agentSettings ?? {}) as Record<string, unknown>;
    const ajustes = parseAgentSettings(negocio.agentSettings);
    const perfil = resolverIdiomas(ajustes);
    const configuracion = `principal ${perfil.principal} · activos ${perfil.idiomas.join("+")} · voz ${perfil.voz.proveedor} · ${perfil.transcripcion.motor} · ${negocio.orchestrator}`;
    porConfiguracion.set(
      configuracion,
      (porConfiguracion.get(configuracion) ?? 0) + 1
    );

    const guardadoPrincipal = bruto.voiceLanguage ?? "es-ES";
    const guardadosIdiomas = bruto.languages ?? ["es-ES"];
    if (
      clave(guardadoPrincipal) !== clave(perfil.principal) ||
      clave(guardadosIdiomas) !== clave(perfil.idiomas)
    ) {
      const assistants = negocio.agents.filter(
        (agente) => agente.telnyxAssistantId
      ).length;
      cambian.push(
        `- ${negocio.id} «${negocio.name}» (${negocio.orchestrator}, ${assistants} assistant(s) Telnyx): guardado ${clave(guardadosIdiomas)} / ${clave(guardadoPrincipal)} → ${clave(perfil.idiomas)} / ${perfil.principal}`
      );
    }
  }

  console.log(`Negocios: ${negocios.length}\n`);
  console.log("Por configuración resuelta:");
  for (const [configuracion, total] of [...porConfiguracion].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${String(total).padStart(4)}  ${configuracion}`);
  }
  console.log(
    `\nCambiarían al aplicar las reglas del catálogo: ${cambian.length}`
  );
  for (const linea of cambian) console.log(linea);
}

main()
  .catch((error) => {
    console.error("[Idiomas] Inventario fallido:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Inventario de idiomas de los negocios, solo lectura. Dice cuántos negocios
 * hay por saludo, idiomas activos y voz, y cuáles cambiarían al leer sus
 * ajustes con las reglas del catálogo (lib/idiomas): como mucho una lengua
 * cooficial (se quitan las demás), un saludo extranjero con una cooficial
 * activa pasa a la cooficial, un idioma que la voz no habla se quita, o la
 * voz que eligió el dueño deja de atender y atiende la de su género. Sirve
 * para avisar a esos dueños antes de desplegar y para saber cuántos
 * assistants de Telnyx se resincronizarán.
 *
 * Aparte lista los que saludan en castellano con una cooficial activa: con
 * las reglas anteriores al 2026-10-05 esa cooficial pasaba a ser el saludo,
 * así que un JSON guardado así (sin normalizar; el catalán se puede activar
 * desde el 2026-09-11) saludaba en ella. La migración
 * 20261005150000_saludo_en_la_cooficial les guarda la cooficial como saludo
 * al desplegar: antes de desplegar, esta lista son los negocios que
 * corrige; después, solo los que eligieron saludar en castellano.
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
  const saludanEnCastellanoConCooficial: string[] = [];

  for (const negocio of negocios) {
    const bruto = (negocio.agentSettings ?? {}) as Record<string, unknown>;
    const ajustes = parseAgentSettings(negocio.agentSettings);
    const perfil = resolverIdiomas(ajustes);
    const elegida = typeof bruto.voz === "string" ? bruto.voz : null;
    const configuracion = `saluda en ${perfil.principal} · activos ${perfil.idiomas.join("+")} · voz ${perfil.voz.proveedor} ${perfil.voz.nombre}${elegida ? " (elegida)" : ""} · ${perfil.transcripcion.motor} · ${negocio.orchestrator}`;
    porConfiguracion.set(
      configuracion,
      (porConfiguracion.get(configuracion) ?? 0) + 1
    );

    const guardadoPrincipal = bruto.voiceLanguage ?? "es-ES";
    const guardadosIdiomas = bruto.languages ?? ["es-ES"];
    const pierdeLaVoz = elegida !== null && ajustes.voz !== elegida;
    if (
      clave(guardadoPrincipal) !== clave(perfil.principal) ||
      clave(guardadosIdiomas) !== clave(perfil.idiomas) ||
      pierdeLaVoz
    ) {
      const assistants = negocio.agents.filter(
        (agente) => agente.telnyxAssistantId
      ).length;
      cambian.push(
        `- ${negocio.id} «${negocio.name}» (${negocio.orchestrator}, ${assistants} assistant(s) Telnyx): guardado ${clave(guardadosIdiomas)} / ${clave(guardadoPrincipal)} → ${clave(perfil.idiomas)} / ${perfil.principal}${pierdeLaVoz ? ` · la voz elegida ${elegida} se olvida, atiende ${perfil.voz.nombre}` : ""}`
      );
    }
    if (perfil.cooficial && perfil.principal !== perfil.cooficial) {
      saludanEnCastellanoConCooficial.push(
        `- ${negocio.id} «${negocio.name}» (${negocio.orchestrator}): guardado ${clave(guardadosIdiomas)} / ${clave(guardadoPrincipal)} → saluda en ${perfil.principal} con ${perfil.cooficial} activo`
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
  console.log(
    `\nSaludan en castellano con una cooficial activa (antes de la migración saludo_en_la_cooficial, los que corrige; después, los que lo eligieron): ${saludanEnCastellanoConCooficial.length}`
  );
  for (const linea of saludanEnCastellanoConCooficial) console.log(linea);
}

main()
  .catch((error) => {
    console.error("[Idiomas] Inventario fallido:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

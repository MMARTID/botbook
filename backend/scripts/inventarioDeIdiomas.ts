/**
 * Inventario de idiomas de los negocios, solo lectura. Desde el 2026-10-05
 * el dueño solo elige el idioma principal y la voz: la recepcionista habla
 * los siete de ULTRA_HABLA y, con un principal cooficial, también él
 * (idiomasQueHabla en lib/idiomas/catalogo.ts). El inventario dice:
 *
 * - cuántos negocios hay por principal, idiomas que habla y voz;
 * - a cuáles les cambia el principal o la voz al leer sus ajustes con las
 *   reglas del catálogo (a esos dueños hay que avisarles antes de
 *   desplegar): una cooficial guardada en `languages` con otro principal
 *   pasa a ser el principal, o la voz que eligió el dueño deja de atender y
 *   atiende la de su género;
 * - cuántos guardan otros idiomas de los que habla con su principal (casi
 *   todos: es el cambio deliberado del 2026-10-05) y cuántos assistants de
 *   Telnyx se resincronizarán por eso;
 * - y los que están en un plan sin «elegir_voz» (Inicio) con una voz que
 *   no es la de por defecto de su género, que la conservan (el plan se mira
 *   al escribir; desde el 2026-10-07 el principal, catalán, euskera y
 *   gallego incluidos, es libre en todos los planes).
 *
 * La migración 20261005150000_saludo_en_la_cooficial guarda la cooficial
 * como principal donde las reglas anteriores ya saludaban en ella: antes de
 * desplegar, los de «cambia el principal» son los que corrige; después, no
 * debería quedar ninguno.
 *
 * Uso (con la DATABASE_URL del entorno que toque):
 *   npx tsx scripts/inventarioDeIdiomas.ts
 */
import { prisma } from "../src/lib/prisma.js";
import { parseAgentSettings } from "../src/lib/managedAgentPrompt.js";
import {
  funcionQueExige,
  resolverIdiomas,
} from "../src/lib/idiomas/resolver.js";
import { planAllows, resolvePlanId } from "../src/lib/planFeatures.js";

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
      plan: true,
      stripePriceId: true,
      agents: {
        where: { deletedAt: null },
        select: { id: true, telnyxAssistantId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const porConfiguracion = new Map<string, number>();
  const cambianPrincipalOVoz: string[] = [];
  const conVozElegidaSinElPlan: string[] = [];
  let cambianIdiomas = 0;
  let assistantsQueSeResincronizan = 0;

  for (const negocio of negocios) {
    const bruto = (negocio.agentSettings ?? {}) as Record<string, unknown>;
    const ajustes = parseAgentSettings(negocio.agentSettings);
    const perfil = resolverIdiomas(ajustes);
    const elegida = typeof bruto.voz === "string" ? bruto.voz : null;
    const assistants = negocio.agents.filter(
      (agente) => agente.telnyxAssistantId
    ).length;
    const configuracion = `principal ${perfil.principal} · habla ${perfil.idiomas.length} idiomas · voz ${perfil.voz.proveedor} ${perfil.voz.nombre}${elegida ? " (elegida)" : ""} · ${perfil.transcripcion.motor} · ${negocio.orchestrator}`;
    porConfiguracion.set(
      configuracion,
      (porConfiguracion.get(configuracion) ?? 0) + 1
    );

    const guardadoPrincipal = bruto.voiceLanguage ?? "es-ES";
    const guardadosIdiomas = bruto.languages ?? ["es-ES"];
    const pierdeLaVoz = elegida !== null && ajustes.voz !== elegida;
    if (clave(guardadoPrincipal) !== clave(perfil.principal) || pierdeLaVoz) {
      cambianPrincipalOVoz.push(
        `- ${negocio.id} «${negocio.name}» (${negocio.orchestrator}, ${assistants} assistant(s) Telnyx): guardado ${clave(guardadosIdiomas)} / ${clave(guardadoPrincipal)} → principal ${perfil.principal}${pierdeLaVoz ? ` · la voz elegida ${elegida} se olvida, atiende ${perfil.voz.nombre}` : ""}`
      );
    }
    if (clave(guardadosIdiomas) !== clave(perfil.idiomas)) {
      cambianIdiomas++;
      assistantsQueSeResincronizan += assistants;
    }
    const funcion = funcionQueExige(ajustes);
    const planId = resolvePlanId(negocio);
    if (funcion && !planAllows(planId, funcion)) {
      conVozElegidaSinElPlan.push(
        `- ${negocio.id} «${negocio.name}» (${planId}): principal ${perfil.principal} · voz ${perfil.voz.nombre}`
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
    `\nCambia el principal o la voz al aplicar las reglas del catálogo (avisar al dueño): ${cambianPrincipalOVoz.length}`
  );
  for (const linea of cambianPrincipalOVoz) console.log(linea);
  console.log(
    `\nGuardan otros idiomas que los que habla con su principal: ${cambianIdiomas} negocio(s), ${assistantsQueSeResincronizan} assistant(s) de Telnyx que se resincronizarán`
  );
  console.log(
    `\nCon una voz elegida que no es la de por defecto en un plan que no incluye elegirla (la conservan): ${conVozElegidaSinElPlan.length}`
  );
  for (const linea of conVozElegidaSinElPlan) console.log(linea);
}

main()
  .catch((error) => {
    console.error("[Idiomas] Inventario fallido:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

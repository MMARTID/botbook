import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { guardarInformacionDelNegocio } from "../businesses/informacion.js";
import type {
  AccionDelGestor,
  ContextoDeAccion,
  ResultadoDeComprobacion,
  ResultadoDeEjecucion,
} from "./acciones.js";

/**
 * «Enseñar a la recepcionista» (`actualizar_informacion`): el dueño añade,
 * cambia o quita algo de la «Información del negocio» por WhatsApp — lo
 * mismo que edita en /agente › «Dirección, contacto y políticas útiles». La
 * recepcionista la lleva en su prompt, así que al confirmar se resincroniza
 * como desde el panel (modules/businesses/informacion.ts). El catálogo, el
 * equipo, el horario y los cierres NO van aquí: tienen sus acciones y la
 * disponibilidad real sale de ellos, no de un texto libre (se lo dice al LLM
 * lib/gestorPayload.ts).
 *
 * `anterior` es un fragmento literal del texto actual, el que devuelve
 * `contexto_negocio` en `informacion`: solo `nuevo` añade al final, solo
 * `anterior` lo quita y los dos lo sustituyen. El fragmento se busca sin
 * distinguir mayúsculas ni espaciado y tiene que aparecer una sola vez.
 */

export const MAX_LARGO_DE_INFORMACION = 4000;
const MAX_LARGO_DE_FRAGMENTO = 500;

/** Una cadena vacía o `null` del LLM vale lo mismo que no mandar el campo. */
const Fragmento = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : undefined),
  z.string().trim().max(MAX_LARGO_DE_FRAGMENTO).optional()
);

const ActualizarInformacionParams = z
  .object({ anterior: Fragmento, nuevo: Fragmento })
  .strict()
  .refine((p) => p.anterior !== undefined || p.nuevo !== undefined, {
    message: "hace falta anterior, nuevo o los dos",
  });

type ActualizarInformacion = z.infer<typeof ActualizarInformacionParams>;

type FalloDelCambio =
  | "no_encontrado"
  | "repetido"
  | "ya_esta"
  | "sin_cambios"
  | "demasiado_largo";

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Apariciones de `fragmento` en `texto` sin distinguir mayúsculas ni el
 * espaciado: el LLM puede copiar un salto de línea como un espacio. */
function apariciones(
  texto: string,
  fragmento: string
): Array<{ inicio: number; fin: number }> {
  const patron = fragmento.trim().split(/\s+/).map(escaparRegex).join("\\s+");
  return [...texto.matchAll(new RegExp(patron, "giu"))].map((m) => ({
    inicio: m.index ?? 0,
    fin: (m.index ?? 0) + m[0].length,
  }));
}

/** Sin espacios dobles ni al final de línea, y como mucho una línea en
 * blanco seguida: lo que queda al quitar un fragmento de en medio. */
function ordenar(texto: string): string {
  return texto
    .split("\n")
    .map((linea) => linea.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function aplicarCambioDeInformacion(
  actual: string,
  cambio: ActualizarInformacion
): { ok: true; texto: string } | { ok: false; fallo: FalloDelCambio } {
  let texto: string;
  if (cambio.anterior !== undefined) {
    const encontradas = apariciones(actual, cambio.anterior);
    if (encontradas.length === 0) return { ok: false, fallo: "no_encontrado" };
    if (encontradas.length > 1) return { ok: false, fallo: "repetido" };
    const [{ inicio, fin }] = encontradas;
    texto = ordenar(
      `${actual.slice(0, inicio)}${cambio.nuevo ?? ""}${actual.slice(fin)}`
    );
  } else {
    const nuevo = cambio.nuevo ?? "";
    if (apariciones(actual, nuevo).length > 0) {
      return { ok: false, fallo: "ya_esta" };
    }
    texto = ordenar(actual.trim() ? `${actual.trimEnd()}\n${nuevo}` : nuevo);
  }
  if (texto === ordenar(actual)) return { ok: false, fallo: "sin_cambios" };
  if (
    texto.length > MAX_LARGO_DE_INFORMACION &&
    texto.length > actual.length
  ) {
    return { ok: false, fallo: "demasiado_largo" };
  }
  return { ok: true, texto };
}

/** Lo que se le devuelve al LLM al proponer: puede corregirse solo. */
const MOTIVO_AL_PROPONER: Record<FalloDelCambio, string> = {
  no_encontrado:
    "No encuentro ese texto en la información del negocio: cópialo tal cual de contexto_negocio (informacion) o, si es algo nuevo, mándalo solo en nuevo.",
  repetido:
    "Ese texto aparece más de una vez en la información del negocio: usa un fragmento más largo para saber cuál.",
  ya_esta: "La recepcionista ya tiene eso en la información del negocio.",
  sin_cambios: "Con ese cambio la información del negocio queda igual.",
  demasiado_largo: `La información del negocio pasaría de ${MAX_LARGO_DE_INFORMACION} caracteres: propón quitar o resumir algo antes de añadir más.`,
};

function corto(texto: string, max = 120): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function describir(cambio: ActualizarInformacion): string {
  if (cambio.anterior !== undefined && cambio.nuevo !== undefined) {
    return `cambiar «${corto(cambio.anterior)}» por «${corto(cambio.nuevo)}» en lo que sabe la recepcionista`;
  }
  if (cambio.anterior !== undefined) {
    return `quitar de lo que sabe la recepcionista «${corto(cambio.anterior)}»`;
  }
  return `añadir a lo que sabe la recepcionista «${corto(cambio.nuevo ?? "")}»`;
}

const actualizarInformacion: AccionDelGestor<ActualizarInformacion> = {
  schema: ActualizarInformacionParams,
  async comprobar(
    ctx: ContextoDeAccion,
    params: ActualizarInformacion
  ): Promise<ResultadoDeComprobacion<ActualizarInformacion>> {
    const [negocio, agentes] = await Promise.all([
      prisma.business.findUnique({
        where: { id: ctx.businessId },
        select: { businessDetails: true },
      }),
      prisma.agent.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { promptManuallyEdited: true },
      }),
    ]);
    if (!negocio) {
      return { ok: false, motivo: "No encuentro el negocio." };
    }
    // Un prompt editado a mano (PATCH /agents/:id) se manda tal cual y no
    // lleva la información del negocio: guardarla no cambiaría nada.
    if (agentes.length > 0 && agentes.every((a) => a.promptManuallyEdited)) {
      return {
        ok: false,
        motivo:
          "Las instrucciones de la recepcionista están escritas a mano en el panel y no usan la información del negocio: este cambio no le llegaría. Hay que hacerlo desde el panel.",
      };
    }
    const resultado = aplicarCambioDeInformacion(
      negocio.businessDetails ?? "",
      params
    );
    if (!resultado.ok) {
      return { ok: false, motivo: MOTIVO_AL_PROPONER[resultado.fallo] };
    }
    return { ok: true, descripcion: describir(params) };
  },
  async ejecutar(ctx, params, meta): Promise<ResultadoDeEjecucion> {
    const negocio = await prisma.business.findUnique({
      where: { id: ctx.businessId },
      select: { businessDetails: true },
    });
    if (!negocio) {
      return { ok: false, mensaje: "No encuentro el negocio." };
    }
    // Se aplica sobre el texto de ahora, no sobre el de la propuesta: si el
    // dueño lo editó en el panel entretanto, su versión manda.
    const resultado = aplicarCambioDeInformacion(
      negocio.businessDetails ?? "",
      params
    );
    if (!resultado.ok) {
      return {
        ok: false,
        mensaje:
          resultado.fallo === "ya_esta" || resultado.fallo === "sin_cambios"
            ? "La recepcionista ya lo tenía así: no he cambiado nada."
            : "La información del negocio ha cambiado desde que te lo propuse, así que no he tocado nada. Pídemelo otra vez.",
      };
    }
    const { guardado, sincronizado } = await guardarInformacionDelNegocio(
      ctx.businessId,
      { esperado: negocio.businessDetails, nuevo: resultado.texto || null }
    );
    if (!guardado) {
      return {
        ok: false,
        mensaje:
          "La información del negocio ha cambiado mientras la guardaba, así que no he tocado nada. Pídemelo otra vez.",
      };
    }
    const descripcion = describir(params);
    console.log(
      `[Gestor] Acción ${meta.accionId}: ${descripcion} (negocio ${ctx.businessId}, entrante ${meta.inboundMessageId}${sincronizado ? "" : ", sin sincronizar todavía"})`
    );
    return {
      ok: true,
      mensaje: sincronizado
        ? "Hecho: la recepcionista ya lo tiene en cuenta en las próximas llamadas."
        : "Hecho: está guardado. La recepcionista lo tendrá en cuenta en cuanto se actualice, como tarde mañana.",
      nota: `Información del negocio actualizada: ${descripcion}.`,
    };
  },
};

export const ACCIONES_DE_INFORMACION: Record<
  string,
  AccionDelGestor<unknown>
> = {
  actualizar_informacion: actualizarInformacion as AccionDelGestor<unknown>,
};

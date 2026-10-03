/**
 * Mide la espera entre el cliente y la recepcionista en las grabaciones de
 * doble canal de un negocio (lib/latenciaDeTurnos.ts): p50/p95 por llamada
 * y en conjunto. Sirve para comparar configuraciones de idioma y voz con
 * datos (p. ej. Ultra + flux frente a Soniox) antes y después de un ajuste.
 * Separa las respuestas que esperaron a una herramienta (disponibilidad,
 * recados), emparejándolas con la transcripción: esas miden la herramienta,
 * no la voz ni la transcripción. Solo lectura: descarga los audios a un
 * directorio temporal y los borra al terminar.
 *
 * Uso (con DATABASE_URL y las credenciales de R2 del entorno):
 *   npx tsx scripts/medirLatenciaDeTurnos.ts --business <id> \
 *     [--desde 2026-10-03T00:00] [--hasta …] [--max 20] \
 *     [--umbral -38] [--canal-recepcionista 0|1]
 * Sin --canal-recepcionista, es el canal que habla primero (el saludo).
 * Requiere ffmpeg y ffprobe.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma.js";
import { getSignedRecordingUrl, initStorage } from "../src/lib/storage.js";
import {
  anotarHerramientas,
  medirTurnos,
  percentil,
  respuestasConHerramienta,
  segmentosDeVoz,
  type MensajeDeLaTranscripcion,
  type Segmento,
} from "../src/lib/latenciaDeTurnos.js";

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function duracionDe(fichero: string): number {
  return Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      fichero,
    ])
      .toString()
      .trim()
  );
}

function vozDelCanal(
  fichero: string,
  canal: number,
  umbral: number,
  duracion: number
): Segmento[] {
  // silencedetect escribe en stderr; con -f null no se genera audio.
  const salida = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      fichero,
      "-af",
      `pan=mono|c0=c${canal},silencedetect=n=${umbral}dB:d=0.25`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" }
  ).stderr;
  return segmentosDeVoz(salida, duracion);
}

const ms = (segundos: number | null) =>
  segundos === null ? "—" : `${Math.round(segundos * 1000)} ms`;

const resumen = (esperas: number[]) =>
  `${esperas.length} · p50 ${ms(percentil(esperas, 50))} · p95 ${ms(percentil(esperas, 95))}`;

async function main() {
  const negocio = argumento("--business");
  if (!negocio) {
    console.error("Falta --business <id>");
    process.exitCode = 1;
    return;
  }
  const desde = argumento("--desde");
  const hasta = argumento("--hasta");
  const umbral = Number(argumento("--umbral") ?? -38);
  const canalFijo = argumento("--canal-recepcionista");

  const llamadas = await prisma.call.findMany({
    where: {
      businessId: negocio,
      ...(desde || hasta
        ? {
            startedAt: {
              ...(desde ? { gte: new Date(desde) } : {}),
              ...(hasta ? { lte: new Date(hasta) } : {}),
            },
          }
        : {}),
      recording: { is: { storageKey: { not: null }, deletedAt: null } },
    },
    include: { recording: true, transcript: true },
    orderBy: { startedAt: "desc" },
    take: Number(argumento("--max") ?? 20),
  });

  initStorage();
  const directorio = mkdtempSync(join(tmpdir(), "latencia-"));
  const conversacion: number[] = [];
  const conHerramienta: number[] = [];
  const sinAnotar: number[] = [];
  let solapes = 0;
  try {
    for (const llamada of llamadas) {
      const fichero = join(directorio, `${llamada.id}.wav`);
      const respuesta = await fetch(
        await getSignedRecordingUrl(llamada.recording!.storageKey!)
      );
      if (!respuesta.ok) {
        console.error(
          `[Latencia] ${llamada.id}: no se pudo descargar (${respuesta.status})`
        );
        continue;
      }
      writeFileSync(fichero, Buffer.from(await respuesta.arrayBuffer()));
      const duracion = duracionDe(fichero);
      const canales = [0, 1].map((canal) =>
        vozDelCanal(fichero, canal, umbral, duracion)
      );
      const recepcionista =
        canalFijo !== undefined
          ? Number(canalFijo)
          : (canales[0][0]?.inicio ?? Infinity) <=
              (canales[1][0]?.inicio ?? Infinity)
            ? 0
            : 1;
      const medida = medirTurnos(
        canales[1 - recepcionista],
        canales[recepcionista]
      );
      solapes += medida.solapes;
      const mensajes = (llamada.transcript?.messages ??
        []) as unknown as MensajeDeLaTranscripcion[];
      const anotados = anotarHerramientas(
        medida,
        respuestasConHerramienta(mensajes)
      );
      if (anotados) {
        for (const turno of anotados) {
          (turno.conHerramienta ? conHerramienta : conversacion).push(
            turno.latencia
          );
        }
      } else {
        sinAnotar.push(...medida.turnos.map((turno) => turno.latencia));
      }
      const detalle = anotados
        ? anotados
            .map((t) => `${ms(t.latencia)}${t.conHerramienta ? " (h)" : ""}`)
            .join(", ")
        : `sin anotar: ${medida.turnos.map((t) => ms(t.latencia)).join(", ")}`;
      console.log(
        `${llamada.startedAt.toISOString()} ${llamada.id}: ${detalle} · ${medida.solapes} solapes`
      );
    }
  } finally {
    rmSync(directorio, { recursive: true, force: true });
  }

  console.log(`\n${llamadas.length} llamadas · ${solapes} solapes`);
  console.log(`Conversación:      ${resumen(conversacion)}`);
  console.log(`Con herramienta:   ${resumen(conHerramienta)}`);
  if (sinAnotar.length > 0) {
    console.log(`Sin anotar:        ${resumen(sinAnotar)}`);
  }
}

main()
  .catch((error) => {
    console.error("[Latencia] Medición fallida:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

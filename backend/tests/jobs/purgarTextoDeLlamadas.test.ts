import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { purgarTextoDeLlamadasJob } from "../../src/jobs/purgarTextoDeLlamadas.js";
import { prisma } from "../../src/lib/prisma.js";

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    transcript: { deleteMany: vi.fn() },
    call: { updateMany: vi.fn() },
    inboundMessage: { deleteMany: vi.fn() },
  },
}));

const borrarTranscripciones = vi.mocked(prisma.transcript.deleteMany);
const actualizarLlamadas = vi.mocked(prisma.call.updateMany);
const borrarMensajes = vi.mocked(prisma.inboundMessage.deleteMany);

const DIA_MS = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-10-02T04:30:00.000Z");

describe("purgarTextoDeLlamadasJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    delete process.env.CALL_TEXT_RETENTION_DAYS;
    borrarTranscripciones.mockResolvedValue({ count: 3 });
    actualizarLlamadas
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 2 });
    borrarMensajes.mockResolvedValue({ count: 5 });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CALL_TEXT_RETENTION_DAYS;
  });

  it("borra el texto de las llamadas de hace más de 90 días", async () => {
    const resultado = await purgarTextoDeLlamadasJob();

    const limite = new Date(AHORA.getTime() - 90 * DIA_MS);
    expect(borrarTranscripciones).toHaveBeenCalledWith({
      where: { call: { is: { startedAt: { lt: limite } } } },
    });
    expect(borrarMensajes).toHaveBeenCalledWith({
      where: { receivedAt: { lt: limite } },
    });
    expect(resultado).toEqual({
      transcripciones: 3,
      resumenes: 4,
      telefonos: 2,
      mensajes: 5,
    });
  });

  it("vacía el resumen y el informe, y deja el resto de la llamada", async () => {
    await purgarTextoDeLlamadasJob();

    const { where, data } = actualizarLlamadas.mock.calls[0][0] as any;
    expect(where.startedAt.lt).toEqual(
      new Date(AHORA.getTime() - 90 * DIA_MS)
    );
    expect(where.OR).toEqual([
      { summary: { not: null } },
      { postCallReport: { not: Prisma.DbNull } },
    ]);
    expect(data).toEqual({ summary: null, postCallReport: Prisma.DbNull });
  });

  it("conserva el teléfono de las llamadas con cita o con recado", async () => {
    await purgarTextoDeLlamadasJob();

    const { where, data } = actualizarLlamadas.mock.calls[1][0] as any;
    expect(where.fromNumber).toEqual({ not: null });
    expect(where.booking).toEqual({ is: null });
    expect(where.leads).toEqual({ none: {} });
    expect(data).toEqual({ fromNumber: null });
  });

  it("respeta el plazo de CALL_TEXT_RETENTION_DAYS", async () => {
    process.env.CALL_TEXT_RETENTION_DAYS = "45";
    await purgarTextoDeLlamadasJob();

    expect(borrarMensajes).toHaveBeenCalledWith({
      where: { receivedAt: { lt: new Date(AHORA.getTime() - 45 * DIA_MS) } },
    });
  });

  it.each(["0", "-5", "noventa"])(
    "no borra nada si el plazo configurado es «%s»",
    async (valor) => {
      process.env.CALL_TEXT_RETENTION_DAYS = valor;
        await expect(purgarTextoDeLlamadasJob()).rejects.toThrow(
        "CALL_TEXT_RETENTION_DAYS"
      );
      expect(borrarTranscripciones).not.toHaveBeenCalled();
      expect(actualizarLlamadas).not.toHaveBeenCalled();
      expect(borrarMensajes).not.toHaveBeenCalled();
    }
  );
});

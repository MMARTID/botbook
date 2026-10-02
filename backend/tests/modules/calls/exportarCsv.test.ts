import { describe, it, expect } from "vitest";
import {
  celda,
  generarCsv,
  resultadoDeLlamada,
  type LlamadaParaCsv,
} from "../../../src/modules/calls/exportarCsv.js";

const LLAMADA: LlamadaParaCsv = {
  startedAt: new Date("2026-10-02T07:41:00Z"),
  voiceProvider: "telnyx",
  fromNumber: "+34612345678",
  durationSecs: 60,
  sentiment: null,
  summary: null,
  booking: null,
  recado: null,
};

describe("celda", () => {
  it("neutraliza lo que Excel ejecutaría como fórmula", () => {
    expect(celda("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(celda("+34 algo")).toBe("'+34 algo");
    expect(celda("-1")).toBe("'-1");
    expect(celda("@SUMA(A1)")).toBe("'@SUMA(A1)");
  });

  it("entrecomilla solo lo que lleva separador, comillas o saltos de línea", () => {
    expect(celda("Corte; color")).toBe('"Corte; color"');
    expect(celda("dijo \"hola\"")).toBe('"dijo ""hola"""');
    expect(celda("dos\nlíneas")).toBe('"dos\nlíneas"');
    expect(celda("Corte")).toBe("Corte");
    expect(celda(null)).toBe("");
    expect(celda(0)).toBe("0");
  });
});

describe("resultadoDeLlamada", () => {
  it("pone delante el recado pendiente, luego la cita y luego lo demás", () => {
    const reserva = {
      isCancelled: false,
      rescheduledToId: null,
      programedAt: new Date(),
      clientName: null,
      professional: null,
      services: [],
    };
    expect(
      resultadoDeLlamada({ ...LLAMADA, booking: reserva, recado: { atendidoAt: null } })
    ).toBe("Recado por devolver");
    expect(resultadoDeLlamada({ ...LLAMADA, booking: reserva })).toBe("Reserva");
    expect(
      resultadoDeLlamada({
        ...LLAMADA,
        booking: { ...reserva, isCancelled: true, rescheduledToId: "bk_2" },
      })
    ).toBe("Reserva modificada");
    expect(
      resultadoDeLlamada({ ...LLAMADA, recado: { atendidoAt: "2026-10-02T10:00:00Z" } })
    ).toBe("Recado devuelto");
    expect(resultadoDeLlamada(LLAMADA)).toBe("Sin cita");
  });
});

describe("generarCsv", () => {
  it("abre en el Excel en español: BOM, punto y coma, coma decimal y fin de línea CRLF", () => {
    const csv = generarCsv([LLAMADA], "Europe/Madrid");
    expect(csv.startsWith("﻿Fecha;Hora;Canal;")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("deja los chats sin duración y los números extranjeros a salvo de Excel", () => {
    const csv = generarCsv(
      [{ ...LLAMADA, voiceProvider: "whatsapp", fromNumber: "+447700900123", durationSecs: null }],
      "Europe/Madrid"
    );
    const fila = csv.replace(/^﻿/, "").split("\r\n")[1].split(";");
    expect(fila[2]).toBe("WhatsApp");
    expect(fila[3]).toBe("'+447700900123");
    expect(fila[4]).toBe("");
  });

  it("solo da precio cuando todos los servicios de la cita lo tienen", () => {
    const conYSin = generarCsv(
      [
        {
          ...LLAMADA,
          booking: {
            isCancelled: false,
            rescheduledToId: null,
            programedAt: new Date("2026-10-03T08:00:00Z"),
            clientName: "=cmd",
            professional: null,
            services: [
              { name: "Corte", priceCents: 1600 },
              { name: "Mechas", priceCents: null },
            ],
          },
        },
      ],
      "Europe/Madrid"
    );
    const fila = conYSin.replace(/^﻿/, "").split("\r\n")[1].split(";");
    expect(fila[6]).toBe("'=cmd");
    expect(fila[7]).toBe("Corte + Mechas");
    expect(fila[9]).toBe("");
  });
});

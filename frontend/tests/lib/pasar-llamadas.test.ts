import { describe, it, expect } from "vitest";
import { DEFAULT_AGENT_SETTINGS } from "@/components/agent-settings-editor";
import {
  hayMovilParaPasarLlamadas,
  lineaAntiguaEsElMovilDelDueno,
  modoDePasarLlamadas,
  modoDePasarLlamadasPorDefecto,
  motivoSinMovilParaPasarLlamadas,
} from "@/lib/pasar-llamadas";

const NUMERO_DE_ALHABLA = "+34930453218";
const MOVIL = "+34600111222";

describe("motivoSinMovilParaPasarLlamadas / hayMovilParaPasarLlamadas", () => {
  it("con un móvil español distinto del número de Alhabla hay a quién pasar la llamada", () => {
    expect(
      motivoSinMovilParaPasarLlamadas(
        { ownerWhatsappNumber: MOVIL },
        NUMERO_DE_ALHABLA
      )
    ).toBeNull();
    expect(
      hayMovilParaPasarLlamadas(
        { ownerWhatsappNumber: MOVIL },
        NUMERO_DE_ALHABLA
      )
    ).toBe(true);
  });

  it("sin móvil, o con el propio número de Alhabla, el motivo es «sin_movil»", () => {
    expect(
      motivoSinMovilParaPasarLlamadas(
        { ownerWhatsappNumber: null },
        NUMERO_DE_ALHABLA
      )
    ).toBe("sin_movil");
    expect(
      motivoSinMovilParaPasarLlamadas(
        { ownerWhatsappNumber: NUMERO_DE_ALHABLA },
        NUMERO_DE_ALHABLA
      )
    ).toBe("sin_movil");
  });

  it("con un móvil fuera de España (o un 900/70x) el motivo es «fuera_de_espana»: el backend no registra la tool", () => {
    expect(
      motivoSinMovilParaPasarLlamadas(
        { ownerWhatsappNumber: "+447700900123" },
        NUMERO_DE_ALHABLA
      )
    ).toBe("fuera_de_espana");
    expect(
      motivoSinMovilParaPasarLlamadas(
        { ownerWhatsappNumber: "+34900123456" },
        NUMERO_DE_ALHABLA
      )
    ).toBe("fuera_de_espana");
    expect(
      hayMovilParaPasarLlamadas(
        { ownerWhatsappNumber: "+447700900123" },
        NUMERO_DE_ALHABLA
      )
    ).toBe(false);
  });
});

describe("modo por defecto y modo efectivo", () => {
  it("«si el cliente lo pide» solo con Alhabla como principal y móvil válido; «nunca» en el resto", () => {
    expect(
      modoDePasarLlamadasPorDefecto(
        { customerLineType: "alhabla", ownerWhatsappNumber: MOVIL },
        NUMERO_DE_ALHABLA
      )
    ).toBe("si_lo_pide");
    expect(
      modoDePasarLlamadasPorDefecto(
        { customerLineType: "alhabla", ownerWhatsappNumber: "+447700900123" },
        NUMERO_DE_ALHABLA
      )
    ).toBe("nunca");
    expect(
      modoDePasarLlamadasPorDefecto(
        { customerLineType: "fijo", ownerWhatsappNumber: MOVIL },
        NUMERO_DE_ALHABLA
      )
    ).toBe("nunca");
  });

  it("el modo guardado en agentSettings manda sobre el de por defecto", () => {
    expect(
      modoDePasarLlamadas(
        {
          customerLineType: "alhabla",
          ownerWhatsappNumber: MOVIL,
          agentSettings: {
            ...DEFAULT_AGENT_SETTINGS,
            pasarLlamadas: "siempre",
          },
        },
        NUMERO_DE_ALHABLA
      )
    ).toBe("siempre");
    expect(
      modoDePasarLlamadas(
        {
          customerLineType: "alhabla",
          ownerWhatsappNumber: MOVIL,
          agentSettings: DEFAULT_AGENT_SETTINGS,
        },
        NUMERO_DE_ALHABLA
      )
    ).toBe("si_lo_pide");
  });
});

describe("lineaAntiguaEsElMovilDelDueno", () => {
  it("es el móvil del dueño si los avisos van a la línea de clientes o si es el mismo número", () => {
    expect(
      lineaAntiguaEsElMovilDelDueno(
        { ownerWhatsappNumber: MOVIL, ownerPhoneIsCustomerLine: true },
        MOVIL
      )
    ).toBe(true);
    expect(
      lineaAntiguaEsElMovilDelDueno(
        { ownerWhatsappNumber: MOVIL, ownerPhoneIsCustomerLine: false },
        MOVIL
      )
    ).toBe(true);
  });

  it("no lo es con otra línea (fijo, móvil de trabajo aparte) ni sin línea antigua", () => {
    expect(
      lineaAntiguaEsElMovilDelDueno(
        { ownerWhatsappNumber: MOVIL, ownerPhoneIsCustomerLine: false },
        "+34931112233"
      )
    ).toBe(false);
    expect(
      lineaAntiguaEsElMovilDelDueno(
        { ownerWhatsappNumber: MOVIL, ownerPhoneIsCustomerLine: true },
        null
      )
    ).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  destinoDeTransferencia,
  esModoDeTransferencia,
  modoDeTransferenciaPorDefecto,
  resolverTransferenciaAlDueno,
} from "../../src/lib/transferenciaAlDueno.js";

const ALHABLA = "+34930453218";
const MOVIL = "+34600111222";

const PRINCIPAL = {
  customerLineType: "alhabla",
  phone: ALHABLA,
  telnyxPhoneNumber: ALHABLA,
  ownerWhatsappNumber: MOVIL,
  ownerPhoneIsCustomerLine: false,
};

describe("destinoDeTransferencia", () => {
  it("es el móvil del dueño cuando lo hay", () => {
    expect(destinoDeTransferencia(PRINCIPAL)).toBe(MOVIL);
  });

  it("sin móvil del dueño no hay destino", () => {
    expect(
      destinoDeTransferencia({ ...PRINCIPAL, ownerWhatsappNumber: null })
    ).toBeNull();
    expect(destinoDeTransferencia({})).toBeNull();
  });

  it("con «los avisos van a la línea de clientes» y sin móvil aparte, la línea sería el destino, pero no si está desviada", () => {
    expect(
      destinoDeTransferencia({
        customerLineType: "movil_personal",
        phone: MOVIL,
        telnyxPhoneNumber: ALHABLA,
        ownerWhatsappNumber: null,
        ownerPhoneIsCustomerLine: true,
      })
    ).toBeNull();
  });

  it("nunca transfiere a la línea de clientes desviada a Alhabla (bucle por «si no contesta»)", () => {
    expect(
      destinoDeTransferencia({
        customerLineType: "movil_personal",
        phone: MOVIL,
        telnyxPhoneNumber: ALHABLA,
        ownerWhatsappNumber: MOVIL,
        ownerPhoneIsCustomerLine: true,
      })
    ).toBeNull();
    // Con un fijo desviado y el móvil aparte sí hay destino.
    expect(
      destinoDeTransferencia({
        customerLineType: "fijo",
        phone: "+34931112233",
        telnyxPhoneNumber: ALHABLA,
        ownerWhatsappNumber: MOVIL,
      })
    ).toBe(MOVIL);
  });

  it("descarta el propio número de Alhabla, un placeholder del registro y números fuera de España", () => {
    expect(
      destinoDeTransferencia({ ...PRINCIPAL, ownerWhatsappNumber: ALHABLA })
    ).toBeNull();
    expect(
      destinoDeTransferencia({ ...PRINCIPAL, ownerWhatsappNumber: "TEMP-x" })
    ).toBeNull();
    expect(
      destinoDeTransferencia({
        ...PRINCIPAL,
        ownerWhatsappNumber: "+33612345678",
      })
    ).toBeNull();
    expect(
      destinoDeTransferencia({
        ...PRINCIPAL,
        ownerWhatsappNumber: "+34900123123",
      })
    ).toBeNull();
  });
});

describe("modoDeTransferenciaPorDefecto", () => {
  it("«si el cliente lo pide» con Alhabla como principal y móvil del dueño", () => {
    expect(modoDeTransferenciaPorDefecto(PRINCIPAL)).toBe("si_lo_pide");
  });

  it("«nunca» con desvío o sin móvil del dueño", () => {
    expect(
      modoDeTransferenciaPorDefecto({ ...PRINCIPAL, customerLineType: "fijo" })
    ).toBe("nunca");
    expect(
      modoDeTransferenciaPorDefecto({ ...PRINCIPAL, ownerWhatsappNumber: null })
    ).toBe("nunca");
    expect(modoDeTransferenciaPorDefecto({})).toBe("nunca");
  });
});

describe("resolverTransferenciaAlDueno", () => {
  it("activa solo con modo distinto de «nunca», destino y número de Alhabla", () => {
    expect(resolverTransferenciaAlDueno(PRINCIPAL, undefined)).toEqual({
      modo: "si_lo_pide",
      destino: MOVIL,
      origen: ALHABLA,
      activa: true,
    });
    expect(resolverTransferenciaAlDueno(PRINCIPAL, "siempre").modo).toBe(
      "siempre"
    );
    expect(resolverTransferenciaAlDueno(PRINCIPAL, "nunca")).toMatchObject({
      modo: "nunca",
      destino: MOVIL,
      activa: false,
    });
    expect(
      resolverTransferenciaAlDueno(
        { ...PRINCIPAL, telnyxPhoneNumber: null },
        "siempre"
      )
    ).toMatchObject({ origen: null, activa: false });
    expect(
      resolverTransferenciaAlDueno(
        { ...PRINCIPAL, ownerWhatsappNumber: null },
        "siempre"
      )
    ).toMatchObject({ destino: null, activa: false });
  });

  it("el ajuste guardado manda sobre el de por defecto, también con desvío", () => {
    const conDesvio = {
      customerLineType: "fijo",
      phone: "+34931112233",
      telnyxPhoneNumber: ALHABLA,
      ownerWhatsappNumber: MOVIL,
    };
    expect(resolverTransferenciaAlDueno(conDesvio, undefined).activa).toBe(
      false
    );
    expect(resolverTransferenciaAlDueno(conDesvio, "si_lo_pide")).toMatchObject(
      { modo: "si_lo_pide", destino: MOVIL, activa: true }
    );
  });
});

describe("esModoDeTransferencia", () => {
  it("acepta solo los tres modos", () => {
    expect(esModoDeTransferencia("nunca")).toBe(true);
    expect(esModoDeTransferencia("si_lo_pide")).toBe(true);
    expect(esModoDeTransferencia("siempre")).toBe(true);
    expect(esModoDeTransferencia("a_veces")).toBe(false);
    expect(esModoDeTransferencia(undefined)).toBe(false);
  });
});

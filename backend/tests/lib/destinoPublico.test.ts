import { describe, it, expect, vi, beforeEach } from "vitest";

const mockedLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: mockedLookup }));

const { asegurarDestinoPublico, esDireccionPrivada, ErrorDestinoNoPermitido } =
  await import("../../src/lib/destinoPublico.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("esDireccionPrivada", () => {
  it("marca como privadas las redes internas y las de la nube", () => {
    for (const ip of [
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254", // metadata de Google/AWS
      "100.64.0.1", // CGNAT
      "224.0.0.1", // multicast
      "255.255.255.255",
      "::1",
      "::",
      "fd00::1", // únicas locales
      "fe80::1", // link-local
      "::ffff:10.0.0.1", // IPv4 embebida en IPv6
    ]) {
      expect(esDireccionPrivada(ip), ip).toBe(true);
    }
  });

  it("deja pasar direcciones públicas de verdad", () => {
    for (const ip of ["17.253.144.10", "8.8.8.8", "172.32.0.1", "2001:4860:4860::8888"]) {
      expect(esDireccionPrivada(ip), ip).toBe(false);
    }
  });

  it("lo que no se sabe leer se considera privado", () => {
    expect(esDireccionPrivada("no-es-una-ip")).toBe(true);
    expect(esDireccionPrivada("")).toBe(true);
  });
});

describe("asegurarDestinoPublico", () => {
  it("acepta un servidor público por https", async () => {
    mockedLookup.mockResolvedValue([{ address: "17.253.144.10", family: 4 }]);

    const url = await asegurarDestinoPublico("https://caldav.icloud.com/");

    expect(url.hostname).toBe("caldav.icloud.com");
  });

  it("rechaza http, aunque el destino sea público", async () => {
    mockedLookup.mockResolvedValue([{ address: "17.253.144.10", family: 4 }]);

    await expect(asegurarDestinoPublico("http://caldav.icloud.com/")).rejects.toBeInstanceOf(
      ErrorDestinoNoPermitido
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("rechaza una IP interna escrita a mano", async () => {
    await expect(asegurarDestinoPublico("https://10.0.0.5:6379/")).rejects.toThrow(
      /red interna/
    );
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  // El caso que de verdad importa: un nombre público que resuelve a una IP
  // interna (el truco clásico para llegar a la VPC desde fuera).
  it("rechaza un nombre que resuelve a una IP interna", async () => {
    mockedLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    await expect(asegurarDestinoPublico("https://interno.ejemplo.com/")).rejects.toThrow(
      /red interna/
    );
  });

  it("basta UNA dirección interna entre varias para rechazarlo", async () => {
    mockedLookup.mockResolvedValue([
      { address: "17.253.144.10", family: 4 },
      { address: "10.1.2.3", family: 4 },
    ]);

    await expect(asegurarDestinoPublico("https://mixto.ejemplo.com/")).rejects.toThrow(
      /red interna/
    );
  });

  it("rechaza lo que no resuelve y lo que no es una URL", async () => {
    mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(asegurarDestinoPublico("https://no-existe.ejemplo/")).rejects.toThrow(
      /resolver/
    );
    await expect(asegurarDestinoPublico("esto no es una url")).rejects.toThrow(/URL válida/);
  });
});

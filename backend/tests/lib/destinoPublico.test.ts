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
      "::ffff:a00:1", // la misma, en hexadecimal (la forma de new URL())
      "::ffff:a9fe:a9fe", // metadata 169.254.169.254, en hexadecimal
      "0:0:0:0:0:ffff:7f00:1", // loopback mapeado, sin abreviar
      "::127.0.0.1", // IPv4 compatible
      "64:ff9b::a00:1", // NAT64 hacia una IP interna
      "64:ff9b:1::1", // NAT64 de uso local
    ]) {
      expect(esDireccionPrivada(ip), ip).toBe(true);
    }
  });

  it("deja pasar direcciones públicas de verdad", () => {
    for (const ip of [
      "17.253.144.10",
      "8.8.8.8",
      "172.32.0.1",
      "2001:4860:4860::8888",
      "::ffff:808:808", // 8.8.8.8 mapeada
      "64:ff9b::808:808", // NAT64 hacia una IP pública
    ]) {
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

  // La regresión: new URL() normaliza [::ffff:10.0.0.1] a [::ffff:a00:1] y la
  // guarda solo reconocía la forma con puntos.
  it("rechaza una IP interna mapeada en IPv6 dentro de la URL", async () => {
    await expect(
      asegurarDestinoPublico("https://[::ffff:10.0.0.1]:6379/")
    ).rejects.toThrow(/red interna/);
    await expect(
      asegurarDestinoPublico("https://[::ffff:169.254.169.254]/")
    ).rejects.toThrow(/red interna/);
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

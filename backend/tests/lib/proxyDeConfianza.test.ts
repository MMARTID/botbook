import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import {
  confianzaEnProxies,
  saltosDeProxyDeConfianza,
} from "../../src/lib/proxyDeConfianza.js";

describe("saltosDeProxyDeConfianza", () => {
  it("confía en un salto por defecto", () => {
    expect(saltosDeProxyDeConfianza(undefined)).toBe(1);
    expect(saltosDeProxyDeConfianza("")).toBe(1);
    expect(saltosDeProxyDeConfianza("2")).toBe(2);
  });

  it("no arranca con un valor que no sea un número de saltos", () => {
    expect(() => saltosDeProxyDeConfianza("true")).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => saltosDeProxyDeConfianza("-1")).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => saltosDeProxyDeConfianza("1.5")).toThrow(/TRUST_PROXY_HOPS/);
  });

  // La regresión: con `trustProxy: true`, un X-Forwarded-For inventado por el
  // cliente decidía la IP y cada intento de login caía en un cubo nuevo.
  it("con un salto, la IP es la que añade el proxy, no la que inventa el cliente", async () => {
    const fastify = Fastify({ trustProxy: confianzaEnProxies(1) });
    fastify.get("/ip", async (request) => ({ ip: request.ip }));

    const response = await fastify.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "169.254.1.1",
      headers: { "x-forwarded-for": "1.2.3.4, 85.10.20.30" },
    });

    expect(response.json()).toEqual({ ip: "85.10.20.30" });
  });

  it("con dos saltos (balanceador delante), la IP es la penúltima", async () => {
    const fastify = Fastify({ trustProxy: confianzaEnProxies(2) });
    fastify.get("/ip", async (request) => ({ ip: request.ip }));

    const response = await fastify.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "169.254.1.1",
      headers: { "x-forwarded-for": "1.2.3.4, 85.10.20.30, 34.120.0.1" },
    });

    expect(response.json()).toEqual({ ip: "85.10.20.30" });
  });
});

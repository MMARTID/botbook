import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import {
  cifrarJson,
  comprobarClaveDeCifrado,
  descifrarJson,
  esSobreCifrado,
  CifradoNoConfiguradoError,
} from "../../src/lib/cifradoDeCredenciales.js";

const CLAVE_A = randomBytes(32).toString("base64");
const CLAVE_B = randomBytes(32).toString("base64");

describe("cifradoDeCredenciales", () => {
  let claveOriginal: string | undefined;

  beforeEach(() => {
    claveOriginal = process.env.CALENDAR_CREDENTIALS_KEY;
    process.env.CALENDAR_CREDENTIALS_KEY = CLAVE_A;
  });

  afterEach(() => {
    process.env.CALENDAR_CREDENTIALS_KEY = claveOriginal;
  });

  it("cifra y descifra un objeto (ida y vuelta)", () => {
    const original = { provider: "google", refreshToken: "1//rt_secreto" };
    const sobre = cifrarJson(original);

    expect(esSobreCifrado(sobre)).toBe(true);
    expect(sobre.v).toBe(1);
    expect(sobre.alg).toBe("aes-256-gcm");
    // El texto en claro no aparece en el sobre.
    expect(JSON.stringify(sobre)).not.toContain("rt_secreto");
    expect(descifrarJson(sobre)).toEqual(original);
  });

  it("dos cifrados del mismo valor no coinciden (IV aleatorio)", () => {
    const a = cifrarJson({ x: 1 });
    const b = cifrarJson({ x: 1 });
    expect(a.data).not.toBe(b.data);
    expect(a.iv).not.toBe(b.iv);
  });

  it("un sobre manipulado no descifra", () => {
    const sobre = cifrarJson({ provider: "outlook", refreshToken: "rt" });
    const bytes = Buffer.from(sobre.data, "base64");
    bytes[0] ^= 0xff;
    expect(() =>
      descifrarJson({ ...sobre, data: bytes.toString("base64") })
    ).toThrow();
  });

  it("un sobre cifrado con otra clave no descifra", () => {
    const sobre = cifrarJson({ provider: "outlook", refreshToken: "rt" });
    process.env.CALENDAR_CREDENTIALS_KEY = CLAVE_B;
    expect(() => descifrarJson(sobre)).toThrow();
  });

  it("esSobreCifrado distingue un sobre de un JSON en claro o basura", () => {
    expect(esSobreCifrado({ provider: "google", refreshToken: "rt" })).toBe(
      false
    );
    expect(esSobreCifrado(null)).toBe(false);
    expect(esSobreCifrado("x")).toBe(false);
    expect(
      esSobreCifrado({ v: 2, alg: "aes-256-gcm", iv: "", tag: "", data: "" })
    ).toBe(false);
  });

  it("sin clave, o con una clave de longitud incorrecta, falla de forma explícita", () => {
    delete process.env.CALENDAR_CREDENTIALS_KEY;
    expect(() => comprobarClaveDeCifrado()).toThrow(CifradoNoConfiguradoError);
    expect(() => cifrarJson({ x: 1 })).toThrow(/no está definida/);

    process.env.CALENDAR_CREDENTIALS_KEY =
      Buffer.from("corta").toString("base64");
    expect(() => comprobarClaveDeCifrado()).toThrow(/32 bytes/);
  });
});

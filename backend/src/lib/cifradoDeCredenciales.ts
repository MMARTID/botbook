// Cifrado en reposo de calendar_connections.credentials (refresh tokens de
// Google/Outlook y, con CalDAV, contraseñas de aplicación de Apple).
// AES-256-GCM con la clave de CALENDAR_CREDENTIALS_KEY (32 bytes en base64,
// en Secret Manager en producción). Cada valor va en un "sobre" versionado
// con su IV y su tag de autenticación, así una fila manipulada o cifrada con
// otra clave no descifra en silencio: falla y se trata como credenciales
// ausentes (el negocio tendrá que reconectar).
//
// Lo usa únicamente modules/calendar/conexion.ts. Sin clave configurada el
// servidor no arranca (ver server.ts): mejor no arrancar que guardar
// contraseñas en claro o no poder leer las que ya hay.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const BYTES_DE_CLAVE = 32;
const BYTES_DE_IV = 12;
/** Datos autenticados adicionales: atan el sobre a este uso concreto. */
const AAD = Buffer.from("alhabla:calendar_connections:v1");

export type SobreCifrado = {
  v: 1;
  alg: typeof ALGORITMO;
  iv: string;
  tag: string;
  data: string;
};

export class CifradoNoConfiguradoError extends Error {
  constructor(detalle: string) {
    super(`CALENDAR_CREDENTIALS_KEY ${detalle}`);
    this.name = "CifradoNoConfiguradoError";
  }
}

export function esSobreCifrado(valor: unknown): valor is SobreCifrado {
  if (!valor || typeof valor !== "object") return false;
  const s = valor as Record<string, unknown>;
  return (
    s.v === 1 &&
    s.alg === ALGORITMO &&
    typeof s.iv === "string" &&
    typeof s.tag === "string" &&
    typeof s.data === "string"
  );
}

/** Lee y valida la clave en cada llamada (barato) para que un cambio de
 * entorno en tests o una rotación no exijan reiniciar. */
function clave(): Buffer {
  const cruda = process.env.CALENDAR_CREDENTIALS_KEY;
  if (!cruda) throw new CifradoNoConfiguradoError("no está definida");
  const bytes = Buffer.from(cruda, "base64");
  if (bytes.length !== BYTES_DE_CLAVE) {
    throw new CifradoNoConfiguradoError(
      `debe ser una clave de ${BYTES_DE_CLAVE} bytes en base64 (tiene ${bytes.length})`
    );
  }
  return bytes;
}

/** Comprobación de arranque: lanza CifradoNoConfiguradoError si la clave
 * falta o no mide 32 bytes. */
export function comprobarClaveDeCifrado(): void {
  clave();
}

export function cifrarJson(valor: object): SobreCifrado {
  const iv = randomBytes(BYTES_DE_IV);
  const cipher = createCipheriv(ALGORITMO, clave(), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(valor), "utf8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    alg: ALGORITMO,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

/** Lanza si el sobre fue manipulado o se cifró con otra clave. */
export function descifrarJson(sobre: SobreCifrado): unknown {
  const decipher = createDecipheriv(
    ALGORITMO,
    clave(),
    Buffer.from(sobre.iv, "base64")
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(sobre.tag, "base64"));
  const texto = Buffer.concat([
    decipher.update(Buffer.from(sobre.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(texto);
}

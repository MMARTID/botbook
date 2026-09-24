import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guarda contra SSRF para las URLs que aporta un usuario y que el backend va
 * a visitar él mismo (hoy: el `serverUrl` de CalDAV).
 *
 * Por qué hace falta aquí y no es paranoia: `alhabla-api` sale por un
 * conector de VPC con egress `private-ranges-only`, así que desde el
 * contenedor SÍ se llega a los rangos privados —Cloud SQL, Redis— y una URL
 * como `http://10.x.x.x:6379/` no es un destino imaginario. El metadata
 * server de Google se salva solo (exige la cabecera `Metadata-Flavor`, que
 * ninguna librería CalDAV manda), pero no se puede depender de eso.
 */
export class ErrorDestinoNoPermitido extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = "ErrorDestinoNoPermitido";
  }
}

/** Rangos IPv4 que no son Internet público. */
function esIpv4Privada(ip: string): boolean {
  const partes = ip.split(".").map(Number);
  if (partes.length !== 4 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // Lo que no sabemos leer, no se visita.
  }
  const [a, b] = partes as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // privada
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local (metadata de la nube)
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 192 && partes[1] === 0 && partes[2] === 0) return true; // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // banco de pruebas
  if (a >= 224) return true; // multicast, reservada y broadcast
  return false;
}

function esIpv6Privada(ip: string): boolean {
  const normalizada = ip.toLowerCase().split("%")[0]!; // fuera el scope id
  if (normalizada === "::" || normalizada === "::1") return true;
  // IPv4 embebida (::ffff:10.0.0.1): manda el criterio de IPv4.
  const embebida = normalizada.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (embebida) return esIpv4Privada(embebida[1]!);
  const primerGrupo = parseInt(normalizada.split(":")[0] || "0", 16);
  if ((primerGrupo & 0xfe00) === 0xfc00) return true; // fc00::/7, únicas locales
  if ((primerGrupo & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((primerGrupo & 0xff00) === 0xff00) return true; // ff00::/8, multicast
  return false;
}

export function esDireccionPrivada(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return esIpv4Privada(ip);
  if (version === 6) return esIpv6Privada(ip);
  return true; // Si no es una IP reconocible, no se visita.
}

/**
 * Acepta la URL solo si es HTTPS y su nombre resuelve a direcciones públicas.
 * Se comprueban TODAS las direcciones: con una sola privada ya no se visita.
 *
 * Esto no cierra del todo el DNS rebinding —entre la comprobación y la
 * petición el nombre puede cambiar de IP— pero sí cierra el caso real: una
 * URL escrita a mano apuntando a la red interna. Cerrarlo del todo exigiría
 * fijar el socket a la IP validada, que con `fetch` no se puede.
 */
export async function asegurarDestinoPublico(urlSinValidar: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlSinValidar);
  } catch {
    throw new ErrorDestinoNoPermitido("La dirección del servidor no es una URL válida.");
  }

  if (url.protocol !== "https:") {
    throw new ErrorDestinoNoPermitido(
      "La dirección del servidor tiene que empezar por https:// — con http la contraseña viajaría en claro."
    );
  }

  const nombre = url.hostname.replace(/^\[|\]$/g, "");
  let direcciones: string[];
  if (isIP(nombre)) {
    direcciones = [nombre];
  } else {
    try {
      direcciones = (await lookup(nombre, { all: true })).map((d) => d.address);
    } catch {
      throw new ErrorDestinoNoPermitido(
        "No hemos podido resolver la dirección del servidor. Revísala."
      );
    }
  }

  if (direcciones.length === 0 || direcciones.some(esDireccionPrivada)) {
    throw new ErrorDestinoNoPermitido(
      "Esa dirección apunta a una red interna y no se puede usar como servidor de calendario."
    );
  }

  return url;
}

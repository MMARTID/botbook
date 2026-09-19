// Envío de correo transaccional vía la API REST de Zoho Mail (cuenta en el
// centro de datos .eu). welcome@alhabla.ai y support@alhabla.ai son alias de
// "enviar como" de la misma cuenta autenticada — no hace falta reautenticar
// por alias, un único refresh token cubre ambos.
import {
  PermanentJobError,
  esFalloPermanentePorEstado,
} from "./jobErrors.js";

const ZOHO_TIMEOUT_MS = 10_000;
const ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.eu";
const ZOHO_MAIL_BASE_URL = "https://mail.zoho.eu";

let cachedAccessToken: { token: string; expiresAt: number } | undefined;

/**
 * Fuera de producción, a quién se le puede escribir DE VERDAD.
 *
 * Desarrollo y producción comparten las credenciales de Zoho (auditoría del
 * 2026-09-19), así que un envío desde el portátil sale del buzón corporativo
 * real. Hasta ahora nada lo impedía: solo se salvaba porque los negocios de
 * prueba usan direcciones `@alhabla.local` y rebotan. La primera vez que
 * alguien pruebe con una dirección real, el cliente recibe el correo.
 *
 * Lista separada por comas en `ZOHO_DEV_ALLOWED_RECIPIENTS`. Vacía = no se
 * manda nada fuera de producción. `*` = mandar a cualquiera (úsalo solo si
 * sabes lo que haces). En producción esta comprobación no se aplica.
 */
function destinatarioPermitidoFueraDeProduccion(toAddress: string): boolean {
  const permitidos = (process.env.ZOHO_DEV_ALLOWED_RECIPIENTS ?? "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);
  if (permitidos.includes("*")) return true;
  const destino = toAddress.trim().toLowerCase();
  return permitidos.some((permitido) => permitido.toLowerCase() === destino);
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

async function getZohoAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const params = new URLSearchParams({
    refresh_token: requireEnv("ZOHO_REFRESH_TOKEN"),
    client_id: requireEnv("ZOHO_CLIENT_ID"),
    client_secret: requireEnv("ZOHO_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  const response = await fetch(`${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
    signal: AbortSignal.timeout(ZOHO_TIMEOUT_MS),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };

  if (!response.ok || !data.access_token) {
    throw new Error(`Zoho OAuth token refresh failed: ${data.error ?? response.status}`);
  }

  // Margen de 60s para no usar un token a punto de caducar.
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedAccessToken.token;
}

export async function sendZohoMail(input: {
  fromAddress: string;
  toAddress: string;
  subject: string;
  html: string;
}): Promise<void> {
  // Antes de pedir siquiera el token: si estamos fuera de producción y el
  // destinatario no está permitido, no se manda. No lanza —para el job es un
  // envío resuelto y no tiene sentido reintentarlo— pero deja un log
  // inequívoco con el destinatario y el asunto, para que nadie se pregunte
  // por qué no le llegó el correo de prueba.
  if (
    process.env.NODE_ENV !== "production" &&
    !destinatarioPermitidoFueraDeProduccion(input.toAddress)
  ) {
    console.warn(
      `[Zoho] CORREO NO ENVIADO (entorno ${process.env.NODE_ENV ?? "sin definir"}): ` +
        `destino=${input.toAddress} asunto="${input.subject}" remitente=${input.fromAddress}. ` +
        `Dev y producción comparten el buzón de Zoho, así que solo se escribe a las ` +
        `direcciones de ZOHO_DEV_ALLOWED_RECIPIENTS (usa "*" para permitir cualquiera).`
    );
    return;
  }

  const accessToken = await getZohoAccessToken();
  const accountId = requireEnv("ZOHO_ACCOUNT_ID");

  const response = await fetch(`${ZOHO_MAIL_BASE_URL}/api/accounts/${accountId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject: input.subject,
      content: input.html,
      mailFormat: "html",
    }),
    // Sin timeout, un Zoho lento dejaba el job colgado hasta que Cloud Tasks
    // daba la tarea por perdida y la reintentaba — con el correo ya aceptado,
    // es decir, el cliente recibiendo el mismo email dos veces.
    signal: AbortSignal.timeout(ZOHO_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    const mensaje = `Zoho Mail send failed (${response.status}): ${body}`;
    // Una dirección mal escrita o un mensaje rechazado no mejora por
    // reintentarlo: se marca como definitivo para que Cloud Tasks no lo
    // repita cuatro veces.
    if (esFalloPermanentePorEstado(response.status)) {
      throw new PermanentJobError(mensaje, `zoho_${response.status}`);
    }
    throw new Error(mensaje);
  }
}

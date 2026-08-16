import { serverConfig } from "../config/serverConfig.js";

/**
 * Devuelve la URL pública base del servidor para registrar webhooks.
 * En desarrollo con ngrok, serverConfig.webhookUrl contiene la URL pública.
 * En producción o sin ngrok, se usa BASE_URL.
 */
export function getPublicWebhookBaseUrl(): string | undefined {
  return serverConfig.webhookUrl || process.env.BASE_URL || undefined;
}

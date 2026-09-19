/**
 * URL pública base del servidor, usada para registrar webhooks en Retell y
 * Telnyx (webhook de la Call Control App y URL de cada tool).
 *
 * Es SIEMPRE `BASE_URL`, en los tres entornos. Antes, en desarrollo, la URL se
 * capturaba al arrancar desde el API de ngrok y vivía en un
 * `serverConfig.webhookUrl` mutable en memoria. Eso se eliminó (2026-09-19)
 * porque el plan gratuito de ngrok rota el hostname en cada reinicio del
 * contenedor: las URLs ya escritas en los assistants y en la Call Control App
 * seguían apuntando al túnel anterior y **todas las tools fallaban en
 * silencio**, sin error en /health, ni en telnyxSyncError, ni en los logs.
 * Desarrollo usa ahora un hostname fijo (`https://dev-api.alhabla.ai`, túnel
 * con nombre de Cloudflare), así que lo que se registra en el proveedor vale
 * indefinidamente.
 *
 * Que el valor venga solo del entorno quita además la trampa del modelo
 * anterior: un proceso aparte (un script de `scripts/`) arrancaba con
 * `serverConfig.webhookUrl` a `null` y, si olvidaba capturar el túnel, escribía
 * URLs vacías sin avisar.
 */
export function getPublicWebhookBaseUrl(): string | undefined {
  return process.env.BASE_URL || undefined;
}

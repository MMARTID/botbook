const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

export interface WhatsAppTemplateMessage {
  /** Número del destinatario en formato E.164, p.ej. "+34600111222". */
  to: string;
  templateName: string;
  languageCode: string;
  /** Variables con nombre del body de la plantilla ({{negocio_nombre}},
   * {{servicios}}...), tal como las aprobó Meta — el nombre de cada clave
   * debe coincidir exactamente con el de la plantilla. */
  bodyParams: Record<string, string>;
}

export interface WhatsAppSendResult {
  messageId: string;
}

/**
 * Cliente de WhatsApp Business API vía Telnyx (Business Solution Provider de
 * Meta) — no la Cloud API de Meta directamente. El WABA de Alhabla se conectó
 * mediante el Embedded Signup de Telnyx (Mission Control → Messaging →
 * WhatsApp), así que Meta gestiona esta cuenta bajo el Tech Provider de
 * Telnyx y bloquea el acceso directo con un token de Meta propio
 * ("API access blocked", OAuthException 200) — el envío real tiene que pasar
 * por `POST /v2/messages/whatsapp` de Telnyx, con TELNYX_API_KEY.
 *
 * El número remitente (`WHATSAPP_TELNYX_FROM_NUMBER`) es español y Telnyx no
 * permite asignarle un perfil de mensajería de forma permanente (error 40323,
 * mismo bloqueo de números españoles que documenta
 * `resolveSmsMessagingProfileId` en voiceTools/service.ts) — por eso
 * `messaging_profile_id` va explícito en cada petición de envío en vez de
 * dejar que Telnyx lo resuelva solo a partir del `from`.
 */
export class WhatsAppAdapter {
  private getConfig(): {
    apiKey: string;
    fromNumber: string;
    messagingProfileId: string;
  } | null {
    const apiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.WHATSAPP_TELNYX_FROM_NUMBER;
    const messagingProfileId = process.env.TELNYX_MESSAGING_PROFILE_ID;
    if (!apiKey || !fromNumber || !messagingProfileId) {
      return null;
    }
    return { apiKey, fromNumber, messagingProfileId };
  }

  isConfigured(): boolean {
    return this.getConfig() !== null;
  }

  async sendTemplate({
    to,
    templateName,
    languageCode,
    bodyParams,
  }: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    const config = this.getConfig();
    if (!config) {
      throw new Error(
        "WhatsApp no está configurado (faltan TELNYX_API_KEY / WHATSAPP_TELNYX_FROM_NUMBER / TELNYX_MESSAGING_PROFILE_ID)"
      );
    }

    const parameters = Object.entries(bodyParams).map(([parameterName, text]) => ({
      type: "text",
      parameter_name: parameterName,
      text,
    }));

    const response = await fetch(`${TELNYX_API_BASE_URL}/messages/whatsapp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromNumber,
        to,
        messaging_profile_id: config.messagingProfileId,
        whatsapp_message: {
          type: "template",
          template: {
            name: templateName,
            language: { policy: "deterministic", code: languageCode },
            ...(parameters.length > 0
              ? { components: [{ type: "body", parameters }] }
              : {}),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Error ${response.status} al enviar la plantilla de WhatsApp "${templateName}" vía Telnyx: ${errorBody}`
      );
    }

    const data = (await response.json()) as { data?: { id?: string } };
    return { messageId: data.data?.id ?? "" };
  }
}

export const whatsappAdapter = new WhatsAppAdapter();

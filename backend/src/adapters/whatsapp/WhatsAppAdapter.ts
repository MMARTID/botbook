const GRAPH_API_BASE_URL = "https://graph.facebook.com/v21.0";

export interface WhatsAppTemplateMessage {
  /** Número del destinatario en formato E.164, p.ej. "+34600111222". */
  to: string;
  templateName: string;
  languageCode: string;
  /** Variables {{1}}, {{2}}... del body de la plantilla, en orden. */
  bodyParams: string[];
}

export interface WhatsAppSendResult {
  messageId: string;
}

/**
 * Cliente de la WhatsApp Cloud API de Meta (no de Telnyx — Telnyx no ofrece
 * WhatsApp Business como producto). Requiere una app de Meta for Developers
 * con el producto WhatsApp vinculado a la WhatsApp Business Account real del
 * negocio, un token de acceso permanente (System User, no el de 24h del
 * panel de pruebas) y las plantillas de mensaje aprobadas por Meta — fuera
 * de la ventana de 24h de conversación, solo se puede enviar con plantilla.
 */
export class WhatsAppAdapter {
  private getConfig(): { phoneNumberId: string; accessToken: string } | null {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      return null;
    }
    return { phoneNumberId, accessToken };
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
        "WhatsApp no está configurado (faltan WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)"
      );
    }

    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(bodyParams.length > 0
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: bodyParams.map((text) => ({ type: "text", text })),
                    },
                  ],
                }
              : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Error ${response.status} al enviar la plantilla de WhatsApp "${templateName}": ${errorBody}`
      );
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    return { messageId: data.messages?.[0]?.id ?? "" };
  }
}

export const whatsappAdapter = new WhatsAppAdapter();

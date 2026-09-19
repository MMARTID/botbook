import Telnyx from "telnyx";
import { getTelnyxClient, getTelnyxWhatsappClient } from "../../lib/telnyx.js";

/** A quién le habla Alhabla: cada audiencia tiene su propio número. */
export type WhatsappAudience = "client" | "owner";

interface WhatsAppOutbound {
  /** Número de Alhabla en E.164. Si falta, `WHATSAPP_TELNYX_FROM_NUMBER`. */
  from?: string;
  /** Número del destinatario en formato E.164, p.ej. "+34600111222". */
  to: string;
  /** `biz_opaque_callback_data`: Meta lo devuelve en cada `statuses[]`. */
  callbackData?: string;
}

export interface WhatsAppTemplateMessage extends WhatsAppOutbound {
  /**
   * UUID de la plantilla en Telnyx — la vía preferida. Por nombre + idioma
   * `es_ES` Meta devuelve `40008 Undeliverable` aunque la plantilla esté
   * aprobada (verificado el 2026-09-19); por `template_id` se entrega.
   */
  templateId?: string;
  /** Respaldo por nombre + idioma (solo funciona con `es`). */
  templateName?: string;
  languageCode?: string;
  /** Variables con nombre del body de la plantilla ({{negocio_nombre}},
   * {{servicios}}...), tal como las aprobó Meta — el nombre de cada clave
   * debe coincidir exactamente con el de la plantilla. */
  bodyParams: Record<string, string>;
  /** Sufijo dinámico de los botones URL (`https://…/{{1}}`), por índice. */
  buttonUrlParams?: Array<{ index: number; text: string }>;
}

export interface WhatsAppTextMessage extends WhatsAppOutbound {
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppButton {
  /** Hasta 256 caracteres; es lo que vuelve en `button_reply.id`. */
  id: string;
  /** Hasta 20 caracteres (límite de Meta). */
  title: string;
}

export interface WhatsAppButtonsMessage extends WhatsAppOutbound {
  body: string;
  /** Entre uno y tres botones de respuesta rápida. */
  buttons: WhatsAppButton[];
  header?: string;
  footer?: string;
}

export interface WhatsAppContactCard {
  formattedName: string;
  firstName?: string;
  company?: string;
  phones: Array<{ number: string; type?: "WORK" | "CELL" | "MAIN" | "HOME" }>;
  emails?: Array<{ email: string; type?: "WORK" | "HOME" }>;
  urls?: Array<{ url: string; type?: "WORK" | "HOME" }>;
}

export interface WhatsAppContactsMessage extends WhatsAppOutbound {
  contacts: WhatsAppContactCard[];
}

export interface WhatsAppSendResult {
  messageId: string;
  /** Estado inicial que devuelve Telnyx, normalmente "queued". */
  status: string | null;
}

export interface WhatsAppConversationWindow {
  active: boolean;
  expiresAt: Date | null;
  lastUserMessageAt: Date | null;
  /** "24h" u otros tipos de ventana que defina Meta. */
  type: string | null;
}

export interface WhatsAppWabaPhoneNumber {
  phoneNumber: string;
  metaPhoneNumberId: string | null;
  displayName: string | null;
  displayNameStatus: string | null;
  status: string;
  qualityRating: string | null;
  messagingLimit: string | null;
}

export interface WhatsAppTemplateSummary {
  telnyxTemplateId: string;
  metaTemplateId: string | null;
  name: string;
  language: string;
  category: string;
  status: string;
  qualityRating: string | null;
  rejectionReason: string | null;
  components: unknown;
}

/** Error de la API de Telnyx al hablar con WhatsApp, con el estado HTTP. */
export class WhatsAppApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "WhatsAppApiError";
    this.status = status;
  }
}

const SDK_TEMPLATE_PARAMETER_TYPE = "text" as const;

type SdkTemplateComponent = NonNullable<
  NonNullable<Telnyx.Messages.WhatsappMessageContent["template"]>["components"]
>[number];

/**
 * Cliente de WhatsApp Business API vía Telnyx (Business Solution Provider de
 * Meta) — no la Cloud API de Meta directamente. El WABA de Alhabla se conectó
 * mediante el Embedded Signup de Telnyx (Mission Control → Messaging →
 * WhatsApp), así que Meta gestiona esta cuenta bajo el Tech Provider de
 * Telnyx y bloquea el acceso directo con un token de Meta propio
 * ("API access blocked", OAuthException 200) — todo pasa por la API de
 * Telnyx con TELNYX_API_KEY, a través del SDK oficial.
 *
 * Los números de Alhabla son españoles y Telnyx no permite asignarles un
 * perfil de mensajería (error 40323, mismo bloqueo que documenta
 * `resolveSmsMessagingProfileId` en voiceTools/service.ts) — por eso
 * `messaging_profile_id` va explícito en cada envío en vez de dejar que
 * Telnyx lo resuelva a partir del `from`.
 *
 * Qué número usa cada envío lo decide `modules/whatsapp/service.ts`
 * (remitente por audiencia); este adaptador solo habla con la API.
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

  private requireConfig() {
    const config = this.getConfig();
    if (!config) {
      throw new Error(
        "WhatsApp no está configurado (faltan TELNYX_API_KEY / WHATSAPP_TELNYX_FROM_NUMBER / TELNYX_MESSAGING_PROFILE_ID)"
      );
    }
    return config;
  }

  private async send(
    message: WhatsAppOutbound,
    content: Telnyx.Messages.WhatsappMessageContent,
    describe: string
  ): Promise<WhatsAppSendResult> {
    const config = this.requireConfig();
    const from = message.from ?? config.fromNumber;

    try {
      const response = await getTelnyxClient().messages.whatsapp({
        from,
        to: message.to,
        type: "WHATSAPP",
        messaging_profile_id: config.messagingProfileId,
        whatsapp_message: {
          ...content,
          ...(message.callbackData
            ? { biz_opaque_callback_data: message.callbackData }
            : {}),
        },
      });
      const data = response.data;
      return {
        messageId: data?.id ?? "",
        status: data?.to?.[0]?.status ?? null,
      };
    } catch (error) {
      throw toWhatsAppApiError(
        error,
        `al enviar ${describe} por WhatsApp desde ${from}`
      );
    }
  }

  async sendTemplate(
    message: WhatsAppTemplateMessage
  ): Promise<WhatsAppSendResult> {
    if (!message.templateId && !message.templateName) {
      throw new Error(
        "Hace falta templateId o templateName para enviar una plantilla de WhatsApp"
      );
    }

    const components: SdkTemplateComponent[] = [];
    const bodyParameters = Object.entries(message.bodyParams).map(
      ([parameterName, text]) => ({
        type: SDK_TEMPLATE_PARAMETER_TYPE,
        // El SDK tipa los parámetros como posicionales; Telnyx acepta los
        // nombrados (`parameter_name`) igual que la Cloud API de Meta.
        parameter_name: parameterName,
        text,
      })
    );
    if (bodyParameters.length > 0) {
      components.push({
        type: "body",
        parameters:
          bodyParameters as unknown as SdkTemplateComponent["parameters"],
      });
    }
    for (const button of message.buttonUrlParams ?? []) {
      components.push({
        type: "button",
        sub_type: "url",
        index: button.index,
        parameters: [{ type: SDK_TEMPLATE_PARAMETER_TYPE, text: button.text }],
      });
    }

    const template: NonNullable<
      Telnyx.Messages.WhatsappMessageContent["template"]
    > = message.templateId
      ? { template_id: message.templateId }
      : {
          name: message.templateName,
          language: {
            policy: "deterministic",
            code: message.languageCode ?? "es",
          },
        };
    if (components.length > 0) {
      template.components = components;
    }

    const label = message.templateId
      ? `la plantilla ${message.templateId}`
      : `la plantilla "${message.templateName}"`;
    return this.send(message, { type: "template", template }, label);
  }

  /** Texto libre: solo llega dentro de la ventana de 24 h del destinatario. */
  async sendText(message: WhatsAppTextMessage): Promise<WhatsAppSendResult> {
    return this.send(
      message,
      {
        type: "text",
        text: { body: message.body, preview_url: message.previewUrl ?? false },
      },
      "un texto"
    );
  }

  /** Mensaje interactivo con botones de respuesta rápida (máximo tres). */
  async sendInteractiveButtons(
    message: WhatsAppButtonsMessage
  ): Promise<WhatsAppSendResult> {
    if (message.buttons.length < 1 || message.buttons.length > 3) {
      throw new Error(
        "Un mensaje interactivo de WhatsApp lleva entre uno y tres botones"
      );
    }
    return this.send(
      message,
      {
        type: "interactive",
        interactive: {
          type: "button",
          // La API exige `header.type: "text"` (10015 si falta); el SDK no
          // lo tipa, de ahí la conversión.
          ...(message.header
            ? {
                header: {
                  type: "text",
                  text: message.header,
                } as unknown as NonNullable<
                  Telnyx.Messages.WhatsappInteractive["header"]
                >,
              }
            : {}),
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            buttons: message.buttons.map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.title },
            })),
          },
        },
      },
      "un mensaje con botones"
    );
  }

  /** Tarjeta de contacto (vCard). No cabe en una plantilla: solo dentro de la ventana. */
  async sendContacts(
    message: WhatsAppContactsMessage
  ): Promise<WhatsAppSendResult> {
    const contacts = message.contacts.map((contact) => ({
      // Meta exige `name.formatted_name`; el SDK tipa `name` como string por
      // error, así que se construye la forma de Meta y se convierte al tipo.
      name: {
        formatted_name: contact.formattedName,
        first_name: contact.firstName ?? contact.formattedName,
      },
      ...(contact.company ? { org: { company: contact.company } } : {}),
      phones: contact.phones.map((phone) => ({
        phone: phone.number,
        wa_id: phone.number.replace(/^\+/, ""),
        type: phone.type ?? "WORK",
      })),
      ...(contact.emails
        ? {
            emails: contact.emails.map((email) => ({
              email: email.email,
              type: email.type ?? "WORK",
            })),
          }
        : {}),
      ...(contact.urls
        ? {
            urls: contact.urls.map((url) => ({
              url: url.url,
              type: url.type ?? "WORK",
            })),
          }
        : {}),
    })) as unknown as Telnyx.Messages.WhatsappContact[];

    return this.send(
      message,
      { type: "contacts", contacts },
      "una tarjeta de contacto"
    );
  }

  /**
   * Ventana de servicio de 24 h entre un número de Alhabla y un
   * destinatario: dentro se puede enviar texto libre e interactivos (0,004 $);
   * fuera, solo plantilla (0,024 $). Telnyx es la fuente de verdad.
   */
  async getConversationWindow(
    from: string,
    to: string
  ): Promise<WhatsAppConversationWindow> {
    try {
      const response =
        await getTelnyxWhatsappClient().whatsapp.phoneNumbers.retrieveConversationWindow(
          from,
          { destination_number: to }
        );
      const data = response.data;
      return {
        active: data?.window_active === true,
        expiresAt: toDate(data?.window_expires_at),
        lastUserMessageAt: toDate(data?.last_user_message_at),
        type: data?.window_type ?? null,
      };
    } catch (error) {
      throw toWhatsAppApiError(
        error,
        `al consultar la ventana de ${from} con ${to}`
      );
    }
  }

  /** Números registrados en el WABA (los remitentes de Alhabla). */
  async listWabaPhoneNumbers(): Promise<WhatsAppWabaPhoneNumber[]> {
    try {
      const numbers: WhatsAppWabaPhoneNumber[] = [];
      for await (const item of getTelnyxWhatsappClient().whatsapp.phoneNumbers.list()) {
        const raw = item as Record<string, unknown>;
        if (typeof item.phone_number !== "string") continue;
        numbers.push({
          phoneNumber: item.phone_number,
          metaPhoneNumberId: item.phone_number_id ?? null,
          displayName: item.display_name ?? null,
          displayNameStatus: asString(raw.display_name_status),
          status: item.status ?? "UNKNOWN",
          qualityRating: item.quality_rating ?? null,
          messagingLimit: asString(raw.messaging_limit),
        });
      }
      return numbers;
    } catch (error) {
      throw toWhatsAppApiError(error, "al listar los números del WABA");
    }
  }

  /** Plantillas del WABA con su estado de aprobación en Meta. */
  async listTemplates(wabaId: string): Promise<WhatsAppTemplateSummary[]> {
    try {
      const templates: WhatsAppTemplateSummary[] = [];
      // El SDK tipa el filtro como `filter[waba_id]`, pero la API solo
      // filtra con `waba_id` a secas (con el otro devuelve cero plantillas).
      const query = {
        waba_id: wabaId,
      } as unknown as Telnyx.Whatsapp.TemplateListParams;
      for await (const item of getTelnyxWhatsappClient().whatsapp.templates.list(
        query
      )) {
        const raw = item as Record<string, unknown>;
        if (typeof item.id !== "string" || typeof item.name !== "string")
          continue;
        templates.push({
          telnyxTemplateId: item.id,
          metaTemplateId: asString(raw.template_id),
          name: item.name,
          language: item.language ?? "es",
          category: item.category ?? "UTILITY",
          status: item.status ?? "UNKNOWN",
          qualityRating: asString(raw.quality_rating),
          rejectionReason:
            asString(raw.rejection_reason) ?? asString(raw.reason),
          components: item.components ?? null,
        });
      }
      return templates;
    } catch (error) {
      throw toWhatsAppApiError(error, "al listar las plantillas del WABA");
    }
  }
}

function toWhatsAppApiError(error: unknown, context: string): WhatsAppApiError {
  if (error instanceof WhatsAppApiError) {
    return error;
  }
  if (error instanceof Telnyx.APIError) {
    return new WhatsAppApiError(
      `Error ${error.status ?? "?"} ${context} vía Telnyx: ${error.message}`,
      error.status ?? null
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new WhatsAppApiError(`Error ${context} vía Telnyx: ${message}`, null);
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const whatsappAdapter = new WhatsAppAdapter();

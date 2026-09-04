import { getTelnyxClient } from "../../lib/telnyx.js";

export interface AvailableNumber {
  phoneNumber: string;
  region?: string;
  upfrontCost?: string;
  monthlyCost?: string;
  currency?: string;
}

export type TelnyxOrderStatus = "pending" | "success" | "failure";

export interface NumberOrderResult {
  orderId: string;
  status: TelnyxOrderStatus;
  phoneNumber: string;
  phoneNumberId?: string;
  requirementsMet?: boolean;
}

export class TelnyxAdapter {
  /**
   * Busca números de tipo local. Telnyx no expone requisitos regulatorios por
   * número en la búsqueda (a diferencia de Twilio) — los requisitos se
   * resuelven aparte, con un Requirement Group aplicado en el pedido.
   */
  async searchAvailableNumbers(
    countryCode: string,
    options: { limit?: number; locality?: string } = {}
  ): Promise<AvailableNumber[]> {
    const client = getTelnyxClient();
    const response = await client.availablePhoneNumbers.list({
      filter: {
        country_code: countryCode,
        phone_number_type: "local",
        limit: options.limit ?? 5,
        ...(options.locality ? { locality: options.locality } : {}),
      },
    });

    return (response.data || []).map((n) => {
      const location = n.region_information?.find(
        (r) => r.region_type === "location"
      );
      return {
        phoneNumber: n.phone_number || "",
        region: location?.region_name ?? undefined,
        upfrontCost: n.cost_information?.upfront_cost ?? undefined,
        monthlyCost: n.cost_information?.monthly_cost ?? undefined,
        currency: n.cost_information?.currency ?? undefined,
      };
    });
  }

  /**
   * Crea un pedido de compra para un número ya visto en la búsqueda. El
   * pedido es asíncrono: puede volver con status "pending" mientras Telnyx
   * valida los requisitos regulatorios, incluso con un Requirement Group ya
   * aprobado. Usar getNumberOrder para sondear su resolución.
   */
  async purchaseNumber(
    phoneNumber: string,
    options: { requirementGroupId?: string; connectionId?: string } = {}
  ): Promise<NumberOrderResult> {
    const client = getTelnyxClient();
    const response = await client.numberOrders.create({
      ...(options.connectionId ? { connection_id: options.connectionId } : {}),
      phone_numbers: [
        {
          phone_number: phoneNumber,
          ...(options.requirementGroupId
            ? { requirement_group_id: options.requirementGroupId }
            : {}),
        },
      ],
    });

    return this.toOrderResult(response.data);
  }

  /**
   * Consulta el estado de un pedido ya creado — para sondear pedidos
   * asíncronos o reanudar uno en curso en un reintento, sin duplicar la compra.
   */
  async getNumberOrder(orderId: string): Promise<NumberOrderResult> {
    const client = getTelnyxClient();
    const response = await client.numberOrders.retrieve(orderId);
    return this.toOrderResult(response.data);
  }

  async releaseNumber(phoneNumberId: string): Promise<void> {
    const client = getTelnyxClient();
    await client.phoneNumbers.delete(phoneNumberId);
  }

  async getNumber(
    phoneNumberId: string
  ): Promise<{ id: string; phoneNumber: string; status: string } | null> {
    const client = getTelnyxClient();
    try {
      const response = await client.phoneNumbers.retrieve(phoneNumberId);
      const data = (response as any).data ?? response;
      return {
        id: data.id,
        phoneNumber: data.phone_number,
        status: data.status,
      };
    } catch {
      return null;
    }
  }

  private toOrderResult(data: any): NumberOrderResult {
    const number = data?.phone_numbers?.[0];
    return {
      orderId: data?.id,
      status: (data?.status ?? "pending") as TelnyxOrderStatus,
      phoneNumber: number?.phone_number ?? "",
      phoneNumberId: number?.id ?? undefined,
      requirementsMet: data?.requirements_met ?? undefined,
    };
  }
}

export const telnyxAdapter = new TelnyxAdapter();

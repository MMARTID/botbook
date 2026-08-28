import { getTwilioClient } from "../../lib/twilio.js";

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  /** 'none' | 'any' | 'local' | 'foreign' — si no es 'none', Twilio exige un
   * AddressSid para comprar este número. */
  addressRequirements?: string;
}

export class TwilioAdapter {
  /**
   * Solo busca números de tipo local. España prohíbe expresamente que
   * ISVs/revendedores usen números de tipo national/mobile (ver
   * https://www.twilio.com/en-us/guidelines/es/regulatory) — restricción que
   * no aplica a los de tipo local, que es el único que este adaptador maneja
   * hoy. No se añade fallback a mobile/national: hacerlo silenciosamente
   * podría comprar un número prohibido para nuestro modelo de negocio.
   */
  async searchAvailableNumbers(
    countryCode: string,
    options: { limit?: number; areaCode?: string } = {}
  ): Promise<AvailableNumber[]> {
    const client = getTwilioClient();
    const limit = options.limit ?? 5;

    const localOpts: { limit: number; areaCode?: number } = { limit };
    if (options.areaCode) {
      localOpts.areaCode = Number(options.areaCode);
    }
    const localResults = await client
      .availablePhoneNumbers(countryCode)
      .local.list(localOpts);

    return localResults.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      locality: n.locality ?? undefined,
      region: n.region ?? undefined,
      addressRequirements: n.addressRequirements ?? undefined,
    }));
  }

  async purchaseNumber(
    phoneNumber: string,
    options: { bundleSid?: string; addressSid?: string } = {}
  ): Promise<{
    sid: string;
    phoneNumber: string;
  }> {
    const client = getTwilioClient();
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
      ...(options.bundleSid ? { bundleSid: options.bundleSid } : {}),
      ...(options.addressSid ? { addressSid: options.addressSid } : {}),
    });

    return {
      sid: purchased.sid,
      phoneNumber: purchased.phoneNumber,
    };
  }

  async releaseNumber(sid: string): Promise<void> {
    const client = getTwilioClient();
    await client.incomingPhoneNumbers(sid).remove();
  }

  async getNumber(sid: string): Promise<{
    sid: string;
    phoneNumber: string;
    friendlyName: string;
    status: string;
  } | null> {
    const client = getTwilioClient();
    try {
      const number = await client.incomingPhoneNumbers(sid).fetch();
      return {
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName,
        status: number.status,
      };
    } catch {
      return null;
    }
  }
}

export const twilioAdapter = new TwilioAdapter();

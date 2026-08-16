import { getTwilioClient } from "../../lib/twilio.js";

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality?: string;
  region?: string;
}

export class TwilioAdapter {
  async searchAvailableNumbers(
    countryCode: string,
    options: { limit?: number; areaCode?: string } = {}
  ): Promise<AvailableNumber[]> {
    const client = getTwilioClient();
    const limit = options.limit ?? 5;

    try {
      const localOpts: { limit: number; areaCode?: number } = { limit };
      if (options.areaCode) {
        localOpts.areaCode = Number(options.areaCode);
      }
      const localResults = await client
        .availablePhoneNumbers(countryCode)
        .local.list(localOpts);

      if (localResults.length > 0) {
        return localResults.map((n) => ({
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          locality: n.locality ?? undefined,
          region: n.region ?? undefined,
        }));
      }
    } catch (error) {
      console.warn(
        `[Twilio] No local numbers available for ${countryCode}:`
      );
    }

    try {
      const mobileResults = await client
        .availablePhoneNumbers(countryCode)
        .mobile.list({ limit });

      if (mobileResults.length > 0) {
        return mobileResults.map((n) => ({
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          locality: n.locality ?? undefined,
          region: n.region ?? undefined,
        }));
      }
    } catch (error) {
      console.warn(
        `[Twilio] No mobile numbers available for ${countryCode}:`
      );
    }

    try {
      const nationalResults = await client
        .availablePhoneNumbers(countryCode)
        .national.list({ limit });

      return nationalResults.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality ?? undefined,
        region: n.region ?? undefined,
      }));
    } catch (error) {
      console.warn(
        `[Twilio] No national numbers available for ${countryCode}:`
      );
    }

    return [];
  }

  async purchaseNumber(phoneNumber: string): Promise<{
    sid: string;
    phoneNumber: string;
  }> {
    const client = getTwilioClient();
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber,
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

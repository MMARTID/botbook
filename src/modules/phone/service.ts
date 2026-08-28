import { prisma } from "../../lib/prisma.js";
import { twilioAdapter } from "../../adapters/twilio/TwilioAdapter.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";

export type PhoneNumberStatus =
  | "pending"
  | "purchased"
  | "active"
  | "failed";

const DEFAULT_COUNTRY =
  process.env.TWILIO_PHONE_NUMBER_COUNTRY || "ES";

/**
 * Provisions a Twilio phone number for a business and configures it in the
 * active voice orchestrator (Vapi or Retell).
 * Idempotent: safe to call multiple times; skips if status is already 'active'.
 */
export async function provisionPhoneNumber(
  businessId: string
): Promise<{
  success: boolean;
  phoneNumber?: string;
  status: PhoneNumberStatus;
  error?: string;
}> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      agents: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!business) {
    return { success: false, status: "failed", error: "Business not found" };
  }

  const orchestrator = business.orchestrator || "retell";

  const isAlreadyActive =
    business.twilioPhoneNumberStatus === "active" && business.twilioPhoneNumber;
  if (isAlreadyActive) {
    return {
      success: true,
      phoneNumber: business.twilioPhoneNumber || undefined,
      status: "active",
    };
  }

  try {
    // Por ahora solo compramos números españoles: es el único país con
    // bundle regulatorio aprobado y con lógica de dirección/compliance
    // revisada. Fallar claro aquí en vez de intentar una compra sin bundle
    // que Twilio rechazaría de todas formas con un error más confuso.
    if (DEFAULT_COUNTRY !== "ES") {
      throw new Error(
        `Solo se soportan números de España (ES) por ahora; TWILIO_PHONE_NUMBER_COUNTRY está en "${DEFAULT_COUNTRY}"`
      );
    }

    // Bundle regulatorio de plataforma (tipo "individual" hoy, pasará a
    // "business" cuando el usuario se dé de alta como autónomo/empresa) — un
    // único bundle reutilizado para todos los negocios, aprobado solo para
    // números españoles de tipo local.
    const spainBundleSid = process.env.TWILIO_SPAIN_BUNDLE_SID;
    if (!spainBundleSid) {
      throw new Error(
        "Falta configurar TWILIO_SPAIN_BUNDLE_SID (bundle regulatorio aprobado para España)"
      );
    }

    // 1. Search available numbers
    const available = await twilioAdapter.searchAvailableNumbers(
      DEFAULT_COUNTRY,
      { limit: 5 }
    );

    if (available.length === 0) {
      throw new Error(
        `No available phone numbers in country ${DEFAULT_COUNTRY}`
      );
    }

    // 2. Purchase the first available number without extra address
    // requirements — no tenemos AddressSid configurado todavía, así que un
    // número que lo exija fallaría en Twilio con un error críptico. Mejor
    // buscar uno que no lo necesite y fallar claro si ninguno cumple.
    const selected = available.find(
      (n) => !n.addressRequirements || n.addressRequirements === "none"
    );

    if (!selected) {
      throw new Error(
        `Los ${available.length} números disponibles en ${DEFAULT_COUNTRY} requieren una dirección (AddressSid) que todavía no está configurada`
      );
    }

    console.log(
      `[Phone] Purchasing number ${selected.phoneNumber} for business ${businessId}`
    );

    const purchased = await twilioAdapter.purchaseNumber(selected.phoneNumber, {
      bundleSid: spainBundleSid,
    });

    // 3. Save purchased state
    await prisma.business.update({
      where: { id: businessId },
      data: {
        twilioPhoneNumber: purchased.phoneNumber,
        twilioPhoneNumberSid: purchased.sid,
        twilioPhoneNumberPurchasedAt: new Date(),
        twilioPhoneNumberStatus: "purchased",
      },
    });

    // 4. Find active agent to associate
    const agent = business.agents[0];

    if (orchestrator === "retell") {
      if (!agent?.retellAgentId) {
        console.warn(
          `[Phone] Business ${businessId} has no active agent with retellAgentId. Number purchased but not linked in Retell.`
        );
        return {
          success: true,
          phoneNumber: purchased.phoneNumber,
          status: "purchased",
        };
      }

      const retellPhone = await retellAdapter.createPhoneNumber({
        phoneNumber: purchased.phoneNumber,
        nickname: business.name,
        inboundAgentId: agent.retellAgentId,
      });

      await prisma.business.update({
        where: { id: businessId },
        data: {
          twilioPhoneNumberStatus: "active",
          retellPhoneNumberId: retellPhone.phone_number_id,
          retellPhoneNumber: retellPhone.phone_number,
        },
      });

      console.log(
        `[Phone] Number ${purchased.phoneNumber} active for business ${businessId} (Retell ID: ${retellPhone.phone_number_id})`
      );

      return {
        success: true,
        phoneNumber: purchased.phoneNumber,
        status: "active",
      };
    }

    // Default: Vapi orchestrator. VAPI: inactivo, ningún negocio nuevo cae aquí.
    if (!agent?.vapiAssistantId) {
      console.warn(
        `[Phone] Business ${businessId} has no active agent with vapiAssistantId. Number purchased but not linked in Vapi.`
      );
      return {
        success: true,
        phoneNumber: purchased.phoneNumber,
        status: "purchased",
      };
    }

    // 5. Create phone number in Vapi linked to Twilio credentials
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error(
        "Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) are required to link the number in Vapi"
      );
    }

    const vapiPhone = await vapiAdapter.createPhoneNumber({
      provider: "twilio",
      number: purchased.phoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      assistantId: agent.vapiAssistantId,
      name: business.name,
    });

    // 6. Save active state
    await prisma.business.update({
      where: { id: businessId },
      data: {
        twilioPhoneNumberStatus: "active",
        vapiPhoneNumberId: vapiPhone.id,
      },
    });

    console.log(
      `[Phone] Number ${purchased.phoneNumber} active for business ${businessId} (Vapi ID: ${vapiPhone.id})`
    );

    return {
      success: true,
      phoneNumber: purchased.phoneNumber,
      status: "active",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error(`[Phone] Provisioning failed for business ${businessId}:`, message);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        twilioPhoneNumberStatus: "failed",
      },
    });

    return { success: false, status: "failed", error: message };
  }
}

/**
 * Get the phone number status for a business.
 */
export async function getPhoneNumberStatus(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      twilioPhoneNumber: true,
      twilioPhoneNumberSid: true,
      twilioPhoneNumberPurchasedAt: true,
      twilioPhoneNumberStatus: true,
      vapiPhoneNumberId: true,
      retellPhoneNumberId: true,
      orchestrator: true,
    },
  });

  if (!business) {
    return null;
  }

  return {
    phoneNumber: business.twilioPhoneNumber,
    sid: business.twilioPhoneNumberSid,
    purchasedAt: business.twilioPhoneNumberPurchasedAt,
    status: business.twilioPhoneNumberStatus,
    orchestrator: business.orchestrator || "retell",
    vapiPhoneNumberId: business.vapiPhoneNumberId,
    retellPhoneNumberId: business.retellPhoneNumberId,
  };
}

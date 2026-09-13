import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { enqueueEmailJob } from "../../lib/cloudTasks.js";
import {
  accountDeletedEmail,
  passwordChangedEmail,
} from "../../lib/emailTemplates.js";
import { getStripeClient } from "../../lib/stripe.js";
import { deleteStorageObject } from "../../lib/storage.js";
import { retellAdapter } from "../../adapters/retell/RetellAdapter.js";
import { telnyxAdapter } from "../../adapters/telnyx/TelnyxAdapter.js";
import { telnyxAiAdapter } from "../../adapters/telnyx/TelnyxAiAdapter.js";
import { twilioAdapter } from "../../adapters/twilio/TwilioAdapter.js";
import { vapiAdapter } from "../../adapters/vapi/VapiAdapter.js";

export class AccountActionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

async function getOwnedUser(userId: string, businessId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, businessId },
    select: { id: true, email: true, password: true, googleId: true },
  });

  if (!user) {
    throw new AccountActionError("Cuenta no encontrada", 404);
  }

  return user;
}

async function verifyCurrentPassword(
  storedPassword: string | null,
  suppliedPassword: string | undefined,
) {
  // Las cuentas creadas con Google no tienen contraseña hasta que la fijan
  // desde Ajustes. En ese primer cambio basta la sesión autenticada.
  if (!storedPassword) return;

  if (!suppliedPassword || !(await bcrypt.compare(suppliedPassword, storedPassword))) {
    throw new AccountActionError("La contraseña actual no es correcta", 401);
  }
}

async function enqueueAccountEmail(input: {
  toAddress: string;
  subject: string;
  html: string;
}) {
  try {
    await enqueueEmailJob({
      fromAlias: "support",
      ...input,
    });
  } catch (error) {
    // El correo es una confirmación secundaria: una caída de Zoho o Cloud
    // Tasks nunca debe deshacer un cambio de contraseña ni dejar una cuenta
    // a medio eliminar.
    console.error(
      `[Account] No se pudo enviar el correo "${input.subject}" a ${input.toAddress}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function getAccountOverview(userId: string, businessId: string) {
  const user = await getOwnedUser(userId, businessId);
  return {
    email: user.email,
    passwordConfigured: Boolean(user.password),
    googleConnected: Boolean(user.googleId),
  };
}

export async function changeAccountPassword(input: {
  userId: string;
  businessId: string;
  currentPassword?: string;
  newPassword: string;
}) {
  const user = await getOwnedUser(input.userId, input.businessId);
  await verifyCurrentPassword(user.password, input.currentPassword);

  const password = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password },
  });

  const email = passwordChangedEmail();
  await enqueueAccountEmail({ toAddress: user.email, ...email });

  return { passwordConfigured: true as const };
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  const value = candidate.statusCode ?? candidate.status ?? candidate.response?.status;
  return typeof value === "number" ? value : undefined;
}

async function removeExternalResource(label: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    // Hace que el flujo sea reintentable si una ejecución anterior ya eliminó
    // parte de los recursos antes de fallar en otro proveedor.
    if (getHttpStatus(error) === 404) return;
    throw new AccountActionError(
      `No se pudo retirar ${label}. Inténtalo de nuevo antes de eliminar la cuenta.`,
      502,
    );
  }
}

export async function deleteAccount(input: {
  userId: string;
  businessId: string;
  currentPassword?: string;
}) {
  const user = await getOwnedUser(input.userId, input.businessId);
  await verifyCurrentPassword(user.password, input.currentPassword);

  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: {
      id: true,
      name: true,
      stripeSubscriptionId: true,
      telnyxPhoneNumber: true,
      telnyxPhoneNumberId: true,
      twilioPhoneNumberSid: true,
      vapiPhoneNumberId: true,
      retellPhoneNumberId: true,
      agents: {
        select: {
          vapiAssistantId: true,
          retellAgentId: true,
          retellLlmId: true,
          telnyxAssistantId: true,
        },
      },
      calls: {
        select: { recording: { select: { storageKey: true } } },
      },
    },
  });

  if (!business) {
    throw new AccountActionError("Cuenta no encontrada", 404);
  }

  if (business.stripeSubscriptionId) {
    await removeExternalResource("la suscripción", async () => {
      await getStripeClient().subscriptions.cancel(business.stripeSubscriptionId!);
    });
  }

  if (business.retellPhoneNumberId) {
    await removeExternalResource("el número de Retell", () =>
      retellAdapter.deletePhoneNumber(business.retellPhoneNumberId!),
    );
  }
  if (business.vapiPhoneNumberId) {
    await removeExternalResource("el número de Vapi", () =>
      vapiAdapter.deletePhoneNumber(business.vapiPhoneNumberId!),
    );
  }
  let telnyxPhoneNumberId = business.telnyxPhoneNumberId;
  if (business.telnyxPhoneNumber) {
    try {
      telnyxPhoneNumberId =
        (await telnyxAdapter.getNumberByPhoneNumber(business.telnyxPhoneNumber))?.id ??
        telnyxPhoneNumberId;
    } catch {
      throw new AccountActionError(
        "No se pudo comprobar el número de Telnyx. Inténtalo de nuevo antes de eliminar la cuenta.",
        502,
      );
    }
  }
  if (telnyxPhoneNumberId) {
    await removeExternalResource("el número de Telnyx", () =>
      telnyxAdapter.releaseNumber(telnyxPhoneNumberId!),
    );
  }
  if (business.twilioPhoneNumberSid) {
    await removeExternalResource("el número histórico de Twilio", () =>
      twilioAdapter.releaseNumber(business.twilioPhoneNumberSid!),
    );
  }

  for (const agent of business.agents) {
    if (agent.telnyxAssistantId) {
      await removeExternalResource("el agente de Telnyx", () =>
        telnyxAiAdapter.deleteAssistant(agent.telnyxAssistantId!),
      );
    }
    if (agent.retellAgentId) {
      await removeExternalResource("el agente de Retell", () =>
        retellAdapter.deleteAgent(agent.retellAgentId!),
      );
    }
    if (agent.retellLlmId) {
      await removeExternalResource("la configuración de Retell", () =>
        retellAdapter.deleteLlm(agent.retellLlmId!),
      );
    }
    if (agent.vapiAssistantId) {
      await removeExternalResource("el agente histórico de Vapi", () =>
        vapiAdapter.deleteAssistant(agent.vapiAssistantId!),
      );
    }
  }

  const storageKeys = business.calls.flatMap((call) =>
    call.recording?.storageKey ? [call.recording.storageKey] : [],
  );
  for (const storageKey of storageKeys) {
    await removeExternalResource("una grabación almacenada", () =>
      deleteStorageObject(storageKey),
    );
  }

  await prisma.business.delete({ where: { id: business.id } });

  const email = accountDeletedEmail({ businessName: business.name });
  await enqueueAccountEmail({ toAddress: user.email, ...email });
}

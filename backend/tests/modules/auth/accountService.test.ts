import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueEmailJob } from "../../../src/lib/cloudTasks.js";
import { getStripeClient } from "../../../src/lib/stripe.js";
import { telnyxAiAdapter } from "../../../src/adapters/telnyx/TelnyxAiAdapter.js";
import {
  AccountActionError,
  changeAccountPassword,
  deleteAccount,
  getAccountOverview,
} from "../../../src/modules/auth/accountService.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    user: { findFirst: vi.fn(), update: vi.fn() },
    business: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("../../../src/lib/cloudTasks.js", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock("../../../src/lib/stripe.js", () => ({ getStripeClient: vi.fn() }));
vi.mock("../../../src/lib/storage.js", () => ({ deleteStorageObject: vi.fn() }));
vi.mock("../../../src/adapters/retell/RetellAdapter.js", () => ({
  retellAdapter: { deletePhoneNumber: vi.fn(), deleteAgent: vi.fn(), deleteLlm: vi.fn() },
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAdapter.js", () => ({
  telnyxAdapter: { releaseNumber: vi.fn() },
}));
vi.mock("../../../src/adapters/telnyx/TelnyxAiAdapter.js", () => ({
  telnyxAiAdapter: {
    deleteAssistant: vi.fn(),
    deleteTexmlAppOfAssistant: vi.fn(),
  },
}));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

const mockedUserFindFirst = vi.mocked(prisma.user.findFirst);
const mockedUserUpdate = vi.mocked(prisma.user.update);
const mockedBusinessFindUnique = vi.mocked(prisma.business.findUnique);
const mockedBusinessDelete = vi.mocked(prisma.business.delete);
const mockedBcryptCompare = vi.mocked(bcrypt.compare);
const mockedBcryptHash = vi.mocked(bcrypt.hash);
const mockedEnqueueEmailJob = vi.mocked(enqueueEmailJob);
const mockedGetStripeClient = vi.mocked(getStripeClient);
const mockedDeleteAssistant = vi.mocked(telnyxAiAdapter.deleteAssistant);
const mockedDeleteTexmlApp = vi.mocked(telnyxAiAdapter.deleteTexmlAppOfAssistant);

const user = {
  id: "user_123",
  email: "cliente@example.com",
  password: "hash_anterior",
  googleId: null,
};

describe("accountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUserFindFirst.mockResolvedValue(user as any);
    mockedBcryptCompare.mockResolvedValue(true as any);
    mockedBcryptHash.mockResolvedValue("hash_nuevo" as any);
    mockedUserUpdate.mockResolvedValue({} as any);
    mockedEnqueueEmailJob.mockResolvedValue(undefined);
    mockedBusinessDelete.mockResolvedValue({} as any);
  });

  it("expone solo los datos de cuenta necesarios para ajustes", async () => {
    await expect(getAccountOverview("user_123", "business_123")).resolves.toEqual({
      email: "cliente@example.com",
      passwordConfigured: true,
      googleConnected: false,
    });
  });

  it("comprueba la contraseña actual, guarda un hash fuerte y envía confirmación", async () => {
    mockedUserUpdate.mockResolvedValue({ tokenVersion: 2 } as any);
    const resultado = await changeAccountPassword({
      userId: "user_123",
      businessId: "business_123",
      currentPassword: "Anterior123",
      newPassword: "NuevaClave123",
    });

    expect(mockedBcryptCompare).toHaveBeenCalledWith("Anterior123", "hash_anterior");
    expect(mockedBcryptHash).toHaveBeenCalledWith("NuevaClave123", 12);
    expect(mockedUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      // `tokenVersion` sube con la contraseña: cierra las sesiones abiertas.
      data: { password: "hash_nuevo", tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    // La versión nueva vuelve para que la ruta emita el token de la sesión.
    expect(resultado).toEqual({ passwordConfigured: true, tokenVersion: 2 });
    expect(mockedEnqueueEmailJob).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAlias: "support",
        toAddress: "cliente@example.com",
        subject: "Tu contraseña de Alhabla ha cambiado",
      }),
    );
  });

  it("no cambia nada si la contraseña actual es incorrecta", async () => {
    mockedBcryptCompare.mockResolvedValue(false as any);

    await expect(
      changeAccountPassword({
        userId: "user_123",
        businessId: "business_123",
        currentPassword: "Incorrecta",
        newPassword: "NuevaClave123",
      }),
    ).rejects.toEqual(
      expect.objectContaining<AccountActionError>({ statusCode: 401 }),
    );
    expect(mockedUserUpdate).not.toHaveBeenCalled();
  });

  it("cancela la suscripción antes de borrar el negocio y confirma por correo", async () => {
    const cancel = vi.fn().mockResolvedValue({});
    mockedGetStripeClient.mockReturnValue({ subscriptions: { cancel } } as any);
    mockedBusinessFindUnique.mockResolvedValue({
      id: "business_123",
      name: "Peluquería Norte",
      stripeSubscriptionId: "sub_123",
      telnyxPhoneNumberId: null,
      retellPhoneNumberId: null,
      agents: [],
      calls: [],
    } as any);

    await deleteAccount({
      userId: "user_123",
      businessId: "business_123",
      currentPassword: "Anterior123",
    });

    expect(cancel).toHaveBeenCalledWith("sub_123");
    expect(mockedBusinessDelete).toHaveBeenCalledWith({ where: { id: "business_123" } });
    expect(mockedEnqueueEmailJob).toHaveBeenCalledWith(
      expect.objectContaining({
        toAddress: "cliente@example.com",
        subject: "Cuenta eliminada — Peluquería Norte",
      }),
    );
  });

  describe("app TeXML del assistant de Telnyx", () => {
    const borrarCuenta = () =>
      deleteAccount({
        userId: "user_123",
        businessId: "business_123",
        currentPassword: "Anterior123",
      });
    let consoleError: ReturnType<typeof vi.spyOn>;
    let consoleWarn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockedBusinessFindUnique.mockResolvedValue({
        id: "business_123",
        name: "Peluquería Norte",
        stripeSubscriptionId: null,
        telnyxPhoneNumberId: null,
        retellPhoneNumberId: null,
        agents: [
          {
            telnyxAssistantId: "assistant-abc",
            retellAgentId: null,
            retellLlmId: null,
          },
        ],
        calls: [],
      } as any);
      mockedDeleteAssistant.mockResolvedValue(undefined);
      mockedDeleteTexmlApp.mockResolvedValue(1);
      consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    });

    it("la borra después del assistant", async () => {
      await borrarCuenta();

      expect(mockedDeleteAssistant).toHaveBeenCalledWith("assistant-abc");
      expect(mockedDeleteTexmlApp).toHaveBeenCalledWith("assistant-abc");
      expect(mockedDeleteTexmlApp.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockedDeleteAssistant.mock.invocationCallOrder[0],
      );
      expect(mockedBusinessDelete).toHaveBeenCalledWith({ where: { id: "business_123" } });
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    });

    it("si falla, elimina la cuenta igualmente y lo loguea con negocio, assistant, motivo y error", async () => {
      mockedDeleteTexmlApp.mockRejectedValue(
        Object.assign(new Error("Service Unavailable"), { status: 503 }),
      );

      await borrarCuenta();

      expect(mockedBusinessDelete).toHaveBeenCalledWith({ where: { id: "business_123" } });
      expect(consoleError).toHaveBeenCalledTimes(1);
      const [mensaje] = consoleError.mock.calls[0] as [string];
      expect(mensaje).toContain("[Account]");
      expect(mensaje).toContain("«ai-assistant-abc»");
      expect(mensaje).toContain("negocio=business_123");
      expect(mensaje).toContain("assistant=assistant-abc");
      expect(mensaje).toContain("motivo=eliminación de la cuenta");
      expect(mensaje).toContain("status=503");
      expect(mensaje).toContain("error=Service Unavailable");
    });

    it("la retira aunque el assistant ya no existiera (404 de un intento anterior)", async () => {
      mockedDeleteAssistant.mockRejectedValue({ status: 404 });

      await borrarCuenta();

      expect(mockedDeleteTexmlApp).toHaveBeenCalledWith("assistant-abc");
      expect(mockedBusinessDelete).toHaveBeenCalled();
    });

    it("no la toca si no se pudo borrar el assistant", async () => {
      mockedDeleteAssistant.mockRejectedValue({ status: 500 });

      await expect(borrarCuenta()).rejects.toEqual(
        expect.objectContaining<AccountActionError>({ statusCode: 502 }),
      );
      expect(mockedDeleteTexmlApp).not.toHaveBeenCalled();
      expect(mockedBusinessDelete).not.toHaveBeenCalled();
    });

    it("avisa si no encuentra ninguna app con el nombre del assistant", async () => {
      mockedDeleteTexmlApp.mockResolvedValue(0);

      await borrarCuenta();

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining("«ai-assistant-abc»"),
      );
      expect(consoleError).not.toHaveBeenCalled();
      expect(mockedBusinessDelete).toHaveBeenCalled();
    });
  });
});

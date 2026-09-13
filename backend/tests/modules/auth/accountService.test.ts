import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma.js";
import { enqueueEmailJob } from "../../../src/lib/cloudTasks.js";
import { getStripeClient } from "../../../src/lib/stripe.js";
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
  telnyxAiAdapter: { deleteAssistant: vi.fn() },
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
    await changeAccountPassword({
      userId: "user_123",
      businessId: "business_123",
      currentPassword: "Anterior123",
      newPassword: "NuevaClave123",
    });

    expect(mockedBcryptCompare).toHaveBeenCalledWith("Anterior123", "hash_anterior");
    expect(mockedBcryptHash).toHaveBeenCalledWith("NuevaClave123", 12);
    expect(mockedUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_123" },
      data: { password: "hash_nuevo" },
    });
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
});

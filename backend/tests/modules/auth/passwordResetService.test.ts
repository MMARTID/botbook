import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma.js";
import { getRedis } from "../../../src/lib/redis.js";
import { enqueueEmailJob } from "../../../src/lib/cloudTasks.js";
import {
  AccountActionError,
} from "../../../src/modules/auth/accountService.js";
import {
  PASSWORD_RESET_TTL_SECONDS,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../../../src/modules/auth/passwordResetService.js";

vi.mock("../../../src/lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const redisMock = { set: vi.fn(), getdel: vi.fn() };
vi.mock("../../../src/lib/redis.js", () => ({ getRedis: vi.fn() }));
vi.mock("../../../src/lib/cloudTasks.js", () => ({ enqueueEmailJob: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

const mockedUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockedUserUpdate = vi.mocked(prisma.user.update);
const mockedGetRedis = vi.mocked(getRedis);
const mockedEnqueueEmailJob = vi.mocked(enqueueEmailJob);
const mockedBcryptHash = vi.mocked(bcrypt.hash);

const user = {
  id: "user_123",
  email: "cliente@example.com",
  businessId: "business_123",
};

describe("passwordResetService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGetRedis.mockReturnValue(redisMock as any);
    redisMock.set.mockResolvedValue("OK");
    redisMock.getdel.mockResolvedValue(null);
    mockedUserFindUnique.mockResolvedValue(user as any);
    mockedUserUpdate.mockResolvedValue({} as any);
    mockedEnqueueEmailJob.mockResolvedValue(undefined);
    mockedBcryptHash.mockResolvedValue("hash_nuevo" as any);
    process.env.FRONTEND_URL = "https://app.alhabla.ai/";
  });

  describe("requestPasswordReset", () => {
    it("guarda solo el hash del token en Redis con caducidad y envía el enlace por correo", async () => {
      await requestPasswordReset("  Cliente@Example.com ");

      expect(mockedUserFindUnique).toHaveBeenCalledWith({
        where: { email: "cliente@example.com" },
        select: { id: true, email: true },
      });

      expect(redisMock.set).toHaveBeenCalledTimes(1);
      const [key, value, mode, ttl] = redisMock.set.mock.calls[0];
      expect(key).toMatch(/^auth:password-reset:[a-f0-9]{64}$/);
      expect(value).toBe("user_123");
      expect(mode).toBe("EX");
      expect(ttl).toBe(PASSWORD_RESET_TTL_SECONDS);

      expect(mockedEnqueueEmailJob).toHaveBeenCalledTimes(1);
      const job = mockedEnqueueEmailJob.mock.calls[0][0];
      expect(job.fromAlias).toBe("support");
      expect(job.toAddress).toBe("cliente@example.com");
      expect(job.subject).toContain("Restablece tu contraseña");

      // El enlace lleva el token en claro (el usuario lo necesita) y Redis
      // solo su hash — el token del correo nunca aparece tal cual en la clave.
      const match = job.html.match(/restablecer-contrasena\?token=([A-Za-z0-9_-]+)/);
      expect(match).not.toBeNull();
      expect(job.html).toContain("https://app.alhabla.ai/restablecer-contrasena?token=");
      expect(key).not.toContain(match![1]);
    });

    it("no revela si el email existe: sin usuario no guarda nada ni envía correo, y resuelve igual", async () => {
      mockedUserFindUnique.mockResolvedValue(null);

      await expect(requestPasswordReset("nadie@example.com")).resolves.toBeUndefined();

      expect(redisMock.set).not.toHaveBeenCalled();
      expect(mockedEnqueueEmailJob).not.toHaveBeenCalled();
    });

    it("si el correo no sale, lo dice con un 502 en vez de dejar al usuario esperando", async () => {
      mockedEnqueueEmailJob.mockRejectedValue(new Error("Zoho caído"));

      await expect(requestPasswordReset("cliente@example.com")).rejects.toMatchObject({
        statusCode: 502,
      });
    });
  });

  describe("resetPasswordWithToken", () => {
    it("consume el token una sola vez, guarda un hash fuerte y confirma por correo", async () => {
      redisMock.getdel.mockResolvedValue("user_123");

      const result = await resetPasswordWithToken({
        token: "token_de_prueba_suficientemente_largo",
        newPassword: "NuevaClave123",
      });

      expect(redisMock.getdel).toHaveBeenCalledTimes(1);
      expect(redisMock.getdel.mock.calls[0][0]).toMatch(/^auth:password-reset:[a-f0-9]{64}$/);
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
        })
      );
      expect(result).toEqual(user);
    });

    it("rechaza un token caducado o ya usado con un 400 y sin tocar la contraseña", async () => {
      redisMock.getdel.mockResolvedValue(null);

      const attempt = resetPasswordWithToken({
        token: "token_caducado_suficientemente_largo",
        newPassword: "NuevaClave123",
      });

      await expect(attempt).rejects.toBeInstanceOf(AccountActionError);
      await expect(attempt).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedUserUpdate).not.toHaveBeenCalled();
      expect(mockedEnqueueEmailJob).not.toHaveBeenCalled();
    });

    it("rechaza el token si la cuenta ya no existe", async () => {
      redisMock.getdel.mockResolvedValue("user_borrado");
      mockedUserFindUnique.mockResolvedValue(null);

      await expect(
        resetPasswordWithToken({
          token: "token_huerfano_suficientemente_largo",
          newPassword: "NuevaClave123",
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedUserUpdate).not.toHaveBeenCalled();
    });

    it("un fallo del correo de confirmación no deshace el cambio", async () => {
      redisMock.getdel.mockResolvedValue("user_123");
      mockedEnqueueEmailJob.mockRejectedValue(new Error("Zoho caído"));

      await expect(
        resetPasswordWithToken({
          token: "token_de_prueba_suficientemente_largo",
          newPassword: "NuevaClave123",
        })
      ).resolves.toEqual(user);
      expect(mockedUserUpdate).toHaveBeenCalledTimes(1);
    });
  });
});

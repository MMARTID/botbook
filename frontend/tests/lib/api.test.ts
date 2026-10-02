import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  api,
  changeAccountPassword,
  createBookingProfessional,
  deleteAccount,
  deleteBookingProfessional,
  deleteBookingService,
  getAccountOverview,
  getGoogleAuthUrl,
  updateBookingProfessional,
} from "@/lib/api";

describe("getGoogleAuthUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no manda acceptedTerms cuando no se indica, e intent cae en login", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    const url = await getGoogleAuthUrl();

    expect(url).toBe("https://accounts.google.com/oauth");
    expect(getSpy).toHaveBeenCalledWith("/auth/google", { params: { intent: "login" } });
  });

  it("manda acceptedTerms=true cuando se aceptaron los términos", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    await getGoogleAuthUrl(true, "register");

    expect(getSpy).toHaveBeenCalledWith("/auth/google", {
      params: { intent: "register", acceptedTerms: "true" },
    });
  });

  it("no manda el parámetro cuando acceptedTerms es false", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    await getGoogleAuthUrl(false);

    expect(getSpy).toHaveBeenCalledWith("/auth/google", { params: { intent: "login" } });
  });

  it("manda intent=register explícito", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ data: { url: "https://accounts.google.com/oauth" } });

    await getGoogleAuthUrl(undefined, "register");

    expect(getSpy).toHaveBeenCalledWith("/auth/google", { params: { intent: "register" } });
  });
});

describe("operaciones de ajustes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retira servicios y profesionales por sus rutas autenticadas", async () => {
    const deleteSpy = vi.spyOn(api, "delete").mockResolvedValue({ data: undefined });

    await deleteBookingService("service_123");
    await deleteBookingProfessional("professional_123");

    expect(deleteSpy).toHaveBeenNthCalledWith(1, "/booking-settings/services/service_123");
    expect(deleteSpy).toHaveBeenNthCalledWith(2, "/booking-settings/professionals/professional_123");
  });

  // Contrato de asignación por especialidad: el vínculo profesional↔servicio
  // viaja como `serviceLevels` (mapa completo, sin claves «normal»), nunca
  // como el `serviceIds` legado.
  it("actualiza un profesional mandando serviceLevels en el body del PATCH", async () => {
    const patchSpy = vi.spyOn(api, "patch").mockResolvedValue({
      data: {
        id: "professional_123",
        name: "Ana",
        active: true,
        serviceIds: ["corte"],
        serviceLevels: { corte: "especialista", mechas: "no_sugerir" },
        createdAt: "2026-09-17T00:00:00.000Z",
        updatedAt: "2026-09-17T00:00:00.000Z",
      },
    });

    const result = await updateBookingProfessional("professional_123", {
      name: "Ana",
      active: true,
      serviceLevels: { corte: "especialista", mechas: "no_sugerir" },
    });

    expect(patchSpy).toHaveBeenCalledWith("/booking-settings/professionals/professional_123", {
      name: "Ana",
      active: true,
      serviceLevels: { corte: "especialista", mechas: "no_sugerir" },
    });
    const [, body] = patchSpy.mock.calls[0];
    expect(body).not.toHaveProperty("serviceIds");
    expect(result.serviceLevels).toEqual({ corte: "especialista", mechas: "no_sugerir" });
  });

  it("crea un profesional sin obligar a mandar vínculos con servicios", async () => {
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        id: "professional_456",
        name: "Profesional 1",
        active: true,
        serviceIds: [],
        serviceLevels: {},
        createdAt: "2026-09-17T00:00:00.000Z",
        updatedAt: "2026-09-17T00:00:00.000Z",
      },
    });

    await createBookingProfessional({ name: "Profesional 1", active: true });
    await createBookingProfessional({
      name: "Luis",
      serviceLevels: { corte: "especialista" },
    });

    expect(postSpy).toHaveBeenNthCalledWith(1, "/booking-settings/professionals", {
      name: "Profesional 1",
      active: true,
    });
    expect(postSpy).toHaveBeenNthCalledWith(2, "/booking-settings/professionals", {
      name: "Luis",
      serviceLevels: { corte: "especialista" },
    });
  });

  it("usa las rutas de cuenta para consultar, cambiar contraseña y eliminar", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({
      data: { email: "cliente@example.com", passwordConfigured: true, googleConnected: false },
    });
    const postSpy = vi.spyOn(api, "post").mockResolvedValue({
      data: { passwordConfigured: true },
    });
    const deleteSpy = vi.spyOn(api, "delete").mockResolvedValue({ data: undefined });

    await getAccountOverview();
    await changeAccountPassword({ currentPassword: "Anterior123", newPassword: "Nueva1234" });
    await deleteAccount({
      currentPassword: "Nueva1234",
      confirmation: "ELIMINAR",
      forwardingCancelled: true,
    });

    expect(getSpy).toHaveBeenCalledWith("/auth/account");
    expect(postSpy).toHaveBeenCalledWith("/auth/change-password", {
      currentPassword: "Anterior123",
      newPassword: "Nueva1234",
    });
    expect(deleteSpy).toHaveBeenCalledWith("/auth/account", {
      data: {
        currentPassword: "Nueva1234",
        confirmation: "ELIMINAR",
        forwardingCancelled: true,
      },
    });
  });
});

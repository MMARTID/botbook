import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import GoogleCallbackPage from "@/app/auth/google/callback/page";
import { consumeGoogleSession } from "@/lib/api";

vi.mock("@/lib/api", () => ({ consumeGoogleSession: vi.fn() }));

const mockedConsumeGoogleSession = vi.mocked(consumeGoogleSession);

function mockLocation(search: string) {
  const original = window.location;
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, search, replace },
  });
  return { replace, restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }) };
}

describe("GoogleCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("con error=access_denied, muestra el mensaje específico y no llama a la API", async () => {
    const { restore } = mockLocation("?error=access_denied");

    render(<GoogleCallbackPage />);

    expect(await screen.findByText("Se canceló el acceso con Google.")).toBeInTheDocument();
    expect(mockedConsumeGoogleSession).not.toHaveBeenCalled();
    restore();
  });

  it("con un código de error desconocido, usa el mensaje genérico", async () => {
    const { restore } = mockLocation("?error=algo_raro");

    render(<GoogleCallbackPage />);

    expect(await screen.findByText("No se pudo completar el acceso con Google.")).toBeInTheDocument();
    restore();
  });

  it("muestra el estado de carga mientras se completa el acceso", () => {
    const { restore } = mockLocation("");
    mockedConsumeGoogleSession.mockReturnValue(new Promise(() => {}));

    render(<GoogleCallbackPage />);

    expect(screen.getByText("Completando el acceso")).toBeInTheDocument();
    restore();
  });

  it("sin plan pendiente, guarda el token y redirige a /register/business", async () => {
    const { replace, restore } = mockLocation("");
    mockedConsumeGoogleSession.mockResolvedValue("jwt_123");

    render(<GoogleCallbackPage />);

    await waitFor(() => expect(window.localStorage.getItem("alhabla_token")).toBe("jwt_123"));
    expect(replace).toHaveBeenCalledWith("/register/business");
    restore();
  });

  it("con un plan pendiente guardado, lo añade como query param al redirigir", async () => {
    window.localStorage.setItem("alhabla_pending_plan", "pro");
    const { replace, restore } = mockLocation("");
    mockedConsumeGoogleSession.mockResolvedValue("jwt_123");

    render(<GoogleCallbackPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/register/business?plan=pro"));
    // El plan pendiente se consume (se borra) al usarse.
    expect(window.localStorage.getItem("alhabla_pending_plan")).toBeNull();
    restore();
  });

  it("si la sesión de Google caducó, muestra el error y un enlace para volver a intentarlo", async () => {
    const { restore } = mockLocation("");
    mockedConsumeGoogleSession.mockRejectedValue(new Error("session expired"));

    render(<GoogleCallbackPage />);

    expect(await screen.findByText("La sesión de Google ha caducado. Vuelve a intentarlo.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
    restore();
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { getGoogleAuthUrl } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getGoogleAuthUrl: vi.fn() }));

const mockedGetGoogleAuthUrl = vi.mocked(getGoogleAuthUrl);

function mockLocationAssign() {
  const assign = vi.fn();
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, assign },
  });
  return {
    assign,
    restore: () =>
      Object.defineProperty(window, "location", { configurable: true, value: original }),
  };
}

describe("GoogleAuthButton", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Registro abierto desde 2026-09-21 (antes había un bloqueo «por
  // invitación» solo en producción): siempre pide la URL y navega.
  it("pide la URL de Google y navega", async () => {
    mockedGetGoogleAuthUrl.mockResolvedValue("https://accounts.google.com/o/oauth2/auth");
    const location = mockLocationAssign();
    const user = userEvent.setup();
    const onError = vi.fn();

    render(<GoogleAuthButton onError={onError} acceptedTerms />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    expect(mockedGetGoogleAuthUrl).toHaveBeenCalledWith(true);
    expect(location.assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/auth");
    expect(onError).toHaveBeenCalledWith("");
    expect(screen.queryByText(/social@alhabla\.ai/)).not.toBeInTheDocument();

    location.restore();
  });

  it("si no se puede obtener la URL, avisa y deja el botón usable", async () => {
    mockedGetGoogleAuthUrl.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    const onError = vi.fn();

    render(<GoogleAuthButton onError={onError} acceptedTerms />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    expect(onError).toHaveBeenLastCalledWith(
      "No se pudo iniciar sesión con Google. Inténtalo de nuevo."
    );
    expect(screen.getByRole("button", { name: /continuar con google/i })).toBeEnabled();
  });
});

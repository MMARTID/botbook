import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { getGoogleAuthUrl } from "@/lib/api";
import { isProductionBuild } from "@/lib/env";

vi.mock("@/lib/api", () => ({ getGoogleAuthUrl: vi.fn() }));
vi.mock("@/lib/env", () => ({ isProductionBuild: vi.fn() }));

const mockedGetGoogleAuthUrl = vi.mocked(getGoogleAuthUrl);
const mockedIsProductionBuild = vi.mocked(isProductionBuild);

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

  it("en producción no navega ni pide la URL de Google — muestra el aviso de 'en desarrollo'", async () => {
    mockedIsProductionBuild.mockReturnValue(true);
    const user = userEvent.setup();
    const onError = vi.fn();

    render(<GoogleAuthButton onError={onError} acceptedTerms />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    expect(mockedGetGoogleAuthUrl).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByText(/social@alhabla\.ai/)).toBeInTheDocument();
  });

  // Fuera de producción (npm run dev, puerto 3001) navega de verdad a
  // Google, para poder probar el flujo completo sin el aviso de "en
  // desarrollo" de por medio — decisión explícita del usuario 2026-09-14.
  it("fuera de producción pide la URL de Google y navega", async () => {
    mockedIsProductionBuild.mockReturnValue(false);
    mockedGetGoogleAuthUrl.mockResolvedValue("https://accounts.google.com/o/oauth2/auth");
    const location = mockLocationAssign();
    const user = userEvent.setup();
    const onError = vi.fn();

    render(<GoogleAuthButton onError={onError} acceptedTerms />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    expect(mockedGetGoogleAuthUrl).toHaveBeenCalledWith(true);
    expect(location.assign).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/auth");
    expect(screen.queryByText(/social@alhabla\.ai/)).not.toBeInTheDocument();

    location.restore();
  });
});

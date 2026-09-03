import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { getGoogleAuthUrl } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getGoogleAuthUrl: vi.fn() }));

const mockedGetGoogleAuthUrl = vi.mocked(getGoogleAuthUrl);

function mockLocationAssign() {
  const assign = vi.fn();
  const original = window.location;
  // jsdom no implementa navigation real; sustituimos location para poder
  // comprobar a dónde se redirige sin que salte "Not implemented: navigation".
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, assign },
  });
  return { assign, restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }) };
}

describe("GoogleAuthButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige a la URL de Google al hacer click", async () => {
    const { assign, restore } = mockLocationAssign();
    mockedGetGoogleAuthUrl.mockResolvedValue("https://accounts.google.com/oauth?x=1");
    const user = userEvent.setup();

    render(<GoogleAuthButton onError={vi.fn()} acceptedTerms />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://accounts.google.com/oauth?x=1"));
    expect(mockedGetGoogleAuthUrl).toHaveBeenCalledWith(true);
    restore();
  });

  it("llama a beforeStart antes de redirigir", async () => {
    const { restore } = mockLocationAssign();
    mockedGetGoogleAuthUrl.mockResolvedValue("https://accounts.google.com/oauth");
    const beforeStart = vi.fn();
    const user = userEvent.setup();

    render(<GoogleAuthButton onError={vi.fn()} beforeStart={beforeStart} />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    await waitFor(() => expect(beforeStart).toHaveBeenCalled());
    restore();
  });

  it("muestra un error si falla la petición de la URL de Google", async () => {
    mockedGetGoogleAuthUrl.mockRejectedValue(new Error("network error"));
    const onError = vi.fn();
    const user = userEvent.setup();

    render(<GoogleAuthButton onError={onError} />);
    await user.click(screen.getByRole("button", { name: /continuar con google/i }));

    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith("No se pudo iniciar sesión con Google. Inténtalo de nuevo.")
    );
  });

  it("está deshabilitado cuando disabled=true (términos sin aceptar)", () => {
    render(<GoogleAuthButton onError={vi.fn()} disabled />);

    expect(screen.getByRole("button", { name: /continuar con google/i })).toBeDisabled();
  });

  it("no está deshabilitado por defecto", () => {
    render(<GoogleAuthButton onError={vi.fn()} />);

    expect(screen.getByRole("button", { name: /continuar con google/i })).toBeEnabled();
  });
});

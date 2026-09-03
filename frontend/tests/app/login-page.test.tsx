import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { api } from "@/lib/api";
import { GoogleAuthButton } from "@/components/google-auth-button";

vi.mock("@/components/google-auth-button", () => ({
  GoogleAuthButton: vi.fn(() => <button type="button">Continuar con Google</button>),
}));

function mockLocationHref() {
  const original = window.location;
  let hrefValue = "http://localhost/login";
  const location = {
    ...original,
    get href() {
      return hrefValue;
    },
    set href(value: string) {
      hrefValue = value;
    },
  };
  Object.defineProperty(window, "location", { configurable: true, value: location });
  return {
    getHref: () => hrefValue,
    restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }),
  };
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    mockLocationHref();
  });

  it("pasa acceptedTerms al botón de Google (aviso pasivo, sin checkbox)", () => {
    render(<LoginPage />);

    expect(GoogleAuthButton).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedTerms: true }),
      expect.anything()
    );
    expect(
      screen.getByText(/si es tu primera vez, al continuar aceptas los/i)
    ).toBeInTheDocument();
  });

  it("inicia sesión y redirige al panel", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { token: "jwt_123" } });
    const user = userEvent.setup();
    const location = mockLocationHref();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tucorreo@dominio.com"), "ana@example.com");
    await user.type(screen.getByPlaceholderText("Mínimo 8 caracteres"), "password123");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    await waitFor(() => expect(window.localStorage.getItem("alhabla_token")).toBe("jwt_123"));
    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      email: "ana@example.com",
      password: "password123",
    });
    expect(location.getHref()).toBe("/");
  });

  it("muestra un error genérico si las credenciales son incorrectas", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("Unauthorized"));
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tucorreo@dominio.com"), "ana@example.com");
    await user.type(screen.getByPlaceholderText("Mínimo 8 caracteres"), "wrong");
    await user.click(screen.getByRole("button", { name: /^entrar$/i }));

    expect(await screen.findByText("Credenciales incorrectas o error de conexión.")).toBeInTheDocument();
  });
});

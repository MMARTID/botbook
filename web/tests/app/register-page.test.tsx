import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegisterPage from "@/app/register/page";
import { api } from "@/lib/api";

vi.mock("@/components/google-auth-button", () => ({
  GoogleAuthButton: ({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>
      Continuar con Google
    </button>
  ),
}));

function mockLocation(search = "") {
  const original = window.location;
  let hrefValue = `http://localhost/register${search}`;
  const location = {
    ...original,
    search,
    get href() {
      return hrefValue;
    },
    set href(value: string) {
      hrefValue = value;
    },
    assign: (value: string) => {
      hrefValue = value;
    },
  };
  Object.defineProperty(window, "location", { configurable: true, value: location });
  return {
    getHref: () => hrefValue,
    restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }),
  };
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("tucorreo@dominio.com"), "ana@example.com");
  await user.type(screen.getByPlaceholderText("Mínimo 8 caracteres"), "password123");
  await user.click(screen.getByRole("radio", { name: "Sí" }));
}

describe("RegisterPage", () => {
  let location: ReturnType<typeof mockLocation>;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    location = mockLocation();
  });

  it("el botón de registro y el de Google empiezan deshabilitados hasta aceptar los términos", () => {
    render(<RegisterPage />);

    expect(screen.getByRole("button", { name: /registrarse/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /continuar con google/i })).toBeDisabled();
  });

  it("habilita ambos botones al marcar la casilla de términos", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("button", { name: /registrarse/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /continuar con google/i })).toBeEnabled();
  });

  it("no llama a la API si se envía el formulario sin aceptar los términos", async () => {
    const postSpy = vi.spyOn(api, "post");
    render(<RegisterPage />);
    const user = userEvent.setup();
    await fillRequiredFields(user);

    // El botón está disabled (probado arriba); disparamos el submit nativo
    // del formulario para comprobar que handleSubmit también se protege por
    // su cuenta, no solo vía el atributo disabled del botón.
    fireEvent.submit(screen.getByRole("button", { name: /registrarse/i }).closest("form")!);

    expect(
      await screen.findByText("Debes aceptar los Términos y Condiciones y la Política de privacidad.")
    ).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("registra la cuenta y salta a la app con el pase, el plan y el sector en la query; el token nunca va en la URL", async () => {
    location.restore();
    location = mockLocation("?plan=pro&niche=barberia");
    vi.spyOn(api, "post").mockResolvedValue({ data: { token: "jwt_123", pase: "a".repeat(64) } });
    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /registrarse/i }));

    await waitFor(() => expect(location.getHref()).toContain("/auth/entrar?"));
    expect(api.post).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({
        email: "ana@example.com",
        password: "password123",
        isEuropeanUnion: true,
        acceptedTerms: true,
        businessType: "barberia",
      })
    );
    const destino = new URL(location.getHref());
    expect(destino.origin).toBe("http://localhost:3001");
    expect(destino.pathname).toBe("/auth/entrar");
    expect(destino.searchParams.get("pase")).toBe("a".repeat(64));
    expect(destino.searchParams.get("plan")).toBe("pro");
    expect(destino.searchParams.get("sector")).toBe("barberia");
    expect(location.getHref()).not.toContain("jwt_123");
    expect(window.localStorage.getItem("alhabla_token")).toBeNull();
  });

  it("sin pase en la respuesta (backend anterior o Redis caído) explica que entre con su contraseña", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { token: "jwt_123" } });
    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /registrarse/i }));

    expect(await screen.findByText(/Tu cuenta está creada/)).toBeInTheDocument();
    expect(location.getHref()).toBe("http://localhost/register");
  });

  it("muestra el mensaje de error cuando el backend devuelve un string", async () => {
    vi.spyOn(api, "post").mockRejectedValue({ response: { data: { error: "El usuario ya existe" } } });
    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /registrarse/i }));

    expect(await screen.findByText("El usuario ya existe")).toBeInTheDocument();
  });

  it("muestra el primer mensaje sin reventar cuando el backend devuelve un array de errores de Zod", async () => {
    vi.spyOn(api, "post").mockRejectedValue({
      response: { data: { error: [{ code: "too_small", message: "La contraseña es demasiado corta", path: ["password"] }] } },
    });
    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /registrarse/i }));

    expect(await screen.findByText("La contraseña es demasiado corta")).toBeInTheDocument();
  });

  it("muestra un mensaje genérico si el error no tiene la forma esperada", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<RegisterPage />);

    await fillRequiredFields(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /registrarse/i }));

    expect(await screen.findByText("Error al registrar la cuenta.")).toBeInTheDocument();
  });
});

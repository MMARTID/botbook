import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RestablecerContrasenaPage from "@/app/restablecer-contrasena/page";
import { api } from "@/lib/api";

const searchParams = { token: null as string | null };

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "token" ? searchParams.token : null) }),
}));

function mockLocationHref() {
  const original = window.location;
  let hrefValue = "http://localhost/restablecer-contrasena";
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
  return { getHref: () => hrefValue };
}

describe("RestablecerContrasenaPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    searchParams.token = "token_de_prueba_suficientemente_largo";
  });

  it("sin token en la URL ofrece pedir un enlace nuevo en vez de un formulario inútil", () => {
    searchParams.token = null;
    render(<RestablecerContrasenaPage />);

    expect(screen.getByRole("heading", { name: "Este enlace ya no sirve" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" })).toHaveAttribute("href", "/recuperar-contrasena");
    expect(screen.queryByLabelText("Contraseña nueva")).not.toBeInTheDocument();
  });

  it("guarda la contraseña, inicia sesión con el token devuelto y entra al panel", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { message: "ok", token: "jwt_nuevo" } });
    const location = mockLocationHref();
    const user = userEvent.setup();
    render(<RestablecerContrasenaPage />);

    await user.type(screen.getByLabelText("Contraseña nueva"), "NuevaClave123");
    await user.click(screen.getByRole("button", { name: "Guardar y entrar" }));

    expect(api.post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "token_de_prueba_suficientemente_largo",
      password: "NuevaClave123",
    });
    expect(await screen.findByRole("button", { name: "Guardar y entrar" })).toBeEnabled();
    expect(window.localStorage.getItem("alhabla_token")).toBe("jwt_nuevo");
    expect(location.getHref()).toBe("/");
  });

  it("si el enlace caducó, cambia al estado de pedir uno nuevo", async () => {
    vi.spyOn(api, "post").mockRejectedValue({
      response: { status: 400, data: { error: "El enlace no es válido o ha caducado. Pide uno nuevo." } },
    });
    const user = userEvent.setup();
    render(<RestablecerContrasenaPage />);

    await user.type(screen.getByLabelText("Contraseña nueva"), "NuevaClave123");
    await user.click(screen.getByRole("button", { name: "Guardar y entrar" }));

    expect(await screen.findByRole("heading", { name: "Este enlace ya no sirve" })).toBeInTheDocument();
  });

  it("muestra el motivo de validación que devuelve el backend", async () => {
    vi.spyOn(api, "post").mockRejectedValue({
      response: {
        status: 400,
        data: { error: "Revisa los datos introducidos", errors: [{ message: "Añade al menos un número" }] },
      },
    });
    const user = userEvent.setup();
    render(<RestablecerContrasenaPage />);

    await user.type(screen.getByLabelText("Contraseña nueva"), "soloLetras");
    await user.click(screen.getByRole("button", { name: "Guardar y entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Añade al menos un número");
  });
});

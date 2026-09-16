import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecuperarContrasenaPage from "@/app/recuperar-contrasena/page";
import { api } from "@/lib/api";

describe("RecuperarContrasenaPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pide el enlace y confirma sin revelar si la cuenta existe", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: { message: "ok" } });
    const user = userEvent.setup();
    render(<RecuperarContrasenaPage />);

    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviarme el enlace" }));

    expect(api.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "ana@example.com" });
    expect(await screen.findByRole("status")).toHaveTextContent(/si existe una cuenta con ana@example\.com/i);
    expect(screen.queryByRole("button", { name: "Enviarme el enlace" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("explica el límite de intentos cuando el backend responde 429", async () => {
    vi.spyOn(api, "post").mockRejectedValue({ response: { status: 429 } });
    const user = userEvent.setup();
    render(<RecuperarContrasenaPage />);

    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviarme el enlace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Has pedido varios enlaces seguidos. Espera un minuto e inténtalo de nuevo.");
  });

  it("distingue un fallo de conexión de un error del servidor", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("Network Error"));
    const user = userEvent.setup();
    render(<RecuperarContrasenaPage />);

    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviarme el enlace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.");
  });
});

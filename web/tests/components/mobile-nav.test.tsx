import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MobileNav } from "@/components/mobile-nav";

describe("MobileNav", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("el menú empieza cerrado", () => {
    render(<MobileNav />);

    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });

  it("se abre al hacer click en el botón de menú y bloquea el scroll", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    expect(screen.getByRole("navigation", { name: "Navegación móvil" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("se cierra con Escape y devuelve el foco al botón", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);
    await user.click(screen.getByRole("button", { name: /menú/i }));

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("se cierra al hacer click fuera del menú", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MobileNav />
        <button type="button">fuera</button>
      </div>
    );
    await user.click(screen.getByRole("button", { name: /menú/i }));
    expect(screen.getByRole("navigation", { name: "Navegación móvil" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fuera" }));

    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
  });

  it("se cierra al elegir una opción del menú", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);
    await user.click(screen.getByRole("button", { name: /menú/i }));

    await user.click(screen.getByRole("link", { name: "Iniciar sesión" }));

    expect(screen.queryByRole("navigation", { name: "Navegación móvil" })).not.toBeInTheDocument();
  });

  it("el enlace de planes incluye el nicho cuando se indica", () => {
    render(<MobileNav niche="barberia" />);

    expect(screen.getByRole("link", { name: /Empezar/ })).toHaveAttribute("href", "/planes?niche=barberia");
  });

  it("sin nicho, el enlace de planes no lleva query string", () => {
    render(<MobileNav />);

    expect(screen.getByRole("link", { name: /Empezar/ })).toHaveAttribute("href", "/planes");
  });

  it("en la portada el menú ofrece las mismas secciones que el escritorio, precios incluidos", async () => {
    const user = userEvent.setup();
    render(<MobileNav variant="main" />);
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));

    const menu = screen.getByRole("navigation", { name: "Navegación móvil" });
    const labels = within(menu)
      .getAllByRole("link")
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual(["Tu negocio", "Cómo funciona", "Precios", "Preguntas", "Iniciar sesión", "Empezar ahora"]);
    expect(within(menu).getByRole("link", { name: "Precios" })).toHaveAttribute("href", "#precios");
  });
});

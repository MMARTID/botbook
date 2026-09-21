import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ElegirPlanPage from "@/app/elegir-plan/page";
import { destinoDeEleccion } from "@/lib/eleccion-de-plan";

const params = { value: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.value,
}));

function mockLocation() {
  const original = window.location;
  const replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, replace },
  });
  return {
    replace,
    restore: () =>
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      }),
  };
}

describe("destinoDeEleccion", () => {
  it("con sesión va al checkout del plan", () => {
    expect(
      destinoDeEleccion(new URLSearchParams("plan=pro&niche=barberia"), true)
    ).toBe("/checkout?plan=pro");
  });

  it("con sesión y sin plan válido va a Ajustes, nunca a un checkout roto", () => {
    expect(destinoDeEleccion(new URLSearchParams("plan=gratis"), true)).toBe(
      "/ajustes"
    );
  });

  it("sin sesión va al registro de la web con plan y sector normalizado", () => {
    expect(
      destinoDeEleccion(new URLSearchParams("plan=pro&niche=barberia"), false)
    ).toBe("http://localhost:3002/register?plan=pro&niche=barberia");
  });

  it("sin sesión descarta un plan inválido y normaliza un sector desconocido", () => {
    expect(
      destinoDeEleccion(
        new URLSearchParams("plan=%3Cscript%3E&niche=//evil.example"),
        false
      )
    ).toBe("http://localhost:3002/register?niche=other");
  });
});

describe("ElegirPlanPage (/elegir-plan, llegada desde alhabla.ai/planes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("con token guardado salta al checkout sin pedir login", async () => {
    window.localStorage.setItem("alhabla_token", "jwt_1");
    params.value = new URLSearchParams("?plan=pro");
    const { replace, restore } = mockLocation();

    render(<ElegirPlanPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparando tu plan");
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/checkout?plan=pro")
    );

    restore();
  });

  it("sin token vuelve al registro de la web con el plan", async () => {
    params.value = new URLSearchParams("?plan=inicio&niche=peluqueria");
    const { replace, restore } = mockLocation();

    render(<ElegirPlanPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "http://localhost:3002/register?plan=inicio&niche=peluqueria"
      )
    );

    restore();
  });
});

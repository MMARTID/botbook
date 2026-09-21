import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EntrarPage from "@/app/auth/entrar/page";
import { redeemPass } from "@/lib/api";

vi.mock("@/lib/api", () => ({ redeemPass: vi.fn() }));

const params = { value: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.value,
}));

const mockedRedeem = vi.mocked(redeemPass);
const PASE = "b".repeat(64);

function mockLocation() {
  const original = window.location;
  const replace = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...original, replace } });
  return { replace, restore: () => Object.defineProperty(window, "location", { configurable: true, value: original }) };
}

describe("EntrarPage (/auth/entrar, llegada desde la web con el pase)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("canjea el pase, guarda el token, el plan y el sector donde /bienvenida los espera, y sigue con el plan en la query", async () => {
    params.value = new URLSearchParams(`?pase=${PASE}&plan=pro&sector=barberia`);
    mockedRedeem.mockResolvedValue("jwt_9");
    const { replace, restore } = mockLocation();

    render(<EntrarPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Abriendo tu cuenta");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/bienvenida?plan=pro"));
    expect(mockedRedeem).toHaveBeenCalledWith(PASE);
    expect(window.localStorage.getItem("alhabla_token")).toBe("jwt_9");
    expect(window.localStorage.getItem("alhabla_pending_plan")).toBe("pro");
    expect(window.localStorage.getItem("alhabla_registration_niche")).toBe("barberia");
    restore();
  });

  it("sin plan ni sector va a /bienvenida a secas y no guarda claves vacías", async () => {
    params.value = new URLSearchParams(`?pase=${PASE}`);
    mockedRedeem.mockResolvedValue("jwt_9");
    const { replace, restore } = mockLocation();

    render(<EntrarPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/bienvenida"));
    expect(window.localStorage.getItem("alhabla_pending_plan")).toBeNull();
    expect(window.localStorage.getItem("alhabla_registration_niche")).toBeNull();
    restore();
  });

  it("un pase caducado o ya usado explica que entre con su contraseña, con enlaces a /login y al registro de la web", async () => {
    params.value = new URLSearchParams(`?pase=${PASE}`);
    mockedRedeem.mockRejectedValue(new Error("401"));
    const { replace, restore } = mockLocation();

    render(<EntrarPage />);

    expect(await screen.findByText(/El pase ha caducado o ya se ha usado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Volver al registro" })).toHaveAttribute("href", "http://localhost:3002/register");
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("alhabla_token")).toBeNull();
    restore();
  });

  it("sin pase en la URL no llama a la API", async () => {
    params.value = new URLSearchParams("");
    render(<EntrarPage />);
    expect(await screen.findByText(/Falta el pase/)).toBeInTheDocument();
    expect(mockedRedeem).not.toHaveBeenCalled();
  });
});

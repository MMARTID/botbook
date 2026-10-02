import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoDeFundador, PrecioDePlan } from "@/components/precio-de-plan";
import { getCupoDeFundador } from "@/lib/api";
import { reiniciarCupoDeFundador } from "@/lib/cupo-fundador";
import { plans } from "@/lib/plans";

vi.mock("@/lib/api", () => ({ getCupoDeFundador: vi.fn() }));
const mockedCupo = vi.mocked(getCupoDeFundador);
const inicio = plans[0];

describe("PrecioDePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reiniciarCupoDeFundador();
  });

  it("con plazas tacha el precio vigente y enseña el de fundador", async () => {
    mockedCupo.mockResolvedValue({ total: 15, restantes: 14, disponible: true });
    render(
      <>
        <AvisoDeFundador />
        <PrecioDePlan plan={inicio} />
      </>
    );

    expect(await screen.findByText("Precio de fundador", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/79€/, { selector: "s" })).toBeInTheDocument();
    expect(screen.getByText(/69€/)).toBeInTheDocument();
    expect(screen.getByText(/quedan 14 plazas/)).toBeInTheDocument();
    expect(mockedCupo).toHaveBeenCalledTimes(1);
  });

  it("con la última plaza lo dice en singular", async () => {
    mockedCupo.mockResolvedValue({ total: 15, restantes: 1, disponible: true });
    render(<AvisoDeFundador />);
    expect(await screen.findByText(/queda 1 plaza\./)).toBeInTheDocument();
  });

  it("agotado vuelve solo al precio vigente y no anuncia nada", async () => {
    mockedCupo.mockResolvedValue({ total: 15, restantes: 0, disponible: false });
    const { container } = render(
      <>
        <AvisoDeFundador />
        <PrecioDePlan plan={inicio} />
      </>
    );

    await vi.waitFor(() => expect(mockedCupo).toHaveBeenCalled());
    expect(screen.getByText("79€")).toBeInTheDocument();
    expect(container.querySelector("s")).toBeNull();
    expect(screen.queryByText(/fundador/)).not.toBeInTheDocument();
  });

  it("si la consulta falla, mejor sin descuento que con uno que quizá ya no existe", async () => {
    mockedCupo.mockRejectedValue(new Error("caída"));
    render(<PrecioDePlan plan={inicio} />);

    await vi.waitFor(() => expect(mockedCupo).toHaveBeenCalled());
    expect(screen.getByText("79€")).toBeInTheDocument();
    expect(screen.queryByText(/fundador/)).not.toBeInTheDocument();
  });
});

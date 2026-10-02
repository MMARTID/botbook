import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BarraLateral } from "@/components/escritorio/barra-lateral";
import { useMinutesWarning } from "@/hooks/use-aviso-de-minutos";
import { useEstadoDelServicio } from "@/components/movil/estado-del-servicio";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/components/providers", () => ({
  useBusiness: () => ({ business: { id: "biz_1", name: "Peluquería Aurora", timezone: "Europe/Madrid" } }),
}));
vi.mock("@/hooks/use-es-movil", () => ({ useEsMovil: () => false }));
vi.mock("@/hooks/use-aviso-de-minutos", () => ({ useMinutesWarning: vi.fn() }));
vi.mock("@/components/movil/estado-del-servicio", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/movil/estado-del-servicio")>();
  return {
    ...original,
    useEstadoDelServicio: vi.fn(),
    ContenidoDelEstado: () => <p>Detalle del estado</p>,
  };
});

const estado = (avisos: number, rojo = false) =>
  ({ cargando: false, avisos, rojo, sinComprobar: false }) as unknown as ReturnType<typeof useEstadoDelServicio>;

function pintar(plegada: boolean, extra: Partial<React.ComponentProps<typeof BarraLateral>> = {}) {
  const props = { pathname: "/llamadas", plegada, onAlternar: vi.fn(), onBuscar: vi.fn(), porDevolver: 0, ...extra };
  render(<BarraLateral {...props} />);
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useEstadoDelServicio).mockReturnValue(estado(0));
  vi.mocked(useMinutesWarning).mockReturnValue(null);
});

describe("BarraLateral", () => {
  it("desplegada: grupos, la pantalla actual marcada, recados por devolver y el negocio", () => {
    pintar(false, { porDevolver: 2 });

    expect(screen.getByText("Peluquería Aurora")).toBeInTheDocument();
    expect(screen.getByText("Operación")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Llamadas/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("2 por devolver")).toHaveTextContent("2");
    expect(screen.getByText("Todo en marcha")).toBeInTheDocument();
  });

  it("plegada: solo iconos con su nombre accesible y el botón para desplegarla", async () => {
    const user = userEvent.setup();
    const { onAlternar } = pintar(true);

    expect(screen.queryByText("Operación")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
    await user.click(screen.getByRole("button", { name: "Desplegar la barra lateral" }));
    expect(onAlternar).toHaveBeenCalled();
  });

  it("el chip de estado abre el detalle del servicio y el buscador se abre desde arriba", async () => {
    vi.mocked(useEstadoDelServicio).mockReturnValue(estado(2, true));
    const user = userEvent.setup();
    const { onBuscar } = pintar(false);

    await user.click(screen.getByRole("button", { name: "Estado del servicio: 2 avisos" }));
    expect(screen.getByRole("dialog", { name: "Estado del servicio" })).toHaveTextContent("Detalle del estado");

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: "Buscar (⌘K)" }));
    expect(onBuscar).toHaveBeenCalled();
  });

  it("avisa de los minutos que quedan y lleva a la facturación", () => {
    vi.mocked(useMinutesWarning).mockReturnValue({ exhausted: false, remainingPct: 18, extraPrice: "0,15 €" } as never);
    pintar(false);

    expect(screen.getByRole("link", { name: /Te queda un 18% de tus minutos/ })).toHaveAttribute("href", "/ajustes/facturacion");
  });
});

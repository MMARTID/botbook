import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BotonDeBuscar, BuscadorMovil, useAlPedirBuscador } from "@/components/movil/buscador-movil";
import { buscarEnElNegocio, getPhoneNumberInfo } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ buscarEnElNegocio: vi.fn(), getPhoneNumberInfo: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPhoneNumberInfo).mockResolvedValue({ phoneNumber: null } as never);
});

function Escucha({ onAbrir }: { onAbrir: () => void }) {
  useAlPedirBuscador(onAbrir);
  return <BotonDeBuscar />;
}

describe("BuscadorMovil", () => {
  it("la lupa de las cabeceras pide abrir el buscador", async () => {
    const onAbrir = vi.fn();
    render(<Escucha onAbrir={onAbrir} />);
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onAbrir).toHaveBeenCalled();
  });

  it("busca citas y llamadas y abre la llamada en su pantalla", async () => {
    vi.mocked(buscarEnElNegocio).mockResolvedValue({
      citas: [],
      llamadas: [
        {
          id: "call_9",
          startedAt: "2026-10-01T09:00:00Z",
          fromNumber: "+34611222333",
          canal: "voz",
          durationSecs: 70,
          resumen: "Pregunta por la keratina.",
          conCita: false,
        },
      ],
    });
    const onCerrar = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <BuscadorMovil abierto onCerrar={onCerrar} timeZone="Europe/Madrid" avisar={vi.fn()} />
      </QueryClientProvider>
    );

    const hoja = await screen.findByRole("dialog", { name: "Buscar" });
    await userEvent.type(within(hoja).getByRole("searchbox"), "keratina");
    await userEvent.click(await within(hoja).findByRole("button", { name: /611 22 23 33/ }));

    expect(buscarEnElNegocio).toHaveBeenCalledWith("keratina");
    expect(onCerrar).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/llamadas?llamada=call_9");
  });
});

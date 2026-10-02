import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Buscador, useAtajosDelEscritorio } from "@/components/escritorio/buscador";
import { buscarEnElNegocio, getPhoneNumberInfo } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ buscarEnElNegocio: vi.fn(), getPhoneNumberInfo: vi.fn() }));

const mockedBuscar = vi.mocked(buscarEnElNegocio);
const mockedTelefono = vi.mocked(getPhoneNumberInfo);

function abrir(onCerrar = vi.fn(), avisar = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Buscador abierto onCerrar={onCerrar} timeZone="Europe/Madrid" avisar={avisar} />
    </QueryClientProvider>
  );
  return { onCerrar, avisar };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedTelefono.mockResolvedValue({ phoneNumber: "+34910004127" } as never);
  mockedBuscar.mockResolvedValue({ citas: [], llamadas: [] });
});

describe("Buscador", () => {
  it("encuentra pantallas por nombre o sinónimo, sin importar las tildes, y salta con Enter", async () => {
    const user = userEvent.setup();
    const { onCerrar } = abrir();

    await user.type(screen.getByRole("combobox"), "facturacion");
    expect(screen.getByRole("option", { name: /Facturación/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Agenda/ })).not.toBeInTheDocument();

    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "recados");
    await user.keyboard("{Enter}");
    expect(onCerrar).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/llamadas");
  });

  it("busca citas y llamadas en el negocio y abre la cita en su día de la agenda", async () => {
    mockedBuscar.mockResolvedValue({
      citas: [
        {
          id: "bk_1",
          programedAt: "2026-10-09T15:00:00Z",
          durationMinutes: 45,
          clientName: "Marta Ruiz",
          clientPhone: "+34611222333",
          servicios: ["Corte"],
          profesional: "Lucía",
        },
      ],
      llamadas: [
        {
          id: "call_1",
          startedAt: "2026-10-01T09:00:00Z",
          fromNumber: "+34611222333",
          canal: "voz",
          durationSecs: 80,
          resumen: "Reserva un corte.",
          conCita: true,
        },
      ],
    });
    const user = userEvent.setup();
    abrir();

    await user.type(screen.getByRole("combobox"), "marta");
    const cita = await screen.findByRole("option", { name: /Corte · Marta Ruiz/ });
    expect(screen.getByRole("option", { name: /611 22 23 33/ })).toBeInTheDocument();
    expect(mockedBuscar).toHaveBeenCalledWith("marta");

    await user.click(cita);
    expect(push).toHaveBeenCalledWith("/agenda?dia=2026-10-09&cita=bk_1");
  });

  it("deja preguntarle al gestor lo escrito y moverse con las flechas", async () => {
    const user = userEvent.setup();
    abrir();

    await user.type(screen.getByRole("combobox"), "qué tengo mañana");
    const opciones = await screen.findAllByRole("option");
    expect(opciones.at(-1)).toHaveTextContent("Preguntar al gestor: «qué tengo mañana»");

    await user.keyboard("{ArrowDown}".repeat(opciones.length));
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(`/asistente?mensaje=${encodeURIComponent("qué tengo mañana")}`);
  });

  it("copia el número de Alhabla", async () => {
    const user = userEvent.setup();
    // userEvent trae su propio portapapeles: se espía después de montarlo.
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const { avisar } = abrir();

    await user.type(screen.getByRole("combobox"), "copiar");
    await user.click(await screen.findByRole("option", { name: /Copiar el número de Alhabla/ }));

    expect(writeText).toHaveBeenCalledWith("910 00 41 27");
    await vi.waitFor(() => expect(avisar).toHaveBeenCalledWith("Copiado: 910 00 41 27"));
  });
});

function ConAtajos({ onBuscar }: { onBuscar: () => void }) {
  useAtajosDelEscritorio({ activo: true, onBuscar });
  return <input aria-label="campo" />;
}

describe("useAtajosDelEscritorio", () => {
  it("⌘K abre el buscador y «G» + letra salta a una pantalla", () => {
    const onBuscar = vi.fn();
    render(<ConAtajos onBuscar={onBuscar} />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(onBuscar).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "a" });
    expect(push).toHaveBeenCalledWith("/agenda");
  });

  it("no hace nada mientras se escribe en un campo", () => {
    render(<ConAtajos onBuscar={vi.fn()} />);
    const campo = screen.getByLabelText("campo");

    fireEvent.keyDown(campo, { key: "g" });
    fireEvent.keyDown(campo, { key: "l" });
    expect(push).not.toHaveBeenCalled();
  });
});

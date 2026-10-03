import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComportamientoMovil } from "@/components/movil/agente/comportamiento-movil";
import { getBillingSummary, updateMyBusiness } from "@/lib/api";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-settings";
import type { AgentSettings, Business } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getBillingSummary: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

function renderizar(agentSettings: Partial<AgentSettings> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const business = { id: "biz_1", agentSettings: { ...DEFAULT_AGENT_SETTINGS, ...agentSettings } } as Business;
  render(
    <QueryClientProvider client={queryClient}>
      <ComportamientoMovil business={business} />
    </QueryClientProvider>
  );
}

const idioma = (nombre: string | RegExp) => screen.getByRole("checkbox", { name: nombre });
// El aviso de idiomas, no el flotante de «guardado», que también es un status.
const avisoDeIdiomas = () =>
  within(screen.getByRole("group", { name: "Idioma y voz" })).getByRole("status");
const principal = (nombre: string) =>
  within(screen.getByRole("radiogroup", { name: "Idioma principal" })).getByRole("radio", { name: nombre });

describe("ComportamientoMovil — idioma y voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["voz_idioma"] } as never);
  });

  it("activar el catalán lo hace principal y avisa de que la voz cambia", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(await screen.findByRole("checkbox", { name: "Catalán" }));

    expect(principal("Catalán")).toHaveAttribute("aria-checked", "true");
    expect(principal("Español")).toBeDisabled();
    expect(screen.getByText("Saluda en catalán y sigue en el idioma de quien llama.")).toBeInTheDocument();
    expect(avisoDeIdiomas()).toHaveTextContent(/atiende con otra voz/);
  });

  it("quitar el idioma del saludo vuelve a español y lo dice", async () => {
    const user = userEvent.setup();
    renderizar({ languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" });

    await user.click(await screen.findByRole("checkbox", { name: "Catalán" }));

    expect(principal("Español")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Has quitado el catalán: ahora saluda en español.")).toBeInTheDocument();
    expect(avisoDeIdiomas()).toBeEmptyDOMElement();
  });

  it("con inglés como principal saluda en inglés y guarda lo elegido", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar();

    await user.click(await screen.findByRole("checkbox", { name: "Inglés" }));
    await user.click(principal("Inglés"));

    expect(screen.getByText("Saluda en inglés y sigue en el idioma de quien llama.")).toBeInTheDocument();
    expect(idioma(/^Español/)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" }),
    });
  });
});

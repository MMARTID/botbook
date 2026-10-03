import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComportamientoMovil } from "@/components/movil/agente/comportamiento-movil";
import {
  getBillingSummary,
  getCatalogoDeIdiomas,
  previsualizarIdiomas,
  updateMyBusiness,
} from "@/lib/api";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-settings";
import type { AgentSettings, Business } from "@/lib/types";
import { CATALOGO_DE_IDIOMAS } from "../../fixtures/catalogo-de-idiomas";

vi.mock("@/lib/api", () => ({
  getBillingSummary: vi.fn(),
  getCatalogoDeIdiomas: vi.fn(),
  previsualizarIdiomas: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const AVISO_DE_VOZ = "Con el catalán como idioma principal atiende con otra voz.";

function renderizar(agentSettings: Partial<AgentSettings> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const business = {
    id: "biz_1",
    agentSettings: { ...DEFAULT_AGENT_SETTINGS, ...agentSettings },
  } as Business;
  render(
    <QueryClientProvider client={queryClient}>
      <ComportamientoMovil business={business} />
    </QueryClientProvider>
  );
}

const saludo = () => screen.getByRole("radiogroup", { name: "¿En qué idioma saluda?" });
const principal = (nombre: string) => within(saludo()).getByRole("radio", { name: new RegExp(`^${nombre}`) });
const otros = () => screen.getByRole("group", { name: "¿Qué otros idiomas habla?" });

describe("ComportamientoMovil — idioma y voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["voz_idioma"] } as never);
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(CATALOGO_DE_IDIOMAS);
    // La vista previa la calcula el backend; aquí basta con lo que pinta.
    vi.mocked(previsualizarIdiomas).mockImplementation(async (seleccion) => ({
      languages: seleccion.languages,
      voiceLanguage: seleccion.voiceLanguage,
      entradilla: `Saluda en ${seleccion.voiceLanguage}.`,
      saludo: `Saludo en ${seleccion.voiceLanguage}`,
      avisos: seleccion.voiceLanguage === "ca-ES" ? [AVISO_DE_VOZ] : [],
    }));
  });

  it("pregunta en qué idioma saluda: español o una lengua cooficial", async () => {
    renderizar();

    await waitFor(() => expect(within(saludo()).getAllByRole("radio")).toHaveLength(4));
    expect(principal("Español")).toHaveAttribute("aria-checked", "true");
    expect(within(otros()).getAllByRole("checkbox").map((opcion) => opcion.textContent)).toEqual([
      "Inglés",
      "Francés",
    ]);
  });

  it("elegir el catalán lo hace principal, deja el español fijo y muestra lo que avisa el backend", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(await waitFor(() => principal("Catalán")));

    expect(principal("Catalán")).toHaveAttribute("aria-checked", "true");
    const espanol = within(otros()).getByRole("checkbox", { name: /^Español/ });
    expect(espanol).toBeDisabled();
    expect(espanol).toHaveAttribute("aria-checked", "true");
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
      voiceGender: "femenina",
    });
    expect(await screen.findByText(AVISO_DE_VOZ)).toBeInTheDocument();
    expect(screen.getByText("«Saludo en ca-ES»")).toBeInTheDocument();
  });

  it("volver de catalán a español quita el catalán y conserva el inglés", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ languages: ["es-ES", "en-GB", "ca-ES"], voiceLanguage: "ca-ES" });

    await user.click(await waitFor(() => principal("Español")));
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ languages: ["es-ES", "en-GB"], voiceLanguage: "es-ES" }),
    });
  });

  it("activar el inglés lo añade en el orden del catálogo", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ languages: ["es-ES", "fr-FR"] });

    await user.click(await waitFor(() => within(otros()).getByRole("checkbox", { name: "Inglés" })));
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ languages: ["es-ES", "en-GB", "fr-FR"] }),
    });
  });

  it("un principal que ya no se ofrece (inglés de antes) sigue a la vista", async () => {
    renderizar({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" });

    await waitFor(() => expect(principal("Inglés")).toHaveAttribute("aria-checked", "true"));
  });

  it("sin la función en el plan enseña lo activo y en qué idioma saluda", async () => {
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ languages: ["es-ES", "gl-ES"], voiceLanguage: "gl-ES" });

    expect(await screen.findByText(/Voz femenina · saluda en\s+gallego/)).toBeInTheDocument();
    expect(screen.getByText("Gallego")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "¿En qué idioma saluda?" })).toBeNull();
  });
});

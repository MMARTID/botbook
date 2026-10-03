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

const AVISO_DE_VOZ = "En catalán la voz suena algo menos expresiva.";
const MARCOS = "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411";

/** Como el backend: la elegida si es del principal; si no, la primera de su
 * género. */
function vozQueAtiende(seleccion: Pick<AgentSettings, "voiceLanguage" | "voiceGender" | "voz">) {
  const voces = CATALOGO_DE_IDIOMAS.principales.find((opcion) => opcion.codigo === seleccion.voiceLanguage)?.voces ?? [];
  return (
    voces.find((voz) => voz.id === seleccion.voz) ?? voces.find((voz) => voz.genero === seleccion.voiceGender) ?? voces[0]
  );
}

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
      voz: vozQueAtiende(seleccion)?.id ?? "",
      voiceGender: vozQueAtiende(seleccion)?.genero ?? seleccion.voiceGender,
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
      "Alemán",
      "Italiano",
      "Portugués",
      "Neerlandés",
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

    expect(await screen.findByText(/Voz de Marta · saluda en\s+gallego/)).toBeInTheDocument();
    expect(screen.getByText("Gallego")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "¿En qué idioma saluda?" })).toBeNull();
  });
});

describe("ComportamientoMovil — la voz", () => {
  const voces = () => screen.getByRole("radiogroup", { name: "¿Con qué voz atiende?" });
  const voz = (nombre: string) => within(voces()).getByRole("radio", { name: new RegExp(`^${nombre}`) });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["voz_idioma"] } as never);
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(CATALOGO_DE_IDIOMAS);
    vi.mocked(previsualizarIdiomas).mockImplementation(async (seleccion) => ({
      languages: seleccion.languages,
      voiceLanguage: seleccion.voiceLanguage,
      voz: vozQueAtiende(seleccion)?.id ?? "",
      voiceGender: vozQueAtiende(seleccion)?.genero ?? seleccion.voiceGender,
      entradilla: "",
      saludo: "",
      avisos: [],
    }));
  });

  it("se escucha antes de elegir: cada voz del idioma principal con su muestra", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    renderizar();

    await waitFor(() => expect(voz("Blanca")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Escuchar a Marcos" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect((play.mock.contexts[0] as HTMLAudioElement).src).toMatch(/\/voces\/es\/marcos\.mp3$/);
    expect(screen.getByRole("button", { name: "Parar la muestra de Marcos" })).toBeInTheDocument();
    play.mockRestore();
  });

  it("elegir una voz guarda su id y su género", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar();

    await user.click(await waitFor(() => voz("Marcos")));
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ voz: MARCOS, voiceGender: "masculina" }),
    });
  });

  it("con el inglés activo, las voces de catalán que no lo hablan salen desactivadas y lo dicen", async () => {
    renderizar({ languages: ["es-ES", "ca-ES", "en-GB"], voiceLanguage: "ca-ES" });

    await waitFor(() => expect(voz("Joana")).toBeDisabled());
    expect(voz("Joana")).toHaveTextContent("Femenina · no habla inglés");
    expect(voz("Marta")).toBeEnabled();
    expect(voz("Marta")).toHaveTextContent("Femenina · habla todos los idiomas");
  });

  it("cambiar de idioma principal olvida la voz elegida: atiende la de su género", async () => {
    const user = userEvent.setup();
    renderizar({ voz: MARCOS, voiceGender: "masculina" });

    await user.click(await waitFor(() => principal("Catalán")));

    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ voiceLanguage: "ca-ES", voz: undefined, voiceGender: "masculina" })
    );
    await waitFor(() => expect(voz("Sergio")).toHaveAttribute("aria-checked", "true"));
  });
});

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
import type { AgentSettings, Business, VistaPreviaDeIdiomas } from "@/lib/types";
import { CATALOGO_DE_IDIOMAS } from "../../fixtures/catalogo-de-idiomas";

vi.mock("@/lib/api", () => ({
  getBillingSummary: vi.fn(),
  getCatalogoDeIdiomas: vi.fn(),
  previsualizarIdiomas: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const AVISO_DE_COOFICIAL = "Con el catalán activo, la recepcionista tarda algo más en contestar.";
const AVISO_DE_EXTRANJERO = "También saluda en alemán a los clientes de aquí.";
const MARCOS = "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411";
const COOFICIALES = CATALOGO_DE_IDIOMAS.cooficiales.map((idioma) => idioma.codigo);

/** El id de una voz del catálogo por su nombre. */
function idDe(idioma: string, nombre: string) {
  const voz = CATALOGO_DE_IDIOMAS.principales
    .find((opcion) => opcion.codigo === idioma)
    ?.voces.find((candidata) => candidata.nombre === nombre);
  if (!voz) throw new Error(`No hay ${nombre} en ${idioma}`);
  return voz.id;
}

/** Como el backend: las voces de la cooficial activa o, sin ella, las del
 * saludo; la elegida si está entre ellas y, si no, la de por defecto de su
 * género. */
function vistaPrevia(
  seleccion: Pick<AgentSettings, "languages" | "voiceLanguage" | "voiceGender" | "voz">,
  conTextos = true
): VistaPreviaDeIdiomas {
  const cooficial = seleccion.languages.find((idioma) => COOFICIALES.includes(idioma));
  const deLasVoces = CATALOGO_DE_IDIOMAS.principales.find((opcion) => opcion.codigo === (cooficial ?? seleccion.voiceLanguage));
  const voces = deLasVoces?.voces ?? [];
  const voz =
    voces.find((candidata) => candidata.id === seleccion.voz) ??
    voces.find((candidata) => candidata.porDefecto && candidata.genero === seleccion.voiceGender) ??
    voces[0];
  const avisos = !conTextos
    ? []
    : cooficial === "ca-ES"
      ? [AVISO_DE_COOFICIAL]
      : seleccion.voiceLanguage === "de-DE"
        ? [AVISO_DE_EXTRANJERO]
        : [];
  return {
    languages: seleccion.languages,
    voiceLanguage: seleccion.voiceLanguage,
    voz: voz?.id ?? "",
    voiceGender: voz?.genero ?? seleccion.voiceGender,
    familia: deLasVoces?.familia ?? "ultra",
    voces,
    entradilla: conTextos ? `Saluda en ${seleccion.voiceLanguage}.` : "",
    saludo: conTextos ? `Saludo en ${seleccion.voiceLanguage}` : "",
    avisos,
  };
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
const otroIdioma = () => screen.getByRole("button", { name: /^Otro idioma/ });
const extranjero = (nombre: string) =>
  within(screen.getByRole("radiogroup", { name: "Otro idioma" })).getByRole("radio", { name: new RegExp(`^${nombre}`) });
const otros = () => screen.getByRole("group", { name: "¿Qué otros idiomas habla?" });
const casillas = () => within(otros()).getAllByRole("checkbox").map((opcion) => opcion.textContent);
const voces = () => screen.getByRole("radiogroup", { name: "¿Con qué voz atiende?" });
const voz = (nombre: string) => within(voces()).getByRole("radio", { name: new RegExp(`^${nombre}`) });
const genero = (nombre: "Mujer" | "Hombre") =>
  within(screen.getByRole("radiogroup", { name: "Voz de mujer o de hombre" })).getByRole("radio", { name: nombre });

describe("ComportamientoMovil — idioma y voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["voz_idioma"] } as never);
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(CATALOGO_DE_IDIOMAS);
    // La vista previa la calcula el backend; aquí basta con lo que pinta.
    vi.mocked(previsualizarIdiomas).mockImplementation(async (seleccion) => vistaPrevia(seleccion));
  });

  it("pregunta en qué idioma saluda: español o una lengua cooficial", async () => {
    renderizar();

    await waitFor(() => expect(within(saludo()).getAllByRole("radio")).toHaveLength(4));
    expect(within(saludo()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
      "Español",
      "Catalán",
      "Euskera",
      "Gallego",
    ]);
    expect(principal("Español")).toHaveAttribute("aria-checked", "true");
    // Los extranjeros, plegados bajo «Otro idioma».
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "false");
    expect(otroIdioma()).toHaveTextContent("Inglés, francés, alemán, italiano, portugués o neerlandés");
    expect(screen.queryByRole("radiogroup", { name: "Otro idioma" })).toBeNull();
    // Con saludo en español: las tres cooficiales y los seis extranjeros.
    expect(casillas()).toEqual([
      "Catalán",
      "Euskera",
      "Gallego",
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
    // Con saludo en catalán no se ofrecen las otras cooficiales.
    expect(casillas()).toEqual(["EspañolSiempre", "Inglés", "Francés", "Alemán", "Italiano", "Portugués", "Neerlandés"]);
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "ca-ES",
      voiceGender: "femenina",
    });
    expect(await screen.findByText(AVISO_DE_COOFICIAL)).toBeInTheDocument();
    expect(screen.getByText("«Saludo en ca-ES»")).toBeInTheDocument();
  });

  it("volver de catalán a español deja el catalán activo (saluda en castellano) y conserva el inglés", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ languages: ["es-ES", "en-GB", "ca-ES"], voiceLanguage: "ca-ES" });

    await user.click(await waitFor(() => principal("Español")));

    expect(within(otros()).getByRole("checkbox", { name: "Catalán" })).toHaveAttribute("aria-checked", "true");
    expect(within(otros()).getByRole("checkbox", { name: "Inglés" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ languages: ["es-ES", "en-GB", "ca-ES"], voiceLanguage: "es-ES" }),
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
    const sinIngles = structuredClone(CATALOGO_DE_IDIOMAS);
    sinIngles.principales = sinIngles.principales.filter((opcion) => opcion.codigo !== "en-GB");
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(sinIngles);
    renderizar({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" });

    await waitFor(() => expect(extranjero("Inglés")).toHaveAttribute("aria-checked", "true"));
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "true");
  });

  it("sin la función en el plan enseña lo activo y en qué idioma saluda", async () => {
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ languages: ["es-ES", "gl-ES"], voiceLanguage: "gl-ES" });

    expect(await screen.findByText(/Voz de Marta · saluda en\s+gallego/)).toBeInTheDocument();
    expect(screen.getByText("Gallego")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "¿En qué idioma saluda?" })).toBeNull();
  });

  it("con saludo en español, activar el catalán atiende con Marta o Sergio y sigue saludando en castellano", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ voz: idDe("es-ES", "Lara") });

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    await user.click(within(otros()).getByRole("checkbox", { name: "Catalán" }));

    expect(principal("Español")).toHaveAttribute("aria-checked", "true");
    // Lara no habla catalán: atiende la de su género, pero la elección se
    // conserva (al quitar el catalán vuelve).
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith({
      languages: ["es-ES", "ca-ES"],
      voiceLanguage: "es-ES",
      voiceGender: "femenina",
      voz: idDe("es-ES", "Lara"),
    });
    await waitFor(() => expect(within(voces()).getAllByRole("radio")).toHaveLength(2));
    expect(voz("Marta")).toHaveAttribute("aria-checked", "true");
    expect(voz("Sergio")).toHaveAttribute("aria-checked", "false");
    expect(await screen.findByText(AVISO_DE_COOFICIAL)).toBeInTheDocument();
    // Con Marta y Sergio no se elige género ni hay más voces.
    expect(screen.queryByRole("radiogroup", { name: "Voz de mujer o de hombre" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ver todas las voces/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ languages: ["es-ES", "ca-ES"], voiceLanguage: "es-ES" }),
    });
    // Va Lara, que no atiende con el catalán: el backend no la guarda
    // (conVozValida) y atiende Marta, la que enseñaba la vista previa.
    expect(vi.mocked(updateMyBusiness).mock.calls[0][0].agentSettings?.voz).toBe(idDe("es-ES", "Lara"));
  });

  it("como mucho una lengua cooficial: marcar el euskera desmarca el catalán", async () => {
    const user = userEvent.setup();
    renderizar({ languages: ["es-ES", "en-GB", "ca-ES"] });

    await user.click(await waitFor(() => within(otros()).getByRole("checkbox", { name: "Euskera" })));

    expect(within(otros()).getByRole("checkbox", { name: "Euskera" })).toHaveAttribute("aria-checked", "true");
    expect(within(otros()).getByRole("checkbox", { name: "Catalán" })).toHaveAttribute("aria-checked", "false");
    expect(within(otros()).getByRole("checkbox", { name: "Inglés" })).toHaveAttribute("aria-checked", "true");
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "en-GB", "eu-ES"], voiceLanguage: "es-ES" })
    );
  });

  it("saludar en otro idioma: se elige bajo «Otro idioma», quita la cooficial avisándolo y atiende una voz de ese idioma", async () => {
    const user = userEvent.setup();
    renderizar({ languages: ["es-ES", "fr-FR", "ca-ES"] });

    await user.click(await waitFor(() => otroIdioma()));
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "true");
    // Con el catalán activo se puede saludar en alemán: el catalán, que no
    // va con un saludo extranjero, deja de estar activo y se avisa.
    expect(extranjero("Alemán")).toBeEnabled();
    await user.click(extranjero("Alemán"));
    expect(await screen.findByText("Al guardar, dejará de atender en catalán.")).toBeInTheDocument();

    expect(extranjero("Alemán")).toHaveAttribute("aria-checked", "true");
    expect(within(saludo()).getAllByRole("radio").every((opcion) => opcion.getAttribute("aria-checked") === "false")).toBe(true);
    // Con saludo extranjero no hay cooficiales; el francés sigue.
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "fr-FR", "de-DE"], voiceLanguage: "de-DE", voz: undefined })
    );
    expect(casillas()).toEqual(["EspañolSiempre", "Inglés", "Francés", "Italiano", "Portugués", "Neerlandés"]);
    await waitFor(() => expect(voz("Alina")).toHaveAttribute("aria-checked", "true"));
    expect(await screen.findByText(AVISO_DE_EXTRANJERO)).toBeInTheDocument();

    // Plegado, el botón sigue diciendo en qué idioma saluda.
    await user.click(otroIdioma());
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "false");
    expect(otroIdioma()).toHaveTextContent("Saluda en alemán");
  });

  it("un saludo en otro idioma ya guardado abre «Otro idioma» con ese idioma elegido", async () => {
    renderizar({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" });

    await waitFor(() => expect(extranjero("Inglés")).toHaveAttribute("aria-checked", "true"));
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "true");
    expect(principal("Español")).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(voz("Lucy")).toHaveAttribute("aria-checked", "true"));
  });

  // Revisión del 2026-10-05: elegir un saludo quitaba en silencio la lengua
  // cooficial activa (y el backend, con ella activa, habría saludado en
  // ella). Ahora la quita igual que desde cualquier otro saludo, y avisa si
  // estaba guardada: una sola regla, sin opciones desactivadas.
  it("con el catalán activo y saludo en español, saludar en euskera cambia la cooficial y lo avisa", async () => {
    const user = userEvent.setup();
    renderizar({ languages: ["es-ES", "ca-ES"] });

    await waitFor(() => expect(principal("Euskera")).toBeEnabled());
    expect(principal("Gallego")).toBeEnabled();
    expect(principal("Euskera")).not.toHaveTextContent("Quita antes");
    await user.click(principal("Euskera"));

    expect(principal("Euskera")).toHaveAttribute("aria-checked", "true");
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "eu-ES"], voiceLanguage: "eu-ES" })
    );
    expect(await screen.findByText("Al guardar, dejará de atender en catalán.")).toBeInTheDocument();
  });

  it("de saludo en catalán a inglés: el catalán deja de estar activo y lo avisa", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" });

    await user.click(await waitFor(() => otroIdioma()));
    expect(extranjero("Inglés")).toBeEnabled();
    await user.click(extranjero("Inglés"));

    expect(await screen.findByText("Al guardar, dejará de atender en catalán.")).toBeInTheDocument();
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "en-GB"], voiceLanguage: "en-GB" })
    );
    // Volver a saludar en catalán lo recupera y el aviso se va.
    await user.click(principal("Catalán"));
    expect(screen.queryByText("Al guardar, dejará de atender en catalán.")).toBeNull();
  });

  // Vercel publica la app antes de que Cloud Run sirva el backend nuevo: en
  // ese rato el catálogo y la vista previa llegan con la forma anterior
  // (sin cooficiales, otrosIdiomas, tipo, familia ni voces en la vista).
  it("con el catálogo del backend anterior pinta sin romperse y deja cambiar el saludo", async () => {
    const user = userEvent.setup();
    const vozAnterior = (id: string, nombre: string, genero: string, habla: string[] | "todos") => ({
      id,
      nombre,
      genero,
      habla,
      expresiva: id.startsWith("Telnyx.Ultra."),
      muestra: `/voces/es/${nombre.toLowerCase()}.mp3`,
    });
    const ULTRA = ["es-ES", "en-GB", "fr-FR", "de-DE", "it-IT", "pt-PT", "nl-NL"];
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue({
      obligatorio: { codigo: "es-ES", etiqueta: "Español" },
      principales: [
        {
          codigo: "es-ES",
          etiqueta: "Español",
          secundariosCompatibles: ["en-GB", "fr-FR"],
          voces: [
            vozAnterior("Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6", "Blanca", "femenina", ULTRA),
            vozAnterior(MARCOS, "Marcos", "masculina", ULTRA),
          ],
        },
        {
          codigo: "ca-ES",
          etiqueta: "Catalán",
          secundariosCompatibles: ["en-GB", "fr-FR"],
          voces: [vozAnterior("Soniox.tts-rt-v2.Marta", "Marta", "femenina", "todos")],
        },
      ],
      secundarios: [
        { codigo: "en-GB", etiqueta: "Inglés" },
        { codigo: "fr-FR", etiqueta: "Francés" },
      ],
      etiquetas: { "es-ES": "Español", "en-GB": "Inglés", "fr-FR": "Francés", "ca-ES": "Catalán" },
    } as never);
    vi.mocked(previsualizarIdiomas).mockImplementation(
      async (seleccion) =>
        ({
          languages: seleccion.languages,
          voiceLanguage: seleccion.voiceLanguage,
          voz: seleccion.voiceLanguage === "ca-ES" ? "Soniox.tts-rt-v2.Marta" : "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
          voiceGender: "femenina",
          entradilla: "",
          saludo: "",
          avisos: [],
        }) as never
    );
    renderizar({ languages: ["es-ES", "en-GB"] });

    await waitFor(() => expect(voz("Blanca")).toHaveAttribute("aria-checked", "true"));
    await user.click(principal("Catalán"));

    expect(principal("Catalán")).toHaveAttribute("aria-checked", "true");
    // Sin `otrosIdiomas` no quita nada: lo corrige el backend.
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "en-GB", "ca-ES"], voiceLanguage: "ca-ES" })
    );
    await waitFor(() => expect(voz("Marta")).toHaveAttribute("aria-checked", "true"));
  });
});

describe("ComportamientoMovil — la voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["voz_idioma"] } as never);
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(CATALOGO_DE_IDIOMAS);
    vi.mocked(previsualizarIdiomas).mockImplementation(async (seleccion) => vistaPrevia(seleccion, false));
  });

  it("se escucha antes de elegir: las recomendadas de su género, cada una con su muestra", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    renderizar();

    await waitFor(() => expect(voz("Blanca")).toHaveAttribute("aria-checked", "true"));
    expect(genero("Mujer")).toHaveAttribute("aria-checked", "true");
    expect(within(voces()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
      "BlancaPor defectoCálida y acogedora",
      expect.stringMatching(/^Alicia/),
      expect.stringMatching(/^Eva/),
      expect.stringMatching(/^Lara/),
      expect.stringMatching(/^Marta/),
      expect.stringMatching(/^Nuria/),
    ]);

    await user.click(screen.getByRole("button", { name: "Escuchar a Lara" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect((play.mock.contexts[0] as HTMLAudioElement).src).toMatch(/\/voces\/es\/85b356c1-c638-404d-b986-f54a53d957d6\.mp3$/);
    expect(screen.getByRole("button", { name: "Parar la muestra de Lara" })).toBeInTheDocument();
    play.mockRestore();
  });

  it("elegir una voz guarda su id y su género", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar();

    await user.click(await waitFor(() => genero("Hombre")));
    await user.click(voz("Álvaro"));
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ voz: idDe("es-ES", "Álvaro"), voiceGender: "masculina" }),
    });
  });

  it("con una lengua cooficial activa atienden Marta y Sergio, sin voces desactivadas", async () => {
    renderizar({ languages: ["es-ES", "ca-ES", "en-GB"], voiceLanguage: "ca-ES" });

    await waitFor(() => expect(voz("Marta")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(2);
    expect(voz("Marta")).toBeEnabled();
    expect(voz("Sergio")).toBeEnabled();
    expect(voz("Sergio")).toHaveTextContent("Sergio");
    expect(screen.queryByText(/habla todos los idiomas|no habla/)).toBeNull();
  });

  it("cambiar el saludo conserva la voz elegida: atiende la de su género y, al volver, vuelve la elegida", async () => {
    const user = userEvent.setup();
    renderizar({ voz: MARCOS, voiceGender: "masculina" });

    await user.click(await waitFor(() => principal("Catalán")));

    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ voiceLanguage: "ca-ES", voz: MARCOS, voiceGender: "masculina" })
    );
    await waitFor(() => expect(voz("Sergio")).toHaveAttribute("aria-checked", "true"));

    // De vuelta al español (el catalán sigue activo: Sergio) y sin catalán:
    // Marcos otra vez, y nada que guardar.
    await user.click(principal("Español"));
    await user.click(within(otros()).getByRole("checkbox", { name: "Catalán" }));
    await waitFor(() => expect(voz("Marcos")).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
  });

  it("cambiar a Hombre atiende el de por defecto y enseña las recomendadas de los hombres", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ voz: idDe("es-ES", "Lara") });

    await user.click(await waitFor(() => genero("Hombre")));

    expect(genero("Hombre")).toHaveAttribute("aria-checked", "true");
    expect(genero("Hombre")).toHaveFocus();
    expect(voz("Marcos")).toHaveAttribute("aria-checked", "true");
    expect(voz("Marcos")).toHaveTextContent("Por defecto");
    expect(within(voces()).getAllByRole("radio")).toHaveLength(6);
    expect(within(voces()).queryByRole("radio", { name: /^Lara/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver todas las voces (11)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ voiceGender: "masculina" }),
    });
    expect(vi.mocked(updateMyBusiness).mock.calls[0][0].agentSettings?.voz).toBeUndefined();
  });

  it("«Ver todas las voces» despliega el resto del género en la misma página", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar();

    const verTodas = await screen.findByRole("button", { name: "Ver todas las voces (18)" });
    expect(verTodas).toHaveAttribute("aria-expanded", "false");
    expect(verTodas).toHaveAttribute("aria-controls", "lista-de-voces");
    expect(within(voces()).getAllByRole("radio")).toHaveLength(6);

    await user.click(verTodas);
    expect(within(voces()).getAllByRole("radio")).toHaveLength(18);
    const verMenos = screen.getByRole("button", { name: "Ver solo las recomendadas" });
    expect(verMenos).toHaveAttribute("aria-expanded", "true");
    await user.click(voz("Celia"));

    // Plegada otra vez, la elegida sigue a la vista.
    await user.click(verMenos);
    expect(within(voces()).getAllByRole("radio")).toHaveLength(7);
    expect(voz("Celia")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({ voz: idDe("es-ES", "Celia"), voiceGender: "femenina" }),
    });
  });

  it("una voz guardada que no es de las recomendadas sale elegida con la lista plegada", async () => {
    renderizar({ voz: idDe("es-ES", "Celia") });

    await waitFor(() => expect(voz("Celia")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(7);
    expect(voz("Blanca")).toHaveAttribute("aria-checked", "false");
  });

  it("sin más voces que las recomendadas no ofrece «Ver todas»", async () => {
    renderizar({ languages: ["es-ES", "pt-PT"], voiceLanguage: "pt-PT" });

    await waitFor(() => expect(voz("Beatriz")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Ver todas las voces/ })).toBeNull();
  });

  // Revisión del 2026-10-05: mirar otras opciones y volver borraba la voz
  // elegida (y sacaba la barra de guardar sin cambios).
  it("mirar las voces de hombre y volver a Mujer recupera la voz elegida, sin nada que guardar", async () => {
    const user = userEvent.setup();
    renderizar({ voz: idDe("es-ES", "Lara") });

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    await user.click(genero("Hombre"));
    await waitFor(() => expect(voz("Marcos")).toHaveAttribute("aria-checked", "true"));
    await user.click(genero("Mujer"));

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    expect(voz("Blanca")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
  });

  it("saludar en alemán y volver al español recupera la voz elegida", async () => {
    const user = userEvent.setup();
    renderizar({ voz: idDe("es-ES", "Lara") });

    await user.click(await waitFor(() => otroIdioma()));
    await user.click(extranjero("Alemán"));
    await waitFor(() => expect(voz("Alina")).toHaveAttribute("aria-checked", "true"));
    await user.click(principal("Español"));

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
  });

  it("con Marta y Sergio (cooficial activa) ninguna lleva «Por defecto»", async () => {
    renderizar({ languages: ["es-ES", "ca-ES"] });

    await waitFor(() => expect(within(voces()).getAllByRole("radio")).toHaveLength(2));
    expect(within(voces()).queryByText("Por defecto")).toBeNull();
  });

  it("pulsar el género ya elegido no pliega «Ver todas las voces»", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(await screen.findByRole("button", { name: "Ver todas las voces (18)" }));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(18);
    await user.click(genero("Mujer"));

    expect(within(voces()).getAllByRole("radio")).toHaveLength(18);
  });

  it("la muestra se para cuando su voz deja de verse", async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    renderizar();

    await user.click(await screen.findByRole("button", { name: "Ver todas las voces (18)" }));
    await user.click(screen.getByRole("button", { name: "Escuchar a Celia" }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    pause.mockClear();
    await user.click(screen.getByRole("button", { name: "Ver solo las recomendadas" }));

    expect(pause).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Ver todas las voces (18)" }));
    expect(screen.getByRole("button", { name: "Escuchar a Celia" })).toBeInTheDocument();
    play.mockRestore();
    pause.mockRestore();
  });
});

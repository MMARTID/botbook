import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComportamientoMovil, CONFIRMACION_IR_A_LOS_PLANES } from "@/components/movil/agente/comportamiento-movil";
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

const AVISO_DE_COOFICIAL = "Con el catalán como idioma principal, la recepcionista tarda algo más en contestar.";
const AVISO_DE_EXTRANJERO = "También saluda en alemán a los clientes de aquí.";
const MARCOS = "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411";

/** El principal del catálogo por su código. */
function principalDelCatalogo(codigo: string) {
  const principal = CATALOGO_DE_IDIOMAS.principales.find((opcion) => opcion.codigo === codigo);
  if (!principal) throw new Error(`No hay ${codigo} en el catálogo`);
  return principal;
}

/** El id de una voz del catálogo por su nombre. */
function idDe(idioma: string, nombre: string) {
  const voz = principalDelCatalogo(idioma).voces.find((candidata) => candidata.nombre === nombre);
  if (!voz) throw new Error(`No hay ${nombre} en ${idioma}`);
  return voz.id;
}

/** Como el backend: el principal manda; sus voces, la elegida si está entre
 * ellas y, si no, la de por defecto de su género. */
function vistaPrevia(
  seleccion: Pick<AgentSettings, "languages" | "voiceLanguage" | "voiceGender" | "voz">,
  conTextos = true
): VistaPreviaDeIdiomas {
  const principal = CATALOGO_DE_IDIOMAS.principales.find((opcion) => opcion.codigo === seleccion.voiceLanguage);
  const voces = principal?.voces ?? [];
  const voz =
    voces.find((candidata) => candidata.id === seleccion.voz) ??
    voces.find((candidata) => candidata.porDefecto && candidata.genero === seleccion.voiceGender) ??
    voces[0];
  const avisos = !conTextos
    ? []
    : seleccion.voiceLanguage === "ca-ES"
      ? [AVISO_DE_COOFICIAL]
      : seleccion.voiceLanguage === "de-DE"
        ? [AVISO_DE_EXTRANJERO]
        : [];
  return {
    languages: principal?.idiomas ?? seleccion.languages,
    voiceLanguage: seleccion.voiceLanguage,
    voz: voz?.id ?? "",
    voiceGender: voz?.genero ?? seleccion.voiceGender,
    familia: principal?.familia ?? "ultra",
    voces,
    requiereParaElegirVoz: principal?.requiereParaElegirVoz ?? null,
    entradilla: conTextos ? (principal?.entradilla ?? "") : "",
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

/** El catálogo del backend del 05-10: catalán, euskera y gallego, con
 * candado de «lenguas_locales», y sin `requiereParaElegirVoz`. Lo ve la app
 * mientras Cloud Run aún no sirve el backend nuevo, o desde la caché. */
function catalogoDelBackendAnterior() {
  const anterior = structuredClone(CATALOGO_DE_IDIOMAS);
  for (const opcion of anterior.principales) {
    delete opcion.requiereParaElegirVoz;
    if (opcion.tipo === "cooficial") {
      opcion.requiere = { funcion: "lenguas_locales", texto: "Disponible en Pro y Scale" };
    }
  }
  return anterior;
}

const IDIOMAS_CON_CATALAN = principalDelCatalogo("ca-ES").idiomas!;
const HABLA_SIETE =
  "Habla en 7 idiomas: español, inglés, francés, alemán, italiano, portugués y neerlandés. Saluda en español y sigue en el idioma de quien llama.";

const principales = () => screen.getByRole("radiogroup", { name: "Idioma principal" });
const principal = (nombre: string) => within(principales()).getByRole("radio", { name: new RegExp(`^${nombre}`) });
const otroIdioma = () => screen.getByRole("button", { name: /^Otro idioma/ });
const extranjero = (nombre: string) =>
  within(screen.getByRole("radiogroup", { name: "Otro idioma" })).getByRole("radio", { name: new RegExp(`^${nombre}`) });
const conCandado = (nombre: string) => screen.getByRole("link", { name: new RegExp(`^${nombre}`) });
const voces = () => screen.getByRole("radiogroup", { name: "¿Con qué voz atiende?" });
const voz = (nombre: string) => within(voces()).getByRole("radio", { name: new RegExp(`^${nombre}`) });
const genero = (nombre: "Mujer" | "Hombre") =>
  within(screen.getByRole("radiogroup", { name: "Voz de mujer o de hombre" })).getByRole("radio", { name: nombre });
const candadoDeVoces = () => screen.getByRole("link", { name: /^Elegir entre las \d+ voces/ });
const AVISO_PIERDE_LARA = "Tu plan ya no incluye elegir la voz: si guardas este cambio, no podrás volver a Lara sin cambiar de plan.";

// Desde el 2026-10-05 el dueño solo elige el idioma principal y la voz: los
// idiomas que habla los da el principal, sin casillas.
describe("ComportamientoMovil — idioma y voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["elegir_voz"] } as never);
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(CATALOGO_DE_IDIOMAS);
    // La vista previa la calcula el backend; aquí basta con lo que pinta.
    vi.mocked(previsualizarIdiomas).mockImplementation(async (seleccion) => vistaPrevia(seleccion));
  });

  it("pregunta el idioma principal: español o una lengua cooficial, y los extranjeros bajo «Otro idioma», sin casillas de idiomas", async () => {
    renderizar();

    await waitFor(() => expect(within(principales()).getAllByRole("radio")).toHaveLength(4));
    expect(within(principales()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
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
    // Nada de «¿Qué otros idiomas habla?» ni de casillas.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByText(/otros idiomas habla/)).toBeNull();
  });

  it("dice en cuántos idiomas habla con el principal, con el texto del backend", async () => {
    const user = userEvent.setup();
    renderizar();

    expect(await screen.findByText(HABLA_SIETE)).toBeInTheDocument();
    await user.click(principal("Catalán"));

    expect(await screen.findByText(principalDelCatalogo("ca-ES").entradilla!)).toBeInTheDocument();
    expect(screen.queryByText(HABLA_SIETE)).toBeNull();
  });

  it("elegir el catalán lo hace principal con los idiomas que habla con él y muestra lo que avisa el backend", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(await waitFor(() => principal("Catalán")));

    expect(principal("Catalán")).toHaveAttribute("aria-checked", "true");
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith({
      languages: IDIOMAS_CON_CATALAN,
      voiceLanguage: "ca-ES",
      voiceGender: "femenina",
    });
    expect(await screen.findByText(AVISO_DE_COOFICIAL)).toBeInTheDocument();
    expect(screen.getByText("«Saludo en ca-ES»")).toBeInTheDocument();
    await waitFor(() => expect(within(voces()).getAllByRole("radio")).toHaveLength(2));
    expect(voz("Marta")).toHaveAttribute("aria-checked", "true");
  });

  it("al volver del catalán al español guarda los idiomas del español, sin el catalán", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    renderizar({ languages: IDIOMAS_CON_CATALAN, voiceLanguage: "ca-ES" });

    await user.click(await waitFor(() => principal("Español")));
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(updateMyBusiness).toHaveBeenCalledWith({
      agentSettings: expect.objectContaining({
        languages: DEFAULT_AGENT_SETTINGS.languages,
        voiceLanguage: "es-ES",
      }),
    });
  });

  it("un principal que ya no se ofrece (inglés de antes) sigue a la vista", async () => {
    const sinIngles = structuredClone(CATALOGO_DE_IDIOMAS);
    sinIngles.principales = sinIngles.principales.filter((opcion) => opcion.codigo !== "en-GB");
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(sinIngles);
    renderizar({ voiceLanguage: "en-GB" });

    await waitFor(() => expect(extranjero("Inglés")).toHaveAttribute("aria-checked", "true"));
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "true");
  });

  // Decisión del usuario del 2026-10-07: en Cataluña atender en catalán es
  // obligatorio; el principal es libre en todos los planes.
  it("en Inicio, catalán, euskera y gallego se eligen como los demás, sin candado", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar();

    await waitFor(() => expect(within(principales()).getAllByRole("radio")).toHaveLength(4));
    expect(within(principales()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
      "Español",
      "Catalán",
      "Euskera",
      "Gallego",
    ]);
    expect(screen.queryByRole("link", { name: /^(Catalán|Euskera|Gallego)/ })).toBeNull();

    await user.click(principal("Catalán"));
    expect(principal("Catalán")).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(voz("Marta")).toHaveAttribute("aria-checked", "true"));

    await user.click(otroIdioma());
    expect(within(screen.getByRole("radiogroup", { name: "Otro idioma" })).getAllByRole("radio")).toHaveLength(6);
    expect(screen.queryByText(/Disponible en/)).toBeNull();
  });

  // Vercel publica la app antes de que Cloud Run sirva el backend nuevo: en
  // ese rato el backend aún pone candado a las lenguas locales y lo valida.
  it("con el catálogo del backend anterior, en Inicio catalán, euskera y gallego salen con candado salvo el que ya tiene", async () => {
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(catalogoDelBackendAnterior());
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ languages: principalDelCatalogo("gl-ES").idiomas, voiceLanguage: "gl-ES" });

    await waitFor(() => expect(principal("Gallego")).toHaveAttribute("aria-checked", "true"));
    expect(conCandado("Catalán")).toHaveAttribute("href", "/ajustes/facturacion");
    expect(conCandado("Catalán")).toHaveTextContent("Disponible en Pro y Scale");
    expect(conCandado("Euskera")).toBeInTheDocument();
    await waitFor(() => expect(voz("Marta")).toHaveAttribute("aria-checked", "true"));
  });

  // Y al revés: el catálogo anterior en caché (se pide una vez por sesión)
  // con el plan del backend nuevo, que manda «lenguas_locales» a todos.
  it("con el catálogo anterior en caché y «lenguas_locales» en el plan, las lenguas locales no se bloquean", async () => {
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(catalogoDelBackendAnterior());
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["lenguas_locales"] } as never);
    renderizar();

    await waitFor(() => expect(principal("Catalán")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /^Catalán/ })).toBeNull();
    // Lo que exige la voz lo trae la vista previa, que sí es del backend
    // nuevo: en Inicio, el candado.
    expect(await screen.findByRole("link", { name: /^Elegir entre las 29 voces/ })).toBeInTheDocument();
  });

  // Revisión del 2026-10-07: el plan en caché del backend anterior (Pro:
  // «voz_idioma», sin «elegir_voz») con la vista previa del nuevo, que pide
  // «elegir_voz»: un Pro no debe ver candado en las voces.
  it("con el plan del backend anterior en caché («voz_idioma», Pro), elegir entre todas las voces no lleva candado", async () => {
    vi.mocked(getBillingSummary).mockResolvedValue({
      planFeatures: ["recordatorios_cita", "resumen_semanal", "lenguas_locales", "voz_idioma"],
    } as never);
    renderizar({ voz: idDe("es-ES", "Lara") });

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    expect(await screen.findByRole("button", { name: /^Ver todas las voces/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Elegir entre/ })).toBeNull();
    expect(screen.queryByText(/Tu plan ya no incluye/)).toBeNull();
  });

  it("saludar en otro idioma: se elige bajo «Otro idioma» y atiende una voz de ese idioma", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(await waitFor(() => otroIdioma()));
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "true");
    await user.click(extranjero("Alemán"));

    expect(extranjero("Alemán")).toHaveAttribute("aria-checked", "true");
    expect(within(principales()).getAllByRole("radio").every((opcion) => opcion.getAttribute("aria-checked") === "false")).toBe(true);
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: principalDelCatalogo("de-DE").idiomas, voiceLanguage: "de-DE", voz: undefined })
    );
    await waitFor(() => expect(voz("Alina")).toHaveAttribute("aria-checked", "true"));
    expect(await screen.findByText(AVISO_DE_EXTRANJERO)).toBeInTheDocument();

    // Plegado, el botón sigue diciendo en qué idioma saluda.
    await user.click(otroIdioma());
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "false");
    expect(otroIdioma()).toHaveTextContent("Saluda en alemán");
  });

  it("un principal en otro idioma ya guardado abre «Otro idioma» con ese idioma elegido", async () => {
    renderizar({ voiceLanguage: "en-GB" });

    await waitFor(() => expect(extranjero("Inglés")).toHaveAttribute("aria-checked", "true"));
    expect(otroIdioma()).toHaveAttribute("aria-expanded", "true");
    expect(principal("Español")).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(voz("Lucy")).toHaveAttribute("aria-checked", "true"));
  });

  // Revisión del 2026-10-05: lo que veía el dueño cuando el candado no
  // salía (plan sin cargar, catálogo del backend anterior en caché) era un
  // «No se pudo guardar» sin motivo.
  it("si el backend rechaza el guardado, enseña su motivo", async () => {
    const user = userEvent.setup();
    const motivo =
      "Elegir entre todas las voces está disponible en los planes Pro y Scale. En tu plan eliges voz de mujer o de hombre y atiende la de por defecto.";
    vi.mocked(getBillingSummary).mockRejectedValue(new Error("Sin conexión"));
    vi.mocked(updateMyBusiness).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: motivo, code: "PLAN_LIMIT_ELEGIR_VOZ" } },
    });
    renderizar();

    // Sin el plan cargado no hay candados: lo valida el backend.
    await user.click(await waitFor(() => voz("Lara")));
    await user.click(screen.getByRole("button", { name: /Guardar/ }));

    expect(await screen.findByText(motivo)).toBeInTheDocument();
    expect(screen.queryByText("No se pudo guardar el comportamiento del agente.")).toBeNull();
  });

  it("con el catálogo del backend anterior, en Inicio cambiar la lengua local que conserva avisa de que no podrá volver a ella", async () => {
    const user = userEvent.setup();
    const aviso = "Tu plan ya no incluye el gallego: si guardas este cambio, no podrás volver a elegirlo sin cambiar de plan.";
    vi.mocked(getCatalogoDeIdiomas).mockResolvedValue(catalogoDelBackendAnterior());
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ languages: principalDelCatalogo("gl-ES").idiomas, voiceLanguage: "gl-ES" });

    await waitFor(() => expect(principal("Gallego")).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText(aviso)).toBeNull();
    await user.click(principal("Español"));
    expect(await screen.findByText(aviso)).toBeInTheDocument();
    await user.click(principal("Gallego"));
    expect(screen.queryByText(aviso)).toBeNull();
  });

  it("cambiar de lengua local ya no avisa del plan, tampoco en Inicio", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ languages: principalDelCatalogo("gl-ES").idiomas, voiceLanguage: "gl-ES" });

    await user.click(await waitFor(() => principal("Español")));
    expect(await screen.findByText(HABLA_SIETE)).toBeInTheDocument();
    expect(screen.queryByText(/Tu plan ya no incluye/)).toBeNull();
  });

  it("con cambios sin guardar, el candado pregunta antes de ir a los planes", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderizar();

    await waitFor(() => expect(candadoDeVoces()).toBeInTheDocument());
    await user.click(within(screen.getByRole("radiogroup", { name: "Tono de voz" })).getByRole("radio", { name: /^Ágil/ }));
    // fireEvent devuelve false si el clic se canceló (no navega).
    expect(fireEvent.click(candadoDeVoces())).toBe(false);
    expect(confirmar).toHaveBeenCalledWith(CONFIRMACION_IR_A_LOS_PLANES);
    expect(screen.getByRole("button", { name: /Guardar/ })).toBeInTheDocument();

    confirmar.mockReturnValue(true);
    expect(fireEvent.click(candadoDeVoces())).toBe(true);
    confirmar.mockRestore();
  });

  it("sin cambios, el candado va a los planes sin preguntar", async () => {
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    const confirmar = vi.spyOn(window, "confirm");
    renderizar();

    await waitFor(() => expect(candadoDeVoces()).toBeInTheDocument());
    // Sin router de Next en el test, el clic no navega pero tampoco se cancela.
    candadoDeVoces().addEventListener("click", (evento) => evento.preventDefault(), { once: true });
    fireEvent.click(candadoDeVoces());
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it("al cambiar el principal no enseña los avisos ni el saludo del anterior mientras llega su vista previa", async () => {
    const user = userEvent.setup();
    renderizar({ languages: IDIOMAS_CON_CATALAN, voiceLanguage: "ca-ES" });

    expect(await screen.findByText(AVISO_DE_COOFICIAL)).toBeInTheDocument();
    expect(screen.getByText("«Saludo en ca-ES»")).toBeInTheDocument();
    let llegar = () => {};
    vi.mocked(previsualizarIdiomas).mockImplementation(
      (seleccion) =>
        new Promise((resolve) => {
          llegar = () => resolve(vistaPrevia(seleccion));
        })
    );
    await user.click(principal("Español"));

    // La entradilla del catálogo, al momento; nada del catalán.
    expect(screen.getByText(HABLA_SIETE)).toBeInTheDocument();
    expect(screen.queryByText(AVISO_DE_COOFICIAL)).toBeNull();
    expect(screen.queryByText("«Saludo en ca-ES»")).toBeNull();
    llegar();
    expect(await screen.findByText("«Saludo en es-ES»")).toBeInTheDocument();
  });

  it("con languages guardados de antes, ir a otro principal y volver no deja nada que guardar", async () => {
    const user = userEvent.setup();
    renderizar({ languages: ["es-ES"] });

    await user.click(await waitFor(() => principal("Catalán")));
    expect(screen.getByRole("button", { name: /Guardar/ })).toBeInTheDocument();
    await user.click(principal("Español"));

    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
  });

  // Vercel publica la app antes de que Cloud Run sirva el backend nuevo: en
  // ese rato el catálogo, la vista previa y el plan llegan con la forma
  // anterior (sin idiomas, entradilla, requiere, tipo ni familia; con
  // «voz_idioma»).
  it("con el catálogo del backend anterior pinta sin romperse y deja cambiar el principal", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["voz_idioma"] } as never);
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
          entradilla: "Saluda en español y sigue en el idioma de quien llama.",
          saludo: "",
          avisos: [],
        }) as never
    );
    renderizar({ languages: ["es-ES", "en-GB"] });

    await waitFor(() => expect(voz("Blanca")).toHaveAttribute("aria-checked", "true"));
    // Sin la entradilla del catálogo, la de la vista previa.
    expect(screen.getByText("Saluda en español y sigue en el idioma de quien llama.")).toBeInTheDocument();
    await user.click(principal("Catalán"));

    expect(principal("Catalán")).toHaveAttribute("aria-checked", "true");
    // Sin `idiomas` en el catálogo: el obligatorio y el principal, que el
    // backend anterior acepta.
    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ languages: ["es-ES", "ca-ES"], voiceLanguage: "ca-ES" })
    );
    await waitFor(() => expect(voz("Marta")).toHaveAttribute("aria-checked", "true"));
  });
});

describe("ComportamientoMovil — la voz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: ["elegir_voz"] } as never);
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

  it("con un principal cooficial atienden Marta y Sergio, sin voces desactivadas", async () => {
    renderizar({ languages: IDIOMAS_CON_CATALAN, voiceLanguage: "ca-ES" });

    await waitFor(() => expect(voz("Marta")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(2);
    expect(voz("Marta")).toBeEnabled();
    expect(voz("Sergio")).toBeEnabled();
    expect(voz("Sergio")).toHaveTextContent("Sergio");
    expect(screen.queryByText(/habla todos los idiomas|no habla/)).toBeNull();
  });

  it("cambiar el principal conserva la voz elegida: atiende la de su género y, al volver, vuelve la elegida", async () => {
    const user = userEvent.setup();
    renderizar({ voz: MARCOS, voiceGender: "masculina" });

    await user.click(await waitFor(() => principal("Catalán")));

    expect(previsualizarIdiomas).toHaveBeenLastCalledWith(
      expect.objectContaining({ voiceLanguage: "ca-ES", voz: MARCOS, voiceGender: "masculina" })
    );
    await waitFor(() => expect(voz("Sergio")).toHaveAttribute("aria-checked", "true"));

    // De vuelta al español: Marcos otra vez, y nada que guardar.
    await user.click(principal("Español"));
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

  it("con Marta y Sergio (principal cooficial) ninguna lleva «Por defecto»", async () => {
    renderizar({ languages: IDIOMAS_CON_CATALAN, voiceLanguage: "ca-ES" });

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

  // Decisión del usuario del 2026-10-07: Pro se diferencia por la voz.
  it("en Inicio, Mujer u Hombre y la voz por defecto de cada uno, con su muestra; el resto, con candado a los planes", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar();

    await waitFor(() => expect(candadoDeVoces()).toBeInTheDocument());
    expect(candadoDeVoces()).toHaveAttribute("href", "/ajustes/facturacion");
    expect(candadoDeVoces()).toHaveTextContent("Elegir entre las 29 voces: planes Pro y Scale");
    expect(screen.queryByRole("button", { name: /Ver todas las voces/ })).toBeNull();
    expect(within(voces()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
      "BlancaPor defectoCálida y acogedora",
    ]);
    expect(voz("Blanca")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Escuchar a Blanca" })).toBeInTheDocument();

    await user.click(genero("Hombre"));
    expect(within(voces()).getAllByRole("radio")).toHaveLength(1);
    expect(voz("Marcos")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Escuchar a Marcos" })).toBeInTheDocument();
    expect(candadoDeVoces()).toBeInTheDocument();
  });

  it("en Inicio, el candado dice cuántas voces tiene cada idioma, y con Marta y Sergio no hay candado", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ voiceLanguage: "en-GB" });

    await waitFor(() => expect(voz("Lucy")).toHaveAttribute("aria-checked", "true"));
    expect(candadoDeVoces()).toHaveTextContent("Elegir entre las 40 voces: planes Pro y Scale");

    await user.click(principal("Catalán"));
    await waitFor(() => expect(within(voces()).getAllByRole("radio")).toHaveLength(2));
    expect(voz("Marta")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("link", { name: /^Elegir entre/ })).toBeNull();
  });

  it("en Inicio, la voz que ya tenía elegida se conserva a la vista; cambiarla avisa de que no podrá volver a ella", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    renderizar({ voz: idDe("es-ES", "Lara") });

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
      "BlancaPor defectoCálida y acogedora",
      expect.stringMatching(/^Lara/),
    ]);
    expect(screen.queryByText(AVISO_PIERDE_LARA)).toBeNull();

    await user.click(voz("Blanca"));
    expect(await screen.findByText(AVISO_PIERDE_LARA)).toBeInTheDocument();
    // Lara sigue a la vista para volver a ella.
    await user.click(voz("Lara"));
    expect(screen.queryByText(AVISO_PIERDE_LARA)).toBeNull();

    await user.click(genero("Hombre"));
    expect(await screen.findByText(AVISO_PIERDE_LARA)).toBeInTheDocument();
    await user.click(genero("Mujer"));
    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    expect(screen.queryByText(AVISO_PIERDE_LARA)).toBeNull();
    expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull();
  });

  // Revisión del 2026-10-07: tras guardar Marcos, volver a Mujer recuperaba
  // a Lara (la recordada), que ya no se puede elegir: salía marcada, sin
  // aviso, y el backend respondía 403 al guardar.
  it("en Inicio, tras guardar otra voz, volver al género de la conservada atiende la de por defecto", async () => {
    const user = userEvent.setup();
    vi.mocked(getBillingSummary).mockResolvedValue({ planFeatures: [] } as never);
    vi.mocked(updateMyBusiness).mockResolvedValue({ id: "biz_1" } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const arbol = (agentSettings: Partial<AgentSettings>) => (
      <QueryClientProvider client={queryClient}>
        <ComportamientoMovil business={{ id: "biz_1", agentSettings: { ...DEFAULT_AGENT_SETTINGS, ...agentSettings } } as Business} />
      </QueryClientProvider>
    );
    const { rerender } = render(arbol({ voz: idDe("es-ES", "Lara") }));

    await waitFor(() => expect(voz("Lara")).toHaveAttribute("aria-checked", "true"));
    await user.click(genero("Hombre"));
    expect(await screen.findByText(AVISO_PIERDE_LARA)).toBeInTheDocument();
    // Guardado: el negocio vuelve con Marcos (sin voz elegida).
    rerender(arbol({ voiceGender: "masculina" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Guardar/ })).toBeNull());
    await user.click(genero("Mujer"));

    await waitFor(() => expect(voz("Blanca")).toHaveAttribute("aria-checked", "true"));
    expect(within(voces()).getAllByRole("radio").map((opcion) => opcion.textContent)).toEqual([
      "BlancaPor defectoCálida y acogedora",
    ]);
    await user.click(screen.getByRole("button", { name: /Guardar/ }));
    expect(vi.mocked(updateMyBusiness).mock.calls[0][0].agentSettings).toMatchObject({ voiceGender: "femenina" });
    expect(vi.mocked(updateMyBusiness).mock.calls[0][0].agentSettings?.voz).not.toBe(idDe("es-ES", "Lara"));
  });

  it("en Pro, cambiar la voz elegida no avisa de nada del plan ni lleva candado", async () => {
    const user = userEvent.setup();
    renderizar({ voz: idDe("es-ES", "Lara") });

    await user.click(await waitFor(() => voz("Blanca")));
    expect(voz("Blanca")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/Tu plan ya no incluye/)).toBeNull();
    expect(screen.queryByRole("link", { name: /^Elegir entre/ })).toBeNull();
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

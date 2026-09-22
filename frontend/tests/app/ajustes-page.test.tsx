import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AjustesCuentaPage from "@/app/ajustes/page";
import AjustesNegocioPage from "@/app/ajustes/negocio/page";
import AjustesTelefonoPage from "@/app/ajustes/telefono/page";
import AjustesSeguridadPage from "@/app/ajustes/seguridad/page";
import { useBusiness } from "@/components/providers";
import {
  getAccountOverview,
  getOnboardingState,
  getOwnerWhatsapp,
  getPhoneNumberInfo,
  updateMyBusiness,
} from "@/lib/api";
import type { AccountOverview } from "@/lib/api";
import type {
  EstadoWhatsappDueno,
  OnboardingState,
  PhoneNumberInfo,
} from "@/lib/types";

const navegacion = { pathname: "/ajustes", replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navegacion.replace, push: vi.fn() }),
  usePathname: () => navegacion.pathname,
}));

vi.mock("@/components/providers", () => ({
  useBusiness: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getAccountOverview: vi.fn(),
  changeAccountPassword: vi.fn(),
  deleteAccount: vi.fn(),
  updateMyBusiness: vi.fn(),
  getOwnerWhatsapp: vi.fn(),
  sendOwnerWhatsappActivation: vi.fn(),
  // Ajustes › Teléfono: estado del desvío, número de Alhabla y comprobación.
  getOnboardingState: vi.fn(),
  getPhoneNumberInfo: vi.fn(),
  confirmForwarding: vi.fn(),
  startForwardingCheck: vi.fn(),
  getForwardingCheck: vi.fn(),
}));

const mockedUseBusiness = vi.mocked(useBusiness);
const mockedGetAccountOverview = vi.mocked(getAccountOverview);
const mockedGetOwnerWhatsapp = vi.mocked(getOwnerWhatsapp);
const mockedGetOnboardingState = vi.mocked(getOnboardingState);
const mockedGetPhoneNumberInfo = vi.mocked(getPhoneNumberInfo);
const mockedUpdateMyBusiness = vi.mocked(updateMyBusiness);

const CLAVE_CUENTA = ["account-overview"];

const NEGOCIO = {
  id: "neg_1",
  name: "Peluquería Lola",
  phone: "+34600111222",
  timezone: "Europe/Madrid",
  address: "Calle Mayor 12, Madrid",
  businessType: "peluqueria",
  subscriptionStatus: "ACTIVE",
} as unknown as ReturnType<typeof useBusiness>["business"];

const ONBOARDING: OnboardingState = {
  steps: {} as OnboardingState["steps"],
  progress: 0,
  dismissedAt: null,
  completedAt: null,
  isActive: true,
  forwarding: {
    status: "ready",
    phoneNumber: "+34930453218",
    confirmedAt: null,
    firstCallAt: null,
    checkedAt: null,
    customerLine: "+34600111222",
  },
};

const NUMERO_DE_ALHABLA: PhoneNumberInfo = {
  phoneNumber: "+34930453218",
  sid: "sid_1",
  purchasedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
};

const CUENTA: AccountOverview = {
  email: "lola@peluquerialola.es",
  passwordConfigured: true,
  googleConnected: false,
};

const ESTADO_WHATSAPP: EstadoWhatsappDueno = {
  ownerWhatsappNumber: null,
  status: "sin_numero",
  optInAt: null,
  optInVia: null,
  optOutAt: null,
  unreachableAt: null,
  activationSentAt: null,
  templateApproved: false,
  canSendTemplate: false,
  alhablaNumber: "+34930453218",
  avisoPorReserva: true,
  alta: {
    code: "7KP3MQ",
    text: "ALTA 7KP3MQ",
    link: "https://wa.me/34930453218?text=ALTA%207KP3MQ",
    expiresAt: "2026-09-27T10:00:00.000Z",
  },
};

function estadoDeNegocio(overrides: Partial<ReturnType<typeof useBusiness>>) {
  mockedUseBusiness.mockReturnValue({
    business: null,
    hasToken: true,
    isLoadingBusiness: false,
    isError: false,
    errorMessage: null,
    ...overrides,
  } as ReturnType<typeof useBusiness>);
}

// Cliente real de React Query (sin reintentos) en vez de un mock de `useQuery`:
// lo que se quiere comprobar es precisamente cómo se comporta la página con
// la semántica real de la caché cuando un refresco falla.
type Pantalla = "cuenta" | "negocio" | "telefono" | "seguridad";
const PAGINAS: Record<Pantalla, { ruta: string; Componente: () => JSX.Element }> = {
  cuenta: { ruta: "/ajustes", Componente: AjustesCuentaPage },
  negocio: { ruta: "/ajustes/negocio", Componente: AjustesNegocioPage },
  telefono: { ruta: "/ajustes/telefono", Componente: AjustesTelefonoPage },
  seguridad: { ruta: "/ajustes/seguridad", Componente: AjustesSeguridadPage },
};

function renderPage(
  pantalla: Pantalla = "cuenta",
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  const { ruta, Componente } = PAGINAS[pantalla];
  navegacion.pathname = ruta;
  render(
    <QueryClientProvider client={queryClient}>
      <Componente />
    </QueryClientProvider>
  );
  return queryClient;
}

describe("Ajustes (cuatro pantallas con el mismo marco)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetOwnerWhatsapp.mockResolvedValue(ESTADO_WHATSAPP);
    mockedGetOnboardingState.mockResolvedValue(ONBOARDING);
    mockedGetPhoneNumberInfo.mockResolvedValue(NUMERO_DE_ALHABLA);
  });

  it("enseña la pantalla de error si la cuenta no llega y no hay nada en caché", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockRejectedValue(new Error("Network Error"));

    renderPage();

    expect(await screen.findByText("No se pudieron cargar los ajustes")).toBeInTheDocument();
    expect(screen.queryByText(CUENTA.email)).not.toBeInTheDocument();
  });

  // React Query conserva los datos en caché cuando un refresco falla (marca
  // error sin soltar `data`). Si la pantalla de error ganara en ese caso, un
  // microcorte de red le borraría los ajustes al usuario que los está mirando.
  it("mantiene los ajustes en pantalla si lo que falla es un refresco con datos ya cargados", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockRejectedValue(new Error("Network Error"));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(CLAVE_CUENTA, CUENTA);

    renderPage("cuenta", queryClient);

    // Al montar, la query ya está caducada y vuelve a pedir la cuenta; hay que
    // esperar a que ese refresco falle de verdad para que la prueba signifique algo.
    await waitFor(() => expect(mockedGetAccountOverview).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryState(CLAVE_CUENTA)?.status).toBe("error"));

    expect(queryClient.getQueryData(CLAVE_CUENTA)).toEqual(CUENTA);
    expect(screen.getByText(CUENTA.email)).toBeInTheDocument();
    expect(screen.queryByText("No se pudieron cargar los ajustes")).not.toBeInTheDocument();
  });

  it("pinta los ajustes con normalidad cuando la cuenta carga bien", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);

    renderPage();

    expect(await screen.findByText(CUENTA.email)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
    // Las pestañas llevan a las cuatro pantallas; la actual va marcada.
    const pestanas = within(screen.getByRole("navigation", { name: "Secciones de ajustes" }));
    expect(pestanas.getByRole("link", { name: "Cuenta" })).toHaveAttribute("aria-current", "page");
    expect(pestanas.getByRole("link", { name: "Negocio" })).toHaveAttribute("href", "/ajustes/negocio");
    expect(pestanas.getByRole("link", { name: "Teléfono" })).toHaveAttribute("href", "/ajustes/telefono");
    expect(pestanas.getByRole("link", { name: "Seguridad" })).toHaveAttribute("href", "/ajustes/seguridad");
    // La pantalla de Cuenta es corta: ni negocio, ni teléfono, ni contraseña.
    expect(screen.queryByRole("region", { name: "Datos del negocio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Teléfono" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Contraseña" })).not.toBeInTheDocument();
  });

  it("un enlace antiguo a /ajustes#whatsapp reenvía a la pantalla de Teléfono conservando el ancla", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);
    window.location.hash = "#whatsapp";

    renderPage("cuenta");

    await waitFor(() => expect(navegacion.replace).toHaveBeenCalledWith("/ajustes/telefono#whatsapp"));
    window.location.hash = "";
  });

  it("Seguridad reúne la contraseña y la eliminación de la cuenta", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);

    renderPage("seguridad");

    expect(await screen.findByRole("region", { name: "Contraseña" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Eliminar la cuenta" })).toBeInTheDocument();
    expect(screen.queryByText(CUENTA.email)).not.toBeInTheDocument();
  });

  it("no pinta nada mientras carga", () => {
    estadoDeNegocio({ isLoadingBusiness: true });

    renderPage();

    expect(screen.getByText("Cargando ajustes…")).toBeInTheDocument();
  });

  it("la pantalla «Teléfono» trae los tres bloques en orden, con «Tu móvil» en el ancla #whatsapp", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);

    renderPage("telefono");

    await screen.findByRole("region", { name: "Teléfono" });
    expect(screen.queryByRole("region", { name: "WhatsApp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Datos del negocio" })).not.toBeInTheDocument();
    // Los tres bloques del plan (PLAN-TELEFONIA-UX.md § 5, fase 2), en orden.
    const linea = screen.getByRole("group", { name: "Línea de clientes" });
    const recepcionista = screen.getByRole("group", { name: "Tu recepcionista" });
    const movil = screen.getByRole("group", { name: "Tu móvil" });
    expect(linea.compareDocumentPosition(recepcionista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(recepcionista.compareDocumentPosition(movil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // La checklist del panel y el asistente enlazan a /ajustes/telefono#whatsapp.
    expect(movil).toHaveAttribute("id", "whatsapp");
    expect(await screen.findByLabelText(/Tu móvil con WhatsApp/)).toBeInTheDocument();
    expect(mockedGetOwnerWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("«Datos del negocio» se queda con nombre, dirección y sector; el teléfono vive en «Línea de clientes»", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);

    renderPage("negocio");

    expect(await screen.findByLabelText(/Nombre del negocio/)).toHaveAttribute("maxLength", "80");
    expect(screen.queryByLabelText(/Teléfono del negocio/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Teléfono móvil para avisos/)).not.toBeInTheDocument();
    const negocio = within(screen.getByRole("region", { name: "Datos del negocio" }));
    expect(negocio.getByLabelText(/Dirección/)).toHaveValue("Calle Mayor 12, Madrid");
    expect(negocio.getByLabelText(/Sector/)).toHaveValue("peluqueria");
    expect(negocio.queryByRole("textbox", { name: /Número al que te llaman/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Línea de clientes" })).not.toBeInTheDocument();
  });

  it("la línea de clientes vive en la pantalla «Teléfono»", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);

    renderPage("telefono");

    const linea = within(await screen.findByRole("group", { name: "Línea de clientes" }));
    expect(linea.getByLabelText(/Número al que te llaman tus clientes/)).toHaveValue(NEGOCIO!.phone);
  });

  describe("guardar los datos del negocio", () => {
    async function guardarDatos(cambios: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
      const user = userEvent.setup();
      estadoDeNegocio({ business: NEGOCIO });
      mockedGetAccountOverview.mockResolvedValue(CUENTA);
      mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO as never);
      renderPage("negocio");
      await screen.findByLabelText(/Nombre del negocio/);
      await cambios(user);
      await user.click(screen.getByRole("button", { name: /Guardar datos/ }));
      await waitFor(() => expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1));
      return mockedUpdateMyBusiness.mock.calls[0][0];
    }

    it("sin cambiar dirección ni sector solo manda el nombre (el sector resincroniza el agente)", async () => {
      const body = await guardarDatos(async (user) => {
        const nombre = screen.getByLabelText(/Nombre del negocio/);
        await user.clear(nombre);
        await user.type(nombre, "Lola Peluquería");
      });

      expect(body).toEqual({ name: "Lola Peluquería" });
      expect(await screen.findByText("Datos del negocio actualizados.")).toBeInTheDocument();
    });

    it("manda la dirección y el sector cuando cambian, y la dirección vacía como null", async () => {
      const body = await guardarDatos(async (user) => {
        await user.clear(screen.getByLabelText(/Dirección/));
        await user.selectOptions(screen.getByLabelText(/Sector/), "barberia");
      });

      expect(body).toEqual({
        name: "Peluquería Lola",
        address: null,
        businessType: "barberia",
      });
    });
  });

  describe("cambiar la línea de clientes y el tipo de línea", () => {
    async function guardarTelefono(
      negocio: Record<string, unknown>,
      telefonoNuevo: string
    ) {
      const user = userEvent.setup();
      estadoDeNegocio({
        business: { ...NEGOCIO, ...negocio } as ReturnType<typeof useBusiness>["business"],
      });
      mockedGetAccountOverview.mockResolvedValue(CUENTA);
      mockedUpdateMyBusiness.mockResolvedValue({ ...NEGOCIO, ...negocio, phone: telefonoNuevo } as never);
      renderPage("telefono");

      const campo = await screen.findByLabelText(/Número al que te llaman tus clientes/);
      await user.clear(campo);
      await user.type(campo, telefonoNuevo);
      await user.click(screen.getByRole("button", { name: /Guardar línea/ }));
      await waitFor(() => expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1));
      return mockedUpdateMyBusiness.mock.calls[0][0];
    }

    it("si el fijo pasa a ser un móvil, deja el tipo en null para que la tarjeta de desvío vuelva a preguntar", async () => {
      const body = await guardarTelefono(
        { phone: "+34930111222", customerLineType: "fijo" },
        "+34600123456"
      );

      expect(body).toEqual({ phone: "+34600123456", customerLineType: null });
    });

    it("si el móvil pasa a ser un fijo, corrige el tipo a «fijo»", async () => {
      const body = await guardarTelefono(
        { phone: "+34600111222", customerLineType: "movil_personal" },
        "+34930111222"
      );

      expect(body).toEqual({ phone: "+34930111222", customerLineType: "fijo" });
    });

    it("con un número de la misma naturaleza no manda customerLineType", async () => {
      const body = await guardarTelefono(
        { phone: "+34600111222", customerLineType: "movil_trabajo" },
        "+34600999888"
      );

      expect(body).toEqual({ phone: "+34600999888" });
    });
  });
});

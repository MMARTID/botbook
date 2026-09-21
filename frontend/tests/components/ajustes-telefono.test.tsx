import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AjustesTelefono,
  AVISO_FALTA_NUMERO,
  AVISO_LINEA_PARECE_MOVIL,
  CONFIRMACION_CAMBIO_DE_MOVIL,
  CONFIRMACION_NUMERO_PRINCIPAL,
  TEXTO_ALHABLA_PRINCIPAL,
} from "@/components/ajustes-telefono";
import {
  getOnboardingState,
  getOwnerWhatsapp,
  getPhoneNumberInfo,
  sendOwnerWhatsappActivation,
  updateMyBusiness,
} from "@/lib/api";
import type {
  Business,
  EstadoWhatsappDueno,
  OnboardingState,
  PhoneNumberInfo,
} from "@/lib/types";

vi.mock("@/lib/api", () => ({
  confirmForwarding: vi.fn(),
  getForwardingCheck: vi.fn(),
  getOnboardingState: vi.fn(),
  getOwnerWhatsapp: vi.fn(),
  getPhoneNumberInfo: vi.fn(),
  sendOwnerWhatsappActivation: vi.fn(),
  startForwardingCheck: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const mockedOnboarding = vi.mocked(getOnboardingState);
const mockedPhone = vi.mocked(getPhoneNumberInfo);
const mockedOwnerWhatsapp = vi.mocked(getOwnerWhatsapp);
const mockedUpdate = vi.mocked(updateMyBusiness);
const mockedSendActivation = vi.mocked(sendOwnerWhatsappActivation);

const NUMERO_DE_ALHABLA = "+34930453218";

function negocio(overrides: Partial<Business> = {}): Business {
  return {
    id: "neg_1",
    name: "Peluquería Lola",
    phone: "+34931112233",
    timezone: "Europe/Madrid",
    schedule: {},
    plan: "pro",
    active: true,
    bookingCapacity: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    subscriptionStatus: "ACTIVE",
    customerLineType: "fijo",
    ownerPhoneIsCustomerLine: false,
    hideOwnerNumberFromClients: false,
    ownerWhatsappNumber: null,
    ...overrides,
  };
}

function onboarding(
  forwarding: Partial<OnboardingState["forwarding"]> = {}
): OnboardingState {
  return {
    steps: {} as OnboardingState["steps"],
    progress: 0,
    dismissedAt: null,
    completedAt: null,
    isActive: true,
    forwarding: {
      status: "ready",
      phoneNumber: NUMERO_DE_ALHABLA,
      confirmedAt: null,
      firstCallAt: null,
      checkedAt: null,
      customerLine: "+34931112233",
      ...forwarding,
    },
  };
}

function telefono(overrides: Partial<PhoneNumberInfo> = {}): PhoneNumberInfo {
  return {
    phoneNumber: NUMERO_DE_ALHABLA,
    sid: "sid_1",
    purchasedAt: "2026-09-01T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

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
  alhablaNumber: NUMERO_DE_ALHABLA,
  avisoPorReserva: true,
  alta: null,
};

function renderSeccion(business: Business) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["my-business"], business);
  render(
    <QueryClientProvider client={queryClient}>
      <AjustesTelefono business={business} hasToken={true} />
    </QueryClientProvider>
  );
  return queryClient;
}

function bloque(nombre: string) {
  return within(screen.getByRole("group", { name: nombre }));
}

describe("AjustesTelefono", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedOnboarding.mockResolvedValue(onboarding());
    mockedPhone.mockResolvedValue(telefono());
    mockedOwnerWhatsapp.mockResolvedValue(ESTADO_WHATSAPP);
    mockedUpdate.mockImplementation(async (payload) => ({
      ...negocio(),
      ...(payload as Partial<Business>),
    }));
    mockedSendActivation.mockResolvedValue({
      ...ESTADO_WHATSAPP,
      sent: "template",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cuenta los tres números en orden: línea de clientes, recepcionista y móvil", async () => {
    renderSeccion(negocio());

    expect(
      screen.getByRole("region", { name: "Teléfono" })
    ).toBeInTheDocument();
    const linea = screen.getByRole("group", { name: "Línea de clientes" });
    const recepcionista = screen.getByRole("group", {
      name: "Tu recepcionista",
    });
    const movil = screen.getByRole("group", { name: "Tu móvil" });
    expect(
      linea.compareDocumentPosition(recepcionista) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      recepcionista.compareDocumentPosition(movil) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // La checklist del panel y el Gestor enlazan a /ajustes#whatsapp.
    expect(movil).toHaveAttribute("id", "whatsapp");
    expect(
      await screen.findByLabelText(/Tu móvil con WhatsApp/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Teléfono del negocio" })
    ).not.toBeInTheDocument();
  });

  describe("Línea de clientes", () => {
    it("enseña el número y el tipo guardados, el estado «sin comprobar» y los códigos del fijo", async () => {
      renderSeccion(negocio());

      expect(
        screen.getByLabelText(/Número al que te llaman tus clientes/)
      ).toHaveValue("+34931112233");
      expect(
        screen.getByRole("radio", { name: /El fijo del local/ })
      ).toBeChecked();
      expect(await screen.findByText("Sin comprobar")).toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: "Comprobar desvío" })
      ).toBeInTheDocument();
      // Fijo: sin «**» y solo «si no contestas» y «todas».
      expect(
        screen.getByRole("button", {
          name: `Copiar el código *61*${NUMERO_DE_ALHABLA}#`,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: `Copiar el código *21*${NUMERO_DE_ALHABLA}#`,
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: `Copiar el código **61*${NUMERO_DE_ALHABLA}#`,
        })
      ).not.toBeInTheDocument();
      expect(screen.getByText(/contestador/)).toBeInTheDocument();
    });

    it("con la comprobación hecha dice cuándo", async () => {
      mockedOnboarding.mockResolvedValue(
        onboarding({
          checkedAt: "2026-09-21T10:30:00.000Z",
          status: "done",
        })
      );
      renderSeccion(negocio());

      expect(await screen.findByText(/Comprobado el /)).toBeInTheDocument();
      expect(screen.queryByText("Sin comprobar")).not.toBeInTheDocument();
    });

    it("con tipo sin confirmar no hay tarjeta marcada ni códigos, pero sí se puede comprobar", async () => {
      renderSeccion(negocio({ customerLineType: null }));

      // La cuarta tarjeta aparece en cuanto se sabe que hay número activo.
      expect(
        await screen.findByRole("radio", { name: /quiero usar el de Alhabla/ })
      ).not.toBeChecked();
      for (const nombre of [
        /El fijo del local/,
        /Un móvil de trabajo/,
        /Mi móvil personal/,
      ]) {
        expect(screen.getByRole("radio", { name: nombre })).not.toBeChecked();
      }
      expect(
        await screen.findByRole("button", { name: "Comprobar desvío" })
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Elige el tipo de línea y guarda/)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Copiar el código/ })
      ).not.toBeInTheDocument();
    });

    it("guarda el tipo elegido sin tocar el número si no cambió", async () => {
      const user = userEvent.setup();
      const queryClient = renderSeccion(negocio({ customerLineType: null }));

      const guardar = screen.getByRole("button", { name: "Guardar línea" });
      expect(guardar).toBeDisabled();
      await user.click(
        screen.getByRole("radio", { name: /El fijo del local/ })
      );
      await user.click(guardar);

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({ customerLineType: "fijo" });
      expect(
        await screen.findByText("Línea de clientes guardada.")
      ).toBeInTheDocument();
      expect(
        (queryClient.getQueryData(["my-business"]) as Business).customerLineType
      ).toBe("fijo");
    });

    it("al escribir un móvil sobre un fijo deja el tipo sin confirmar y lo manda como null", async () => {
      const user = userEvent.setup();
      renderSeccion(negocio());

      const campo = screen.getByLabelText(
        /Número al que te llaman tus clientes/
      );
      await user.clear(campo);
      await user.type(campo, "600 123 456");
      expect(
        screen.getByRole("radio", { name: /El fijo del local/ })
      ).not.toBeChecked();
      await user.click(screen.getByRole("button", { name: "Guardar línea" }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        phone: "+34600123456",
        customerLineType: null,
      });
    });

    it("al escribir un fijo sobre un móvil corrige el tipo a «fijo»", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({ phone: "+34600111222", customerLineType: "movil_personal" })
      );

      const campo = screen.getByLabelText(
        /Número al que te llaman tus clientes/
      );
      await user.clear(campo);
      await user.type(campo, "+34930111222");
      expect(
        screen.getByRole("radio", { name: /El fijo del local/ })
      ).toBeChecked();
      await user.click(screen.getByRole("button", { name: "Guardar línea" }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        phone: "+34930111222",
        customerLineType: "fijo",
      });
    });

    it("avisa si el tipo elegido a mano no cuadra con el número, sin bloquear", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({ phone: "+34600111222", customerLineType: "movil_trabajo" })
      );

      await user.click(
        screen.getByRole("radio", { name: /El fijo del local/ })
      );
      expect(screen.getByText(AVISO_LINEA_PARECE_MOVIL)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Guardar línea" })
      ).toBeEnabled();
    });

    it("rechaza un número que no se entiende", async () => {
      const user = userEvent.setup();
      renderSeccion(negocio());

      const campo = screen.getByLabelText(
        /Número al que te llaman tus clientes/
      );
      await user.clear(campo);
      await user.type(campo, "12345");
      expect(campo).toHaveAttribute("aria-invalid", "true");
      expect(
        screen.getByRole("button", { name: "Guardar línea" })
      ).toBeDisabled();
    });

    it("con Alhabla como principal no pide número ni enseña desvío, y dice qué número se da a los clientes", async () => {
      renderSeccion(
        negocio({ customerLineType: "alhabla", phone: NUMERO_DE_ALHABLA })
      );

      expect(screen.getByText(TEXTO_ALHABLA_PRINCIPAL)).toBeInTheDocument();
      expect(
        screen.getByText(/Número que tu recepcionista da a tus clientes/)
      ).toHaveTextContent("+34 930 45 32 18");
      expect(
        screen.queryByText(/Sigue siendo tu línea antigua/)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText(/Número al que te llaman tus clientes/)
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Guardar línea" })
      ).toBeDisabled();
      expect(
        screen.queryByText("Desvío a tu recepcionista")
      ).not.toBeInTheDocument();
      await waitFor(() => expect(mockedOnboarding).toHaveBeenCalled());
      expect(
        screen.queryByRole("button", { name: "Comprobar desvío" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", {
          name: /No des mi número a los clientes/,
        })
      ).not.toBeInTheDocument();
    });

    it("sin línea guardada pide el número antes de poder comprobar", async () => {
      mockedOnboarding.mockResolvedValue(onboarding({ customerLine: null }));
      renderSeccion(negocio({ phone: "TEMP-neg_1", customerLineType: null }));

      expect(
        screen.getByLabelText(/Número al que te llaman tus clientes/)
      ).toHaveValue("");
      expect(
        await screen.findByText(/Guarda arriba el número/)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Comprobar desvío" })
      ).not.toBeInTheDocument();
    });

    it("elegir un tipo con línea propia exige el número: sin él no se guarda y se explica", async () => {
      const user = userEvent.setup();
      mockedOnboarding.mockResolvedValue(onboarding({ customerLine: null }));
      renderSeccion(negocio({ phone: "TEMP-neg_1", customerLineType: null }));

      await user.click(
        screen.getByRole("radio", { name: /Mi móvil personal/ })
      );

      expect(screen.getByText(AVISO_FALTA_NUMERO)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Guardar línea" })
      ).toBeDisabled();

      await user.type(
        screen.getByLabelText(/Número al que te llaman tus clientes/),
        "600 111 222"
      );
      await user.click(screen.getByRole("button", { name: "Guardar línea" }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        phone: "+34600111222",
        customerLineType: "movil_personal",
      });
    });

    it("la tarjeta «quiero usar el de Alhabla» guarda el número de Alhabla como teléfono del negocio", async () => {
      const user = userEvent.setup();
      renderSeccion(negocio());

      await user.click(
        await screen.findByRole("radio", { name: /quiero usar el de Alhabla/ })
      );
      expect(
        screen.getByText(/Al guardar, tu teléfono pasará a ser el/)
      ).toHaveTextContent("+34 930 45 32 18");
      await user.click(screen.getByRole("button", { name: "Guardar línea" }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        phone: NUMERO_DE_ALHABLA,
        customerLineType: "alhabla",
      });
    });

    it("sin número de Alhabla activo no ofrece la tarjeta «quiero usar el de Alhabla»", async () => {
      mockedPhone.mockResolvedValue(
        telefono({ phoneNumber: null, status: null, sid: null })
      );
      mockedOnboarding.mockResolvedValue(
        onboarding({ status: "waiting_number", phoneNumber: null })
      );
      renderSeccion(negocio({ subscriptionStatus: null }));

      await waitFor(() => expect(mockedPhone).toHaveBeenCalled());
      expect(
        screen.getByRole("radio", { name: /El fijo del local/ })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("radio", { name: /quiero usar el de Alhabla/ })
      ).not.toBeInTheDocument();
    });

    it("con Alhabla como principal pero la línea antigua aún como teléfono, avisa y «Guardar línea» lo corrige", async () => {
      const user = userEvent.setup();
      renderSeccion(negocio({ customerLineType: "alhabla" }));

      expect(
        await screen.findByText(/Sigue siendo tu línea antigua/)
      ).toBeInTheDocument();
      const guardar = screen.getByRole("button", { name: "Guardar línea" });
      await waitFor(() => expect(guardar).toBeEnabled());
      await user.click(guardar);

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({ phone: NUMERO_DE_ALHABLA });
    });

    it("al dejar Alhabla como principal, el campo del número empieza vacío (el de Alhabla no es una línea que desviar)", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({ customerLineType: "alhabla", phone: NUMERO_DE_ALHABLA })
      );

      await user.click(
        await screen.findByRole("radio", { name: /El fijo del local/ })
      );

      expect(
        screen.getByLabelText(/Número al que te llaman tus clientes/)
      ).toHaveValue("");
      expect(
        screen.getByRole("button", { name: "Guardar línea" })
      ).toBeDisabled();
    });

    it("cambiar la línea con «es el mismo móvil» marcado apaga esa casilla y deja los avisos donde estaban", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({
          phone: "+34600111222",
          customerLineType: "movil_personal",
          ownerPhoneIsCustomerLine: true,
          ownerWhatsappNumber: "+34600111222",
        })
      );

      const campo = screen.getByLabelText(
        /Número al que te llaman tus clientes/
      );
      await user.clear(campo);
      await user.type(campo, "+34600999888");
      await user.click(screen.getByRole("button", { name: "Guardar línea" }));

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        phone: "+34600999888",
        ownerPhoneIsCustomerLine: false,
      });
      expect(
        await screen.findByText(/Los avisos siguen yendo al \+34 600 11 12 22/)
      ).toBeInTheDocument();
    });
  });

  describe("Tu recepcionista", () => {
    it("enseña el número de Alhabla activo, el enlace a la recepcionista y permite usarlo como principal", async () => {
      const user = userEvent.setup();
      const queryClient = renderSeccion(negocio());

      expect(
        await bloque("Tu recepcionista").findByText("+34 930 45 32 18")
      ).toBeInTheDocument();
      expect(
        bloque("Tu recepcionista").getByText("Activo")
      ).toBeInTheDocument();
      expect(
        bloque("Tu recepcionista").getByRole("link", {
          name: /Configurar la recepcionista/,
        })
      ).toHaveAttribute("href", "/agente");

      await user.click(
        screen.getByRole("button", { name: /Usar como número principal/ })
      );

      expect(window.confirm).toHaveBeenCalledWith(
        CONFIRMACION_NUMERO_PRINCIPAL
      );
      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      // El teléfono del negocio pasa a ser el de Alhabla: es el que la
      // recepcionista dice y pone en los mensajes al cliente.
      expect(mockedUpdate).toHaveBeenCalledWith({
        customerLineType: "alhabla",
        phone: NUMERO_DE_ALHABLA,
      });
      expect(
        await screen.findByText(/ya es tu número principal/)
      ).toBeInTheDocument();
      const guardado = queryClient.getQueryData(["my-business"]) as Business;
      expect(guardado.customerLineType).toBe("alhabla");
      expect(guardado.phone).toBe(NUMERO_DE_ALHABLA);
    });

    it("si los avisos iban a la línea de clientes, usar Alhabla como principal apaga «es el mismo»", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({
          phone: "+34600111222",
          customerLineType: "movil_personal",
          ownerPhoneIsCustomerLine: true,
          ownerWhatsappNumber: "+34600111222",
        })
      );

      await user.click(
        await screen.findByRole("button", {
          name: /Usar como número principal/,
        })
      );

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        customerLineType: "alhabla",
        phone: NUMERO_DE_ALHABLA,
        ownerPhoneIsCustomerLine: false,
      });
    });

    it("si el dueño no confirma, no cambia nada", async () => {
      const user = userEvent.setup();
      vi.mocked(window.confirm).mockReturnValue(false);
      renderSeccion(negocio());

      await user.click(
        await screen.findByRole("button", {
          name: /Usar como número principal/,
        })
      );

      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("cuando ya es el principal lo dice y no ofrece el botón", async () => {
      renderSeccion(negocio({ customerLineType: "alhabla" }));

      expect(
        await bloque("Tu recepcionista").findByText(/Es tu número principal/)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Usar como número principal/ })
      ).not.toBeInTheDocument();
    });

    it("sin número de Alhabla explica por qué y no ofrece desvío ni número principal", async () => {
      mockedPhone.mockResolvedValue(
        telefono({ phoneNumber: null, status: null, sid: null })
      );
      mockedOnboarding.mockResolvedValue(
        onboarding({ status: "waiting_number", phoneNumber: null })
      );
      renderSeccion(negocio({ subscriptionStatus: null }));

      expect(
        await bloque("Tu recepcionista").findByText("Necesita un plan activo")
      ).toBeInTheDocument();
      expect(
        bloque("Tu recepcionista").getByRole("link", { name: "Elegir plan" })
      ).toHaveAttribute("href", "/ajustes/facturacion");
      expect(
        screen.queryByRole("button", { name: /Usar como número principal/ })
      ).not.toBeInTheDocument();
      expect(await screen.findByText(/se está activando/)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Comprobar desvío" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Copiar el código/ })
      ).not.toBeInTheDocument();
    });
  });

  describe("Tu móvil", () => {
    it("con un fijo no pregunta si es el mismo móvil, pero sí la privacidad", async () => {
      const user = userEvent.setup();
      renderSeccion(negocio());

      expect(
        screen.queryByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      ).not.toBeInTheDocument();
      const privacidad = screen.getByRole("checkbox", {
        name: /No des mi número a los clientes/,
      });
      expect(privacidad).not.toBeChecked();

      await user.click(privacidad);

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        hideOwnerNumberFromClients: true,
      });
      expect(await screen.findByText(/no dará tu número/)).toBeInTheDocument();
    });

    it("con un móvil, marcar «es el mismo» manda los avisos a la línea de clientes", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({ phone: "+34600111222", customerLineType: "movil_personal" })
      );

      await user.click(
        screen.getByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      );

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        ownerPhoneIsCustomerLine: true,
        ownerWhatsappNumber: "+34600111222",
      });
      // Sin otro móvil guardado no hay nada que confirmar.
      expect(window.confirm).not.toHaveBeenCalled();
      // Como en el alta y en «Guardar y activar»: se pide la plantilla.
      await waitFor(() =>
        expect(mockedSendActivation).toHaveBeenCalledTimes(1)
      );
      expect(
        await screen.findByText(
          /Los avisos irán al \+34 600 11 12 22\. Te hemos enviado un WhatsApp/
        )
      ).toBeInTheDocument();
      // El bloque de WhatsApp vuelve a pedir su estado: el móvil ha cambiado.
      await waitFor(() => expect(mockedOwnerWhatsapp).toHaveBeenCalledTimes(2));
    });

    it("si la plantilla no sale, dice cómo activarlo desde el móvil", async () => {
      const user = userEvent.setup();
      mockedSendActivation.mockResolvedValue({
        ...ESTADO_WHATSAPP,
        sent: "link",
      });
      renderSeccion(
        negocio({ phone: "+34600111222", customerLineType: "movil_personal" })
      );

      await user.click(
        screen.getByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      );

      expect(
        await screen.findByText(
          /Los avisos irán al \+34 600 11 12 22\. Actívalos desde ese móvil/
        )
      ).toBeInTheDocument();
    });

    it("la casilla pinta la realidad: con el flag encendido pero otro móvil guardado sale desmarcada", async () => {
      renderSeccion(
        negocio({
          phone: "+34600111222",
          customerLineType: "movil_trabajo",
          ownerPhoneIsCustomerLine: true,
          ownerWhatsappNumber: "+34699999999",
        })
      );

      expect(
        screen.getByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      ).not.toBeChecked();
    });

    it("con el flag encendido y sin móvil guardado sale desmarcada", async () => {
      renderSeccion(
        negocio({
          phone: "+34600111222",
          customerLineType: "movil_trabajo",
          ownerPhoneIsCustomerLine: true,
          ownerWhatsappNumber: null,
        })
      );

      expect(
        screen.getByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      ).not.toBeChecked();
    });

    it("con tipo móvil pero sin línea guardada no enseña la casilla: no hay a qué móvil mandar los avisos", async () => {
      mockedOnboarding.mockResolvedValue(onboarding({ customerLine: null }));
      renderSeccion(
        negocio({ phone: "TEMP-neg_1", customerLineType: "movil_personal" })
      );

      expect(
        screen.queryByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: /No des mi número a los clientes/,
        })
      ).toBeInTheDocument();
    });

    it("si ya había otro móvil pide confirmación y respeta la negativa", async () => {
      const user = userEvent.setup();
      vi.mocked(window.confirm).mockReturnValue(false);
      renderSeccion(
        negocio({
          phone: "+34600111222",
          customerLineType: "movil_trabajo",
          ownerWhatsappNumber: "+34699999999",
        })
      );

      await user.click(
        screen.getByRole("checkbox", {
          name: /Es el mismo que la línea de clientes/,
        })
      );

      expect(window.confirm).toHaveBeenCalledWith(CONFIRMACION_CAMBIO_DE_MOVIL);
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("desmarcar «es el mismo» solo apaga la casilla", async () => {
      const user = userEvent.setup();
      renderSeccion(
        negocio({
          phone: "+34600111222",
          customerLineType: "movil_personal",
          ownerPhoneIsCustomerLine: true,
          ownerWhatsappNumber: "+34600111222",
        })
      );

      const casilla = screen.getByRole("checkbox", {
        name: /Es el mismo que la línea de clientes/,
      });
      expect(casilla).toBeChecked();
      await user.click(casilla);

      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate).toHaveBeenCalledWith({
        ownerPhoneIsCustomerLine: false,
      });
    });

    it("si el backend ignora el ajuste, lo dice en vez de fingir", async () => {
      const user = userEvent.setup();
      mockedUpdate.mockResolvedValue(negocio());
      renderSeccion(negocio());

      await user.click(
        screen.getByRole("checkbox", {
          name: /No des mi número a los clientes/,
        })
      );

      expect(
        await screen.findByText(
          "No se pudo guardar el ajuste. Inténtalo de nuevo."
        )
      ).toBeInTheDocument();
    });
  });
});

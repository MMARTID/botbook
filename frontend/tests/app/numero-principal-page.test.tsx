import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NumeroPrincipalPage from "@/app/ajustes/numero-principal/page";
import { DEFAULT_AGENT_SETTINGS } from "@/components/agent-settings-editor";
import { useBusiness } from "@/components/providers";
import { getPhoneNumberInfo, updateMyBusiness } from "@/lib/api";
import {
  TEXTO_SIN_MOVIL,
  TEXTO_SIN_NUMERO,
  TEXTO_YA_ES_PRINCIPAL,
} from "@/lib/numero-principal";
import type { Business, PhoneNumberInfo } from "@/lib/types";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
}));

vi.mock("@/components/providers", () => ({
  useBusiness: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getPhoneNumberInfo: vi.fn(),
  updateMyBusiness: vi.fn(),
  // Arrastradas por call-forwarding-card (CodigoFila).
  confirmForwarding: vi.fn(),
  getForwardingCheck: vi.fn(),
  startForwardingCheck: vi.fn(),
}));

const mockedUseBusiness = vi.mocked(useBusiness);
const mockedPhone = vi.mocked(getPhoneNumberInfo);
const mockedUpdate = vi.mocked(updateMyBusiness);

const NUMERO_DE_ALHABLA = "+34930453218";
const MOVIL = "+34600111222";

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
    ownerWhatsappNumber: MOVIL,
    ...overrides,
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

function conNegocio(business: Business | undefined) {
  mockedUseBusiness.mockReturnValue({
    business,
    hasToken: true,
    isLoadingBusiness: false,
    isError: false,
    errorMessage: null,
  } as ReturnType<typeof useBusiness>);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NumeroPrincipalPage />
    </QueryClientProvider>
  );
  return queryClient;
}

function boton() {
  return screen.getByRole("button", {
    name: /Usar Alhabla como número principal/,
  });
}

describe("NumeroPrincipalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPhone.mockResolvedValue(telefono());
    mockedUpdate.mockImplementation(async (payload) => ({
      ...negocio(),
      ...(payload as Partial<Business>),
    }));
  });

  it("explica qué cambia, dónde publicar el número, qué hacer con el antiguo y el ajuste de pasar llamadas", async () => {
    conNegocio(negocio());
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Usar Alhabla como número principal",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Volver a Ajustes/ })
    ).toHaveAttribute("href", "/ajustes#telefono");

    const queCambia = within(
      screen.getByRole("region", { name: "Qué cambia" })
    );
    expect(queCambia.getByText("+34 930 45 32 18")).toBeInTheDocument();
    expect(
      queCambia.getByRole("button", { name: /Copiar el número/ })
    ).toBeInTheDocument();

    const donde = within(
      screen.getByRole("region", { name: "Dónde publicarlo" })
    );
    expect(donde.getByText("Google (Perfil de Empresa)")).toBeInTheDocument();
    expect(donde.getByText("Tu web")).toBeInTheDocument();
    expect(donde.getByText("Redes sociales")).toBeInTheDocument();
    expect(donde.getByText("WhatsApp Business")).toBeInTheDocument();
    expect(donde.getByText(/«otro teléfono»/)).toBeInTheDocument();

    // El número antiguo es un fijo: el código «todas» del fijo (*21*), sin
    // los ** del móvil.
    const antiguo = within(
      screen.getByRole("region", {
        name: "Qué hacer con tu número de siempre",
      })
    );
    expect(antiguo.getByText(/\+34 931 11 22 33/)).toBeInTheDocument();
    expect(
      antiguo.getByText(/Mantenlo con desvío «todas»/)
    ).toBeInTheDocument();
    expect(antiguo.getByText(/Dalo de baja/)).toBeInTheDocument();
    expect(
      antiguo.getByRole("button", {
        name: `Copiar el código *21*${NUMERO_DE_ALHABLA}#`,
      })
    ).toBeInTheDocument();

    const pasar = within(
      screen.getByRole("radiogroup", { name: "Cuándo pasarme llamadas" })
    );
    expect(pasar.getByRole("radio", { name: /Nunca/ })).not.toBeChecked();
    expect(
      pasar.getByRole("radio", { name: /Si el cliente lo pide/ })
    ).toBeChecked();
    expect(
      pasar.getByRole("radio", { name: /Siempre que sea posible/ })
    ).not.toBeChecked();
    expect(boton()).toBeEnabled();
  });

  it("al confirmar guarda customerLineType, phone y el modo elegido con agentSettings entero, y vuelve a Ajustes", async () => {
    const user = userEvent.setup();
    conNegocio(
      negocio({
        phone: "+34600111222",
        customerLineType: "movil_personal",
        ownerPhoneIsCustomerLine: true,
        agentSettings: { ...DEFAULT_AGENT_SETTINGS, tone: "direct" },
      })
    );
    const queryClient = renderPage();

    const pasar = within(
      await screen.findByRole("radiogroup", { name: "Cuándo pasarme llamadas" })
    );
    // Con móvil de trabajo el código «todas» lleva los ** del móvil.
    expect(
      screen.getByRole("button", {
        name: `Copiar el código **21*${NUMERO_DE_ALHABLA}#`,
      })
    ).toBeInTheDocument();

    await user.click(
      pasar.getByRole("radio", { name: /Siempre que sea posible/ })
    );
    await user.click(boton());

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith({
      customerLineType: "alhabla",
      phone: NUMERO_DE_ALHABLA,
      // Los avisos no pueden ir al número de Alhabla.
      ownerPhoneIsCustomerLine: false,
      agentSettings: {
        ...DEFAULT_AGENT_SETTINGS,
        tone: "direct",
        pasarLlamadas: "siempre",
      },
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ajustes#telefono"));
    const guardado = queryClient.getQueryData(["my-business"]) as Business;
    expect(guardado.customerLineType).toBe("alhabla");
    expect(guardado.phone).toBe(NUMERO_DE_ALHABLA);
  });

  it("sin móvil del dueño lo dice, pide el móvil primero y no deja confirmar", async () => {
    conNegocio(negocio({ ownerWhatsappNumber: null }));
    renderPage();

    expect(await screen.findByText(TEXTO_SIN_MOVIL)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Añadir mi móvil" })
    ).toHaveAttribute("href", "/ajustes#whatsapp");
    expect(
      screen.queryByRole("radiogroup", { name: "Cuándo pasarme llamadas" })
    ).not.toBeInTheDocument();
    expect(boton()).toBeDisabled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("si el error viene del servidor lo enseña y no navega", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValue(new Error("Se cayó"));
    conNegocio(negocio());
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: /Usar Alhabla como número principal/,
      })
    );

    expect(
      await screen.findByText("No se pudo guardar el cambio.")
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("sin número de Alhabla activo lo explica y no deja confirmar", async () => {
    mockedPhone.mockResolvedValue(
      telefono({ phoneNumber: null, status: null, sid: null })
    );
    conNegocio(negocio());
    renderPage();

    expect(await screen.findByText(TEXTO_SIN_NUMERO)).toBeInTheDocument();
    expect(boton()).toBeDisabled();
  });

  it("cuando ya es el principal lo dice, no enseña el número antiguo ni el botón, y el ajuste se cambia desde Ajustes", async () => {
    conNegocio(
      negocio({ phone: NUMERO_DE_ALHABLA, customerLineType: "alhabla" })
    );
    renderPage();

    expect(await screen.findByText(TEXTO_YA_ES_PRINCIPAL)).toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: "Qué hacer con tu número de siempre",
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Usar Alhabla como número principal/,
      })
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Cuándo pasarme llamadas" })
      ).getByRole("radio", { name: /Si el cliente lo pide/ })
    ).toBeDisabled();
  });

  it("mientras carga el negocio enseña el estado de carga", () => {
    mockedUseBusiness.mockReturnValue({
      business: undefined,
      hasToken: null,
      isLoadingBusiness: true,
      isError: false,
      errorMessage: null,
    } as ReturnType<typeof useBusiness>);
    renderPage();

    expect(screen.getByText("Cargando…")).toBeInTheDocument();
  });
});

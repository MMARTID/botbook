import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, type AxiosResponse } from "axios";
import { WhatsappDueno } from "@/components/whatsapp-dueno";
import {
  getOwnerWhatsapp,
  sendOwnerWhatsappActivation,
  updateMyBusiness,
} from "@/lib/api";
import type { Business, EstadoWhatsappDueno } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  getOwnerWhatsapp: vi.fn(),
  sendOwnerWhatsappActivation: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const mockedGetOwnerWhatsapp = vi.mocked(getOwnerWhatsapp);
const mockedSendActivation = vi.mocked(sendOwnerWhatsappActivation);
const mockedUpdateMyBusiness = vi.mocked(updateMyBusiness);

const ENLACE_ALTA = "https://wa.me/34930453218?text=ALTA%207KP3MQ";

const NEGOCIO = {
  id: "neg_1",
  name: "Peluquería Lola",
  phone: "+34930111222",
  timezone: "Europe/Madrid",
  ownerWhatsappNumber: null,
} as unknown as Business;

function estado(
  overrides: Partial<EstadoWhatsappDueno> = {}
): EstadoWhatsappDueno {
  return {
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
    alta: {
      code: "7KP3MQ",
      text: "ALTA 7KP3MQ",
      link: ENLACE_ALTA,
      expiresAt: "2026-09-27T10:00:00.000Z",
    },
    ...overrides,
  };
}

function errorHttp(status: number, data: Record<string, unknown>) {
  return new AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      data,
      statusText: "",
      headers: {},
      config: {},
    } as unknown as AxiosResponse
  );
}

function renderComponent(business: Business = NEGOCIO) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <section id="whatsapp">
        <WhatsappDueno business={business} hasToken={true} />
      </section>
    </QueryClientProvider>
  );
  return queryClient;
}

describe("WhatsappDueno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin número: sin badge, invita a añadir el móvil y enseña el mensaje ALTA", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());

    renderComponent();

    expect(
      await screen.findByText(
        "Añade tu móvil para recibir los avisos por WhatsApp."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Pendiente de activar")).not.toBeInTheDocument();
    expect(screen.queryByText("Activo")).not.toBeInTheDocument();
    expect(screen.getByText("ALTA 7KP3MQ")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Abrir WhatsApp/ })
    ).toHaveAttribute("href", ENLACE_ALTA);
    expect(
      screen.getByRole("img", {
        name: "Código QR para abrir WhatsApp con el mensaje de activación",
      })
    ).toBeInTheDocument();
    // Sin plantilla aprobada no hay nada que reenviar.
    expect(
      screen.queryByRole("button", { name: /Reenviar activación/ })
    ).not.toBeInTheDocument();
  });

  it("pendiente: badge, instrucción de enviar el mensaje y número de Alhabla en la ayuda", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({ ownerWhatsappNumber: "+34600123456", status: "pendiente" })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    expect(await screen.findByText("Pendiente de activar")).toBeInTheDocument();
    expect(
      screen.getByText(/Falta un paso: envíanos un mensaje desde tu móvil/)
    ).toBeInTheDocument();
    expect(screen.getByText(/\+34 930 453 218/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tu móvil con WhatsApp/)).toHaveValue(
      "+34600123456"
    );
  });

  it("pendiente con plantilla enviada: dice cuándo y ofrece reenviar la activación", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "pendiente",
        templateApproved: true,
        canSendTemplate: true,
        activationSentAt: "2026-09-20T09:30:00.000Z",
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    expect(
      await screen.findByText(/Te enviamos un WhatsApp el/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reenviar activación/ })
    ).toBeInTheDocument();
  });

  it("activo: badge verde, número y fecha, sin bloque ALTA", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "activo",
        optInAt: "2026-09-18T10:00:00.000Z",
        optInVia: "alta_codigo",
        alta: null,
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    expect(await screen.findByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("+34 600 123 456")).toBeInTheDocument();
    expect(
      screen.getByText(/Activado el 18 de septiembre de 2026/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Abrir WhatsApp/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reenviar activación/ })
    ).not.toBeInTheDocument();
  });

  it("sin WhatsApp: badge rojo, campo inválido y botón «Volver a intentar» solo con plantilla", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "sin_whatsapp",
        unreachableAt: "2026-09-19T10:00:00.000Z",
        templateApproved: true,
        canSendTemplate: true,
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    expect(await screen.findByText("Sin WhatsApp")).toBeInTheDocument();
    expect(
      screen.getByText(/parece que no tiene WhatsApp/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tu móvil con WhatsApp/)).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(
      screen.getByRole("button", { name: /Volver a intentar/ })
    ).toBeInTheDocument();
  });

  it("baja con fecha: badge gris y explica cómo reactivar", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "baja",
        optOutAt: "2026-09-19T08:00:00.000Z",
        templateApproved: true,
        canSendTemplate: true,
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    expect(await screen.findByText("Avisos desactivados")).toBeInTheDocument();
    expect(
      screen.getByText(/Pediste no recibir avisos el 19 de septiembre de 2026/)
    ).toBeInTheDocument();
    // El panel no puede reactivar una baja: no hay botón de reenvío.
    expect(
      screen.queryByRole("button", { name: /Reenviar activación/ })
    ).not.toBeInTheDocument();
  });

  it("baja sin fecha: no pinta «Invalid Date»", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "baja",
        optOutAt: null,
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    expect(
      await screen.findByText(/Ese móvil pidió no recibir avisos de Alhabla/)
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Invalid");
  });

  it("guarda «600 123 456» como +34600123456 y después pide la activación", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO,
      ownerWhatsappNumber: "+34600123456",
    });
    mockedSendActivation.mockResolvedValue({
      ...estado({ ownerWhatsappNumber: "+34600123456", status: "pendiente" }),
      sent: "link",
    });

    const queryClient = renderComponent();

    await user.type(
      await screen.findByLabelText(/Tu móvil con WhatsApp/),
      "600 123 456"
    );
    await user.click(screen.getByRole("button", { name: /Guardar y activar/ }));

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
        ownerWhatsappNumber: "+34600123456",
      })
    );
    await waitFor(() => expect(mockedSendActivation).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "Móvil guardado. Ahora envía el mensaje desde WhatsApp para activar los avisos."
      )
    ).toBeInTheDocument();
    expect(queryClient.getQueryData(["my-business"])).toMatchObject({
      ownerWhatsappNumber: "+34600123456",
    });
  });

  it("anuncia el WhatsApp enviado cuando la activación sale como plantilla", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO,
      ownerWhatsappNumber: "+34600123456",
    });
    mockedSendActivation.mockResolvedValue({
      ...estado({ ownerWhatsappNumber: "+34600123456", status: "pendiente" }),
      sent: "template",
    });

    renderComponent();

    await user.type(
      await screen.findByLabelText(/Tu móvil con WhatsApp/),
      "600123456"
    );
    await user.click(screen.getByRole("button", { name: /Guardar y activar/ }));

    expect(
      await screen.findByText(
        "Te hemos enviado un WhatsApp. Pulsa «Activar avisos» cuando te llegue."
      )
    ).toBeInTheDocument();
  });

  it("si el backend no devuelve el móvil (versión antigua) no pide la activación y avisa", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO,
      ownerWhatsappNumber: undefined,
    });

    renderComponent();

    await user.type(
      await screen.findByLabelText(/Tu móvil con WhatsApp/),
      "600 123 456"
    );
    await user.click(screen.getByRole("button", { name: /Guardar y activar/ }));

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText(
        "No se pudo guardar el móvil. Inténtalo de nuevo."
      )
    ).toBeInTheDocument();
    expect(mockedSendActivation).not.toHaveBeenCalled();
  });

  it("guardar en blanco envía null y no pide activación", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({ ownerWhatsappNumber: "+34600123456", status: "pendiente" })
    );
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO,
      ownerWhatsappNumber: null,
    });

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    const campo = await screen.findByLabelText(/Tu móvil con WhatsApp/);
    await user.clear(campo);
    await user.click(screen.getByRole("button", { name: /Guardar y activar/ }));

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
        ownerWhatsappNumber: null,
      })
    );
    expect(mockedSendActivation).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "Móvil eliminado. Ya no recibirás avisos por WhatsApp."
      )
    ).toBeInTheDocument();
  });

  it("«Quitar el móvil» pide confirmación y guarda null", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({ ownerWhatsappNumber: "+34600123456", status: "pendiente" })
    );
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO,
      ownerWhatsappNumber: null,
    });

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    await user.click(
      await screen.findByRole("button", { name: /Quitar el móvil/ })
    );

    expect(window.confirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
        ownerWhatsappNumber: null,
      })
    );
  });

  it("un móvil inválido bloquea el guardado y lo explica", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());

    renderComponent();

    const campo = await screen.findByLabelText(/Tu móvil con WhatsApp/);
    await user.type(campo, "12345");
    await user.tab();

    expect(
      await screen.findByText(
        "Escribe un móvil válido, por ejemplo 600 123 456 o +34 600 123 456."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Guardar y activar/ })
    ).toBeDisabled();
    expect(mockedUpdateMyBusiness).not.toHaveBeenCalled();
  });

  it("avisa, sin bloquear, cuando el número parece el fijo del local", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());

    renderComponent();

    await user.type(
      await screen.findByLabelText(/Tu móvil con WhatsApp/),
      "930 111 222"
    );
    await user.tab();

    expect(
      await screen.findByText(
        "Parece el teléfono del local. Necesitamos el móvil en el que usas WhatsApp."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Guardar y activar/ })
    ).toBeEnabled();
  });

  it("cambiar un móvil activo pide confirmación y respeta la negativa", async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValue(false);
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "activo",
        alta: null,
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    const campo = await screen.findByLabelText(/Tu móvil con WhatsApp/);
    await user.clear(campo);
    await user.type(campo, "611 222 333");
    await user.click(screen.getByRole("button", { name: /Guardar y activar/ }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Al cambiar de móvil tendrás que activar los avisos otra vez en el nuevo. ¿Continuar?"
    );
    expect(mockedUpdateMyBusiness).not.toHaveBeenCalled();
  });

  it("reenviar activación: 429 «demasiado pronto» enseña el texto del backend", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "pendiente",
        templateApproved: true,
        canSendTemplate: true,
      })
    );
    mockedSendActivation.mockRejectedValue(
      errorHttp(429, {
        error:
          "Acabamos de enviarte el mensaje. Espera cinco minutos antes de pedir otro.",
        code: "OWNER_WHATSAPP_ACTIVATION_TOO_SOON",
        retryAfterSeconds: 240,
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    await user.click(
      await screen.findByRole("button", { name: /Reenviar activación/ })
    );

    expect(
      await screen.findByText(
        "Acabamos de enviarte el mensaje. Espera cinco minutos antes de pedir otro."
      )
    ).toBeInTheDocument();
  });

  it("reenviar activación: 429 por tope del móvil enseña el texto del backend", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "pendiente",
        templateApproved: true,
        canSendTemplate: true,
      })
    );
    mockedSendActivation.mockRejectedValue(
      errorHttp(429, {
        error:
          "Ya hemos enviado dos mensajes de activación a ese móvil hoy. Prueba con el enlace o inténtalo mañana.",
        code: "OWNER_WHATSAPP_DESTINATION_LIMIT",
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    await user.click(
      await screen.findByRole("button", { name: /Reenviar activación/ })
    );

    expect(
      await screen.findByText(
        "Ya hemos enviado dos mensajes de activación a ese móvil hoy. Prueba con el enlace o inténtalo mañana."
      )
    ).toBeInTheDocument();
  });

  it("reenviar activación: 409 por baja enseña el texto del backend", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "sin_whatsapp",
        templateApproved: true,
        canSendTemplate: true,
      })
    );
    mockedSendActivation.mockRejectedValue(
      errorHttp(409, {
        error:
          "Ese móvil pidió no recibir avisos. Solo puede volver a activarlos escribiendo ALTA desde el propio móvil.",
        code: "OWNER_WHATSAPP_OPTED_OUT",
      })
    );

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    await user.click(
      await screen.findByRole("button", { name: /Volver a intentar/ })
    );

    expect(
      await screen.findByText(
        "Ese móvil pidió no recibir avisos. Solo puede volver a activarlos escribiendo ALTA desde el propio móvil."
      )
    ).toBeInTheDocument();
  });

  it("reenviar activación con éxito actualiza el estado y lo dice", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockResolvedValue(
      estado({
        ownerWhatsappNumber: "+34600123456",
        status: "pendiente",
        templateApproved: true,
        canSendTemplate: true,
      })
    );
    mockedSendActivation.mockResolvedValue({
      ...estado({
        ownerWhatsappNumber: "+34600123456",
        status: "pendiente",
        templateApproved: true,
        canSendTemplate: true,
        activationSentAt: "2026-09-20T09:30:00.000Z",
      }),
      sent: "template",
    });

    renderComponent({ ...NEGOCIO, ownerWhatsappNumber: "+34600123456" });

    await user.click(
      await screen.findByRole("button", { name: /Reenviar activación/ })
    );

    expect(
      await screen.findByText("Activación enviada. Mira tu WhatsApp.")
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Te enviamos un WhatsApp el/)
    ).toBeInTheDocument();
  });

  it("si el estado no carga, deja el campo y ofrece reintentar", async () => {
    const user = userEvent.setup();
    mockedGetOwnerWhatsapp.mockRejectedValueOnce(new Error("Network Error"));
    mockedGetOwnerWhatsapp.mockResolvedValueOnce(estado());

    renderComponent();

    expect(
      await screen.findByText("No se pudo comprobar el estado de WhatsApp.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tu móvil con WhatsApp/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(
      await screen.findByText(
        "Añade tu móvil para recibir los avisos por WhatsApp."
      )
    ).toBeInTheDocument();
    expect(mockedGetOwnerWhatsapp).toHaveBeenCalledTimes(2);
  });

  it("el bloque ALTA dice cuándo caduca el código", async () => {
    mockedGetOwnerWhatsapp.mockResolvedValue(estado());

    renderComponent();

    const bloque = (await screen.findByText("Actívalo desde tu móvil")).closest(
      "div"
    )!;
    expect(
      within(bloque).getByText(/El código caduca el 27 de septiembre de 2026/)
    ).toBeInTheDocument();
    expect(
      within(bloque).getByRole("button", { name: /Copiar enlace/ })
    ).toBeInTheDocument();
  });
});

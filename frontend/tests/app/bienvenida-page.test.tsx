import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import RegisterBusinessPage from "@/app/bienvenida/page";
import {
  getPlaceDetails,
  searchPlaces,
  sendOwnerWhatsappActivation,
  updateMyBusiness,
} from "@/lib/api";
import type { Business, PlaceDetails } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/lottie-animation", () => ({
  LottieAnimation: () => null,
}));

vi.mock("@/lib/api", () => ({
  getPlaceDetails: vi.fn(),
  searchPlaces: vi.fn(),
  sendOwnerWhatsappActivation: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const mockedSearchPlaces = vi.mocked(searchPlaces);
const mockedGetPlaceDetails = vi.mocked(getPlaceDetails);
const mockedUpdateMyBusiness = vi.mocked(updateMyBusiness);
const mockedSendActivation = vi.mocked(sendOwnerWhatsappActivation);

const LUGAR: PlaceDetails = {
  placeId: "place_1",
  name: "Peluquería Lola",
  address: "Calle Mayor 1, Madrid",
  phone: "+34 930 111 222",
  schedule: {},
  types: ["hair_care"],
};

const NEGOCIO_GUARDADO = {
  id: "neg_1",
  name: "Peluquería Lola",
  phone: "+34930111222",
  ownerWhatsappNumber: "+34600123456",
} as unknown as Business;

/** Lo que el alta manda del negocio elegido, sin la telefonía. */
const DATOS_DEL_LUGAR = {
  name: LUGAR.name,
  businessDetails: `${LUGAR.name}\n${LUGAR.address}`,
  schedule: LUGAR.schedule,
  placeId: LUGAR.placeId,
  address: LUGAR.address,
};

/** Con el fijo de Google Places la tarjeta «el fijo del local» va prefijada. */
const TELEFONIA_FIJO = {
  phone: "+34930111222",
  customerLineType: "fijo",
  ownerPhoneIsCustomerLine: false,
  hideOwnerNumberFromClients: false,
};

function mockLocation() {
  const original = window.location;
  let hrefValue = "http://localhost/bienvenida";
  const location = {
    ...original,
    search: "",
    get href() {
      return hrefValue;
    },
    set href(value: string) {
      hrefValue = value;
    },
  };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: location,
  });
  return {
    getHref: () => hrefValue,
    restore: () =>
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      }),
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

async function elegirNegocio(
  user: ReturnType<typeof userEvent.setup>,
  lugar: PlaceDetails = LUGAR
) {
  mockedSearchPlaces.mockResolvedValue([
    {
      placeId: LUGAR.placeId,
      name: LUGAR.name,
      address: LUGAR.address,
      photoUrl: null,
    },
  ]);
  mockedGetPlaceDetails.mockResolvedValue(lugar);

  await user.type(
    screen.getByLabelText("Busca tu negocio por nombre o dirección"),
    "Lola"
  );
  await user.click(
    await screen.findByRole("button", { name: /Peluquería Lola/ })
  );
  await screen.findByText("Calle Mayor 1, Madrid");
}

describe("RegisterBusinessPage — móvil con WhatsApp", () => {
  let location: ReturnType<typeof mockLocation>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem("alhabla_token", "token");
    location = mockLocation();
  });

  afterEach(() => {
    location.restore();
    vi.restoreAllMocks();
  });

  it("enseña el campo opcional aunque no haya negocio elegido", () => {
    render(<RegisterBusinessPage />);

    const campo = screen.getByLabelText("Tu móvil con WhatsApp (opcional)");
    expect(campo).toHaveAttribute("placeholder", "600 123 456");
    expect(campo).toHaveAttribute("type", "tel");
    expect(
      screen.getByText(
        /Es tu móvil, no el teléfono del local\. Puedes añadirlo o cambiarlo más tarde en Ajustes\./
      )
    ).toBeInTheDocument();
  });

  it("vacío no bloquea: «No encontré mi negocio» sigue sin llamar a la API", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);

    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    expect(mockedUpdateMyBusiness).not.toHaveBeenCalled();
    expect(location.getHref()).toBe("/bienvenida/niche");
  });

  it("un móvil inválido bloquea los dos botones y lo explica", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "12345"
    );
    await user.tab();

    expect(
      await screen.findByText(
        "Escribe un móvil válido, por ejemplo 600 123 456 o +34 600 123 456."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    ).toBeDisabled();
  });

  it("el fijo va en su sitio y el móvil se pide aparte; un fijo en «Tu móvil» avisa sin bloquear, como en Ajustes", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    expect(screen.getByRole("radio", { name: /El fijo del local/ })).toBeChecked();
    expect(screen.getByLabelText("Teléfono fijo del local")).toHaveValue(
      "+34 930 111 222"
    );

    const movil = screen.getByLabelText("Tu móvil con WhatsApp (opcional)");
    await user.type(movil, "930 111 222");
    await user.tab();

    expect(
      screen.getByText(
        "Parece el teléfono del local. Necesitamos el móvil en el que usas WhatsApp."
      )
    ).toBeInTheDocument();
    expect(movil).toHaveAttribute("aria-invalid", "false");
    expect(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    ).toBeEnabled();

    // Al corregirlo el aviso se va.
    await user.clear(movil);
    await user.type(movil, "600 123 456");
    await user.tab();
    expect(
      screen.queryByText(/Parece el teléfono del local/)
    ).not.toBeInTheDocument();
  });

  it("guarda el móvil normalizado en el mismo PATCH y después pide la activación", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "600 123 456"
    );
    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ...DATOS_DEL_LUGAR,
      ...TELEFONIA_FIJO,
      ownerWhatsappNumber: "+34600123456",
    });
    await waitFor(() => expect(mockedSendActivation).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(location.getHref()).toBe("/bienvenida/niche")
    );
  });

  it("el PATCH lleva placeId y address del negocio elegido, también sin móvil", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ...DATOS_DEL_LUGAR,
      ...TELEFONIA_FIJO,
    });
    expect(mockedSendActivation).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(location.getHref()).toBe("/bienvenida/niche")
    );
  });

  it("sin dirección en Google Places manda address null (el backend acepta nulo)", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    mockedSearchPlaces.mockResolvedValue([
      { placeId: "place_2", name: "Barbería Sol", address: "", photoUrl: null },
    ]);
    mockedGetPlaceDetails.mockResolvedValue({
      ...LUGAR,
      placeId: "place_2",
      name: "Barbería Sol",
      address: "",
    });
    render(<RegisterBusinessPage />);

    await user.type(
      screen.getByLabelText("Busca tu negocio por nombre o dirección"),
      "Sol"
    );
    await user.click(
      await screen.findByRole("button", { name: /Barbería Sol/ })
    );
    await user.click(
      await screen.findByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      name: "Barbería Sol",
      businessDetails: "Barbería Sol",
      schedule: LUGAR.schedule,
      placeId: "place_2",
      address: null,
      ...TELEFONIA_FIJO,
    });
  });

  it("si el PATCH no devuelve el móvil (backend antiguo) avisa, no activa y continúa a los 4 s", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue({
      id: "neg_1",
      name: "Peluquería Lola",
    } as Business);
    // Se captura el aviso de 4 s para dispararlo a mano: el resto de timers
    // (debounce de la búsqueda) no entran en este camino.
    let continuar: (() => void) | null = null;
    const setTimeoutOriginal = window.setTimeout;
    vi.spyOn(window, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      if (timeout === 4_000 && typeof handler === "function") {
        continuar = handler as () => void;
        return 0;
      }
      return setTimeoutOriginal(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    render(<RegisterBusinessPage />);

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "600 123 456"
    );
    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    expect(
      await screen.findByText(
        "No se pudo guardar tu móvil. Añádelo más tarde en Ajustes › Teléfono."
      )
    ).toBeInTheDocument();
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ownerWhatsappNumber: "+34600123456",
    });
    expect(mockedSendActivation).not.toHaveBeenCalled();
    expect(location.getHref()).toBe("http://localhost/bienvenida");

    expect(continuar).not.toBeNull();
    act(() => continuar!());
    expect(location.getHref()).toBe("/bienvenida/niche");
  });

  it("«No encontré mi negocio» con móvil guarda antes de redirigir y no redirige si falla", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockRejectedValue(new Error("Network Error"));
    render(<RegisterBusinessPage />);

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "600123456"
    );
    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    expect(
      await screen.findByText(
        "No se pudo guardar la información del negocio. Inténtalo de nuevo."
      )
    ).toBeInTheDocument();
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ownerWhatsappNumber: "+34600123456",
    });
    expect(mockedSendActivation).not.toHaveBeenCalled();
    expect(location.getHref()).toBe("http://localhost/bienvenida");
    expect(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    ).toBeEnabled();
  });

  it("con el número de Alhabla enseña el error del backend bajo el campo", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockRejectedValue(
      errorHttp(400, {
        error: "Ese número es el de Alhabla. Escribe tu propio móvil.",
        code: "OWNER_WHATSAPP_IS_ALHABLA",
      })
    );
    render(<RegisterBusinessPage />);

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "930 453 218"
    );
    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    const campo = screen.getByLabelText("Tu móvil con WhatsApp (opcional)");
    expect(
      await screen.findByText(
        "Ese número es el de Alhabla. Escribe tu propio móvil."
      )
    ).toBeInTheDocument();
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(location.getHref()).toBe("http://localhost/bienvenida");
  });
});

describe("RegisterBusinessPage — ¿A qué número te llaman tus clientes?", () => {
  let location: ReturnType<typeof mockLocation>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem("alhabla_token", "token");
    location = mockLocation();
  });

  afterEach(() => {
    location.restore();
    vi.restoreAllMocks();
  });

  it("enseña las cuatro tarjetas sin ninguna elegida hasta que Google Places diga algo", () => {
    render(<RegisterBusinessPage />);

    const tarjetas = screen.getAllByRole("radio");
    expect(tarjetas.map((radio) => radio.getAttribute("value"))).toEqual([
      "fijo",
      "movil_trabajo",
      "movil_personal",
      "alhabla",
    ]);
    expect(tarjetas.some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false
    );
    expect(
      screen.queryByLabelText("Teléfono fijo del local")
    ).not.toBeInTheDocument();
  });

  it("un móvil en Google Places propone «un móvil de trabajo» con los avisos a ese mismo móvil por defecto (plan § 5, casos B y C)", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO_GUARDADO,
      ownerWhatsappNumber: "+34600111222",
    });
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);
    await elegirNegocio(user, { ...LUGAR, phone: "+34 600 111 222" });

    expect(
      screen.getByRole("radio", { name: /Un móvil de trabajo/ })
    ).toBeChecked();
    expect(screen.getByLabelText("Móvil de trabajo")).toHaveValue(
      "+34 600 111 222"
    );
    expect(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    ).toBeChecked();
    expect(
      screen.queryByLabelText("Tu móvil con WhatsApp (opcional)")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ...DATOS_DEL_LUGAR,
      phone: "+34600111222",
      customerLineType: "movil_trabajo",
      ownerPhoneIsCustomerLine: true,
      hideOwnerNumberFromClients: false,
      ownerWhatsappNumber: "+34600111222",
    });
    await waitFor(() => expect(mockedSendActivation).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(location.getHref()).toBe("/bienvenida/niche")
    );
  });

  it("«mi móvil personal» marca por defecto los avisos al mismo móvil y permite no dar el número", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    await user.click(screen.getByRole("radio", { name: /Mi móvil personal/ }));

    expect(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    ).toBeChecked();
    expect(
      screen.queryByLabelText("Tu móvil con WhatsApp (opcional)")
    ).not.toBeInTheDocument();

    const linea = screen.getByLabelText("Tu móvil");
    await user.clear(linea);
    await user.type(linea, "600 123 456");
    await user.click(
      screen.getByRole("checkbox", { name: /No des mi número a los clientes/ })
    );
    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ...DATOS_DEL_LUGAR,
      phone: "+34600123456",
      customerLineType: "movil_personal",
      ownerPhoneIsCustomerLine: true,
      hideOwnerNumberFromClients: true,
      ownerWhatsappNumber: "+34600123456",
    });
    await waitFor(() => expect(mockedSendActivation).toHaveBeenCalledTimes(1));
  });

  it("«quiero usar el de Alhabla» no pide número: guarda el tipo sin tocar phone y pide el móvil aparte", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    await user.click(
      screen.getByRole("radio", { name: /quiero usar el de Alhabla/ })
    );

    expect(
      screen.queryByLabelText("Teléfono fijo del local")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(/no hay nada que desviar/)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "600 123 456"
    );
    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ...DATOS_DEL_LUGAR,
      customerLineType: "alhabla",
      ownerPhoneIsCustomerLine: false,
      hideOwnerNumberFromClients: false,
      ownerWhatsappNumber: "+34600123456",
    });
    expect(mockedUpdateMyBusiness.mock.calls[0][0]).not.toHaveProperty("phone");
  });

  it("una línea de clientes inválida bloquea los botones y lo explica", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    const linea = screen.getByLabelText("Teléfono fijo del local");
    await user.clear(linea);
    await user.type(linea, "12345");
    await user.tab();

    expect(
      await screen.findByText(
        "Escribe un teléfono válido, por ejemplo 930 123 456 o +34 600 123 456."
      )
    ).toBeInTheDocument();
    expect(linea).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    ).toBeDisabled();
    expect(mockedUpdateMyBusiness).not.toHaveBeenCalled();
  });

  it("sin negocio elegido, «configurar después» guarda igualmente la línea y su tipo", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue({
      ...NEGOCIO_GUARDADO,
      ownerWhatsappNumber: "+34600111222",
    });
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);

    await user.click(
      screen.getByRole("radio", { name: /Un móvil de trabajo/ })
    );
    await user.type(screen.getByLabelText("Móvil de trabajo"), "600 111 222");
    expect(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    ).toBeChecked();
    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      phone: "+34600111222",
      customerLineType: "movil_trabajo",
      ownerPhoneIsCustomerLine: true,
      hideOwnerNumberFromClients: false,
      ownerWhatsappNumber: "+34600111222",
    });
    await waitFor(() => expect(mockedSendActivation).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(location.getHref()).toBe("/bienvenida/niche")
    );
  });

  it("desmarcar «los avisos a este mismo móvil» vuelve a pedir el móvil aparte y no manda ownerPhoneIsCustomerLine", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);
    await elegirNegocio(user, { ...LUGAR, phone: "+34 600 111 222" });

    await user.click(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    );

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "600 123 456"
    );
    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
      ...DATOS_DEL_LUGAR,
      phone: "+34600111222",
      customerLineType: "movil_trabajo",
      ownerPhoneIsCustomerLine: false,
      hideOwnerNumberFromClients: false,
      ownerWhatsappNumber: "+34600123456",
    });
  });

  it("con la casilla marcada y la línea vacía no guarda: pide el móvil o desmarcar la casilla", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);

    // Sin negocio (o sin teléfono en Google Places): la persona elige «Mi
    // móvil personal», la casilla se marca sola y no escribe nada.
    await user.click(screen.getByRole("radio", { name: /Mi móvil personal/ }));
    expect(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    const linea = screen.getByLabelText("Tu móvil");
    expect(
      await screen.findByText(
        "Escribe el móvil al que te mandamos los avisos o desmarca «Mándame los avisos a este mismo móvil»."
      )
    ).toBeInTheDocument();
    expect(linea).toHaveAttribute("aria-invalid", "true");
    expect(mockedUpdateMyBusiness).not.toHaveBeenCalled();
    expect(location.getHref()).toBe("http://localhost/bienvenida");

    // Desmarcar la casilla es una salida válida: el error se va y el tipo
    // se guarda sin móvil.
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    await user.click(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    );
    expect(
      screen.queryByText(/Escribe el móvil al que te mandamos los avisos/)
    ).not.toBeInTheDocument();
    expect(linea).toHaveAttribute("aria-invalid", "false");
    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );
    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
        customerLineType: "movil_personal",
        ownerPhoneIsCustomerLine: false,
        hideOwnerNumberFromClients: false,
      })
    );
    expect(mockedSendActivation).not.toHaveBeenCalled();
  });

  it("un fijo con «los avisos a este mismo móvil» bloquea los botones y lo explica, al instante al cambiar de tarjeta", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    // El fijo de Google Places queda en el campo al pasar a «Mi móvil
    // personal», y la casilla se marca sola: ese fijo iría como WhatsApp.
    await user.click(screen.getByRole("radio", { name: /Mi móvil personal/ }));

    const linea = screen.getByLabelText("Tu móvil");
    expect(linea).toHaveValue("+34 930 111 222");
    expect(
      screen.getByText(
        "Ese número es un fijo y no tiene WhatsApp. Escribe tu móvil o desmarca «Mándame los avisos a este mismo móvil»."
      )
    ).toBeInTheDocument();
    expect(linea).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    ).toBeDisabled();

    // Desmarcar la casilla lo desbloquea: el fijo puede ser la línea de
    // clientes, solo no puede ser el WhatsApp del dueño.
    await user.click(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    );
    expect(
      screen.queryByText(/Ese número es un fijo y no tiene WhatsApp/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    ).toBeEnabled();
    expect(mockedUpdateMyBusiness).not.toHaveBeenCalled();
  });

  it("elegir el negocio después no pisa la tarjeta, la línea ni las casillas que la persona ya había rellenado", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue(NEGOCIO_GUARDADO);
    mockedSendActivation.mockResolvedValue({} as never);
    render(<RegisterBusinessPage />);

    await user.click(screen.getByRole("radio", { name: /Mi móvil personal/ }));
    await user.type(screen.getByLabelText("Tu móvil"), "600 123 456");
    await user.click(
      screen.getByRole("checkbox", { name: /No des mi número a los clientes/ })
    );

    // Google Places trae un fijo: sin la protección, la tarjeta pasaría a
    // «fijo», el número escrito se perdería y las casillas se reiniciarían.
    await elegirNegocio(user);

    expect(
      screen.getByRole("radio", { name: /Mi móvil personal/ })
    ).toBeChecked();
    expect(screen.getByLabelText("Tu móvil")).toHaveValue("600 123 456");
    expect(
      screen.getByRole("checkbox", {
        name: /Mándame los avisos a este mismo móvil/,
      })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /No des mi número a los clientes/ })
    ).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    );
    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
        ...DATOS_DEL_LUGAR,
        phone: "+34600123456",
        customerLineType: "movil_personal",
        ownerPhoneIsCustomerLine: true,
        hideOwnerNumberFromClients: true,
        ownerWhatsappNumber: "+34600123456",
      })
    );
  });

  it("si la persona no ha tocado nada, cambiar de negocio sí actualiza la propuesta de Google Places", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);
    expect(screen.getByRole("radio", { name: /El fijo del local/ })).toBeChecked();

    // Editar el buscador suelta el negocio; el segundo trae un móvil. La
    // búsqueda tiene que cambiar de texto o el debounce no la repite.
    const buscador = screen.getByLabelText(
      "Busca tu negocio por nombre o dirección"
    );
    await user.clear(buscador);
    await user.type(buscador, "Peluquería ");
    await elegirNegocio(user, { ...LUGAR, phone: "+34 600 111 222" });

    expect(
      screen.getByRole("radio", { name: /Un móvil de trabajo/ })
    ).toBeChecked();
    expect(screen.getByLabelText("Móvil de trabajo")).toHaveValue(
      "+34 600 111 222"
    );
  });

  it("con los avisos al mismo móvil, el aviso de «no se pudo guardar tu móvil» se ve aunque el bloque del móvil no esté", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockResolvedValue({
      id: "neg_1",
      name: "Peluquería Lola",
    } as Business);
    let continuar: (() => void) | null = null;
    const setTimeoutOriginal = window.setTimeout;
    vi.spyOn(window, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      if (timeout === 4_000 && typeof handler === "function") {
        continuar = handler as () => void;
        return 0;
      }
      return setTimeoutOriginal(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    render(<RegisterBusinessPage />);

    await user.click(screen.getByRole("radio", { name: /Mi móvil personal/ }));
    await user.type(screen.getByLabelText("Tu móvil"), "600 123 456");
    expect(
      screen.queryByLabelText("Tu móvil con WhatsApp (opcional)")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    );

    const aviso = await screen.findByText(
      "No se pudo guardar tu móvil. Añádelo más tarde en Ajustes › Teléfono."
    );
    expect(aviso).toHaveAttribute("aria-live", "polite");
    expect(aviso).not.toHaveClass("sr-only");
    expect(mockedSendActivation).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /No encontré mi negocio/ })
    ).toBeDisabled();
    expect(location.getHref()).toBe("http://localhost/bienvenida");

    expect(continuar).not.toBeNull();
    act(() => continuar!());
    expect(location.getHref()).toBe("/bienvenida/niche");
  });
});

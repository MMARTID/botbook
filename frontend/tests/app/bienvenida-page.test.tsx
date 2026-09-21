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

async function elegirNegocio(user: ReturnType<typeof userEvent.setup>) {
  mockedSearchPlaces.mockResolvedValue([
    {
      placeId: LUGAR.placeId,
      name: LUGAR.name,
      address: LUGAR.address,
      photoUrl: null,
    },
  ]);
  mockedGetPlaceDetails.mockResolvedValue(LUGAR);

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

  it("avisa, sin bloquear, cuando el móvil coincide con el teléfono del local", async () => {
    const user = userEvent.setup();
    render(<RegisterBusinessPage />);
    await elegirNegocio(user);

    await user.type(
      screen.getByLabelText("Tu móvil con WhatsApp (opcional)"),
      "930 111 222"
    );
    await user.tab();

    expect(
      await screen.findByText(
        "Parece el teléfono del local. Necesitamos el móvil en el que usas WhatsApp."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Confirmar y continuar/ })
    ).toBeEnabled();
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
      name: LUGAR.name,
      businessDetails: `${LUGAR.name}\n${LUGAR.address}`,
      schedule: LUGAR.schedule,
      placeId: LUGAR.placeId,
      address: LUGAR.address,
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
      name: LUGAR.name,
      businessDetails: `${LUGAR.name}\n${LUGAR.address}`,
      schedule: LUGAR.schedule,
      placeId: "place_1",
      address: "Calle Mayor 1, Madrid",
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
        "No se pudo guardar tu móvil. Añádelo más tarde en Ajustes › WhatsApp."
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

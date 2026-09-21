import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, type AxiosResponse } from "axios";
import {
  CallForwardingCard,
  ComprobarDesvio,
  INTERVALO_DE_CONSULTA_MS,
  MAX_CONSULTAS,
  TEXTO_POR_MOTIVO,
  TEXTO_POR_MOTIVO_EN_AJUSTES,
} from "@/components/call-forwarding-card";
import {
  confirmForwarding,
  getForwardingCheck,
  startForwardingCheck,
  updateMyBusiness,
} from "@/lib/api";
import type {
  Business,
  CustomerLineType,
  ForwardingCheck,
  OnboardingForwarding,
} from "@/lib/types";

vi.mock("@/lib/api", () => ({
  confirmForwarding: vi.fn(),
  getForwardingCheck: vi.fn(),
  startForwardingCheck: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const mockedStart = vi.mocked(startForwardingCheck);
const mockedGet = vi.mocked(getForwardingCheck);
const mockedConfirm = vi.mocked(confirmForwarding);
const mockedUpdateMyBusiness = vi.mocked(updateMyBusiness);

const CHECK_ID = "a".repeat(32);

function forwarding(
  overrides: Partial<OnboardingForwarding> = {}
): OnboardingForwarding {
  return {
    status: "ready",
    phoneNumber: "+34930453218",
    confirmedAt: null,
    firstCallAt: null,
    checkedAt: null,
    customerLine: "+34931112233",
    ...overrides,
  };
}

function comprobacion(
  resultado: ForwardingCheck["resultado"] = null
): ForwardingCheck {
  return {
    id: CHECK_ID,
    linea: "+34931112233",
    startedAt: "2026-09-21T10:00:00.000Z",
    resultado,
    resueltaAt: resultado ? "2026-09-21T10:00:20.000Z" : null,
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

function renderCard(
  estado: OnboardingForwarding = forwarding(),
  customerLineType: CustomerLineType | null = null
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CallForwardingCard
        forwarding={estado}
        customerLineType={customerLineType}
      />
    </QueryClientProvider>
  );
  return queryClient;
}

/** Pulsa «Comprobar desvío» y «Llamar ahora»; deja la comprobación en curso. */
async function lanzarComprobacion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /comprobar desvío/i }));
  await user.click(screen.getByRole("button", { name: /llamar ahora/i }));
}

describe("CallForwardingCard · códigos según el tipo de línea", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con un fijo enseña *61* y *21* sin el doble asterisco, con la nota del contestador", () => {
    renderCard(forwarding(), "fijo");

    expect(screen.getByText("*61*+34930453218#")).toBeInTheDocument();
    expect(screen.getByText("*21*+34930453218#")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*61\*/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Otras formas de desviar")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    expect(
      screen.getByText(/Si tu fijo tiene contestador, desactívalo/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Desde un móvil")).not.toBeInTheDocument();
    expect(
      screen.queryByText("¿De qué tipo es esta línea?")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /comprobar desvío/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ya lo he activado/i })
    ).toBeInTheDocument();
  });

  it.each(["movil_trabajo", "movil_personal"] as const)(
    "con %s enseña los códigos de móvil, «cuando no contestas» recomendado y la nota del buzón",
    (tipo) => {
      renderCard(forwarding(), tipo);

      expect(screen.getByText("**61*+34930453218#")).toBeInTheDocument();
      expect(screen.getByText("Recomendado")).toBeInTheDocument();
      expect(screen.getByText("Otras formas de desviar")).toBeInTheDocument();
      expect(screen.getByText("**21*+34930453218#")).toBeInTheDocument();
      expect(
        screen.getByText(/Este desvío sustituye al buzón de voz/)
      ).toBeInTheDocument();
      expect(screen.queryByText("Desde un fijo")).not.toBeInTheDocument();
      expect(screen.queryByText("*61*+34930453218#")).not.toBeInTheDocument();
      expect(
        screen.queryByText("¿De qué tipo es esta línea?")
      ).not.toBeInTheDocument();
    }
  );

  it("con Alhabla como número principal no hay tarjeta, ni siquiera mientras se activa el número", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CallForwardingCard
          forwarding={forwarding()}
          customerLineType="alhabla"
        />
        <CallForwardingCard
          forwarding={forwarding({
            status: "waiting_number",
            phoneNumber: null,
          })}
          customerLineType="alhabla"
        />
      </QueryClientProvider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("sin tipo (negocio antiguo) enseña móvil y fijo y pregunta el tipo; elegir uno lo guarda y actualiza el negocio en caché", async () => {
    const user = userEvent.setup();
    const negocio = { id: "neg_1", customerLineType: "fijo" } as Business;
    mockedUpdateMyBusiness.mockResolvedValue(negocio);
    const queryClient = renderCard(forwarding(), null);
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    expect(screen.getByText("Desde un móvil")).toBeInTheDocument();
    expect(screen.getByText("Desde un fijo")).toBeInTheDocument();
    expect(screen.getByText("**61*+34930453218#")).toBeInTheDocument();
    expect(screen.getByText("¿De qué tipo es esta línea?")).toBeInTheDocument();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))
    ).toEqual(["fijo", "movil_trabajo", "movil_personal"]);

    await user.click(screen.getByRole("radio", { name: /El fijo del local/ }));

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledWith({
        customerLineType: "fijo",
      })
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(["my-business"])).toBe(negocio)
    );
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["onboarding-state"] });
  });

  it("si guardar el tipo falla lo dice y deja volver a elegir", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockRejectedValue(new Error("Network Error"));
    renderCard(forwarding(), null);

    await user.click(
      screen.getByRole("radio", { name: /Un móvil de trabajo/ })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No se pudo guardar el tipo de línea/
    );
    expect(
      screen.getByRole("radio", { name: /El fijo del local/ })
    ).toBeEnabled();
  });

  it("tras el fallo la tarjeta se suelta y se puede reintentar la misma opción", async () => {
    const user = userEvent.setup();
    mockedUpdateMyBusiness.mockRejectedValueOnce(new Error("Network Error"));
    renderCard(forwarding(), null);

    const movilDeTrabajo = screen.getByRole("radio", {
      name: /Un móvil de trabajo/,
    });
    await user.click(movilDeTrabajo);
    await screen.findByRole("alert");

    // Un radio que siguiera marcado no volvería a disparar onChange.
    expect(movilDeTrabajo).not.toBeChecked();

    mockedUpdateMyBusiness.mockResolvedValueOnce({
      id: "neg_1",
      customerLineType: "movil_trabajo",
    } as Business);
    await user.click(movilDeTrabajo);

    await waitFor(() =>
      expect(mockedUpdateMyBusiness).toHaveBeenCalledTimes(2)
    );
    expect(mockedUpdateMyBusiness).toHaveBeenLastCalledWith({
      customerLineType: "movil_trabajo",
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sin línea de clientes no tiene sentido preguntar el tipo", () => {
    renderCard(forwarding({ customerLine: null }), null);

    expect(
      screen.queryByText("¿De qué tipo es esta línea?")
    ).not.toBeInTheDocument();
    expect(screen.getByText("**61*+34930453218#")).toBeInTheDocument();
  });
});

describe("CallForwardingCard · «Comprobar desvío»", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStart.mockResolvedValue(comprobacion());
    mockedGet.mockResolvedValue(comprobacion());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mantiene los códigos y el respaldo «Ya lo he activado» junto al nuevo bloque", () => {
    renderCard();

    expect(screen.getByText("**61*+34930453218#")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ya lo he activado/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /comprobar desvío/i })
    ).toBeInTheDocument();
  });

  it("sin línea de clientes no se puede comprobar: manda a Ajustes", () => {
    renderCard(forwarding({ customerLine: null }));

    expect(
      screen.queryByRole("button", { name: /comprobar desvío/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /añádelo en ajustes/i })
    ).toHaveAttribute("href", "/ajustes");
  });

  it("con un backend que aún no expone la línea de clientes, el bloque no aparece", () => {
    renderCard(forwarding({ customerLine: undefined }));

    expect(
      screen.queryByText("Comprueba que funciona")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ya lo he activado/i })
    ).toBeInTheDocument();
  });

  it("avisa antes de llamar («no lo cojas») y se puede cancelar sin llamar", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /comprobar desvío/i }));

    expect(
      screen.getByText("Vamos a llamar al +34 931 11 22 33. No lo cojas.")
    ).toBeInTheDocument();
    expect(mockedStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(
      screen.queryByRole("button", { name: /llamar ahora/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /comprobar desvío/i })
    ).toBeInTheDocument();
    expect(mockedStart).not.toHaveBeenCalled();
  });

  it("llama, consulta el resultado cada dos segundos y enseña «Desvío funcionando»; «Continuar» refresca la guía", async () => {
    const user = userEvent.setup();
    mockedGet
      .mockResolvedValueOnce(comprobacion())
      .mockResolvedValueOnce(comprobacion({ estado: "ok" }));
    const queryClient = renderCard();
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    await lanzarComprobacion(user);

    expect(mockedStart).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/llamando al \+34 931 11 22 33… no lo cojas/i)
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Desvío funcionando", {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(mockedGet).toHaveBeenCalledWith(CHECK_ID);
    // Sigue sin cerrarse sola: la persona lee el resultado y continúa.
    expect(invalidar).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /continuar/i }));

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["onboarding-state"] });
    // Al resolverse deja de consultar.
    await new Promise((resolve) =>
      setTimeout(resolve, INTERVALO_DE_CONSULTA_MS + 200)
    );
    expect(mockedGet).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("explica cada motivo de fallo y deja volver a comprobar", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      comprobacion({ estado: "fallo", motivo: "sin_desvio" })
    );
    renderCard();

    await lanzarComprobacion(user);

    expect(
      await screen.findByText(TEXTO_POR_MOTIVO.sin_desvio.titulo)
    ).toBeInTheDocument();
    expect(
      screen.getByText(TEXTO_POR_MOTIVO.sin_desvio.detalle)
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/contestador/i);

    await user.click(
      screen.getByRole("button", { name: /volver a comprobar/i })
    );

    expect(
      screen.getByText("Vamos a llamar al +34 931 11 22 33. No lo cojas.")
    ).toBeInTheDocument();
  });

  it("«la has cogido» y «comunicando» tienen su propio texto", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      comprobacion({ estado: "fallo", motivo: "la_has_cogido" })
    );
    renderCard();

    await lanzarComprobacion(user);

    expect(
      await screen.findByText(TEXTO_POR_MOTIVO.la_has_cogido.titulo)
    ).toBeInTheDocument();
    expect(TEXTO_POR_MOTIVO.comunicando.titulo).toMatch(/comunicando/i);
    expect(TEXTO_POR_MOTIVO.desconocido.detalle).toMatch(/ya lo he activado/i);
  });

  it("con el límite de la hora agotado lo dice y no queda en curso", async () => {
    const user = userEvent.setup();
    mockedStart.mockRejectedValue(
      errorHttp(429, { error: "Máximo 3", code: "limite_alcanzado" })
    );
    renderCard();

    await lanzarComprobacion(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /agotado las tres comprobaciones de esta hora/i
    );
    expect(mockedGet).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /llamar ahora/i })
    ).toBeInTheDocument();
  });

  it("si la línea no es un fijo ni un móvil español lo dice y manda a Ajustes", async () => {
    const user = userEvent.setup();
    mockedStart.mockRejectedValue(
      errorHttp(409, { error: "Solo España", code: "linea_no_admitida" })
    );
    renderCard();

    await lanzarComprobacion(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /fijo o un móvil de España/i
    );
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("un rechazo sin código conocido tiene un texto genérico", async () => {
    const user = userEvent.setup();
    mockedStart.mockRejectedValue(errorHttp(500, { error: "boom" }));
    renderCard();

    await lanzarComprobacion(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no hemos podido iniciar la comprobación/i
    );
  });

  it("si no llega respuesta en 25 consultas (50 s) lo dice y ofrece repetir", async () => {
    // Con temporizadores falsos, userEvent se queda esperando sus propios
    // retardos; fireEvent es síncrono y basta para pulsar dos botones.
    vi.useFakeTimers();
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /comprobar desvío/i }));
    fireEvent.click(screen.getByRole("button", { name: /llamar ahora/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedGet).toHaveBeenCalledTimes(1);

    for (let i = 1; i < MAX_CONSULTAS; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVALO_DE_CONSULTA_MS);
      });
    }
    expect(mockedGet).toHaveBeenCalledTimes(MAX_CONSULTAS);
    // TanStack avisa del resultado en un setTimeout(0) que cae justo en el
    // borde del tic anterior: se vacía la cola de temporizadores pendientes.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByText("No hemos recibido respuesta")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /volver a comprobar/i })
    ).toBeInTheDocument();

    // Y no sigue consultando.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_DE_CONSULTA_MS * 2);
    });
    expect(mockedGet).toHaveBeenCalledTimes(MAX_CONSULTAS);
  });

  it("el respaldo manual sigue funcionando igual", async () => {
    const user = userEvent.setup();
    mockedConfirm.mockResolvedValue({
      confirmedAt: "2026-09-21T10:00:00.000Z",
    });
    const queryClient = renderCard();
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    await user.click(
      screen.getByRole("button", { name: /ya lo he activado/i })
    );

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ["onboarding-state"] })
    );
  });
});

describe("ComprobarDesvio en Ajustes › Teléfono", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedStart.mockResolvedValue(comprobacion());
    mockedGet.mockResolvedValue(comprobacion());
  });

  function renderEnAjustes(customerLine: string | null = "+34931112233") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ComprobarDesvio customerLine={customerLine} contexto="ajustes" />
      </QueryClientProvider>
    );
    return queryClient;
  }

  it("el motivo «desconocido» no manda a un botón que en Ajustes no existe", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      comprobacion({ estado: "fallo", motivo: "desconocido" })
    );
    renderEnAjustes();

    await lanzarComprobacion(user);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(
      TEXTO_POR_MOTIVO_EN_AJUSTES.desconocido!.detalle
    );
    expect(alerta).not.toHaveTextContent(/ya lo he activado/i);
    // Los demás motivos siguen con su texto de siempre.
    expect(TEXTO_POR_MOTIVO_EN_AJUSTES.sin_desvio).toBeUndefined();
  });

  it("una línea no admitida manda al bloque de arriba, no «a Ajustes»", async () => {
    const user = userEvent.setup();
    mockedStart.mockRejectedValue(
      errorHttp(409, { error: "Solo España", code: "linea_no_admitida" })
    );
    renderEnAjustes();

    await lanzarComprobacion(user);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/revisa arriba/i);
    expect(alerta).not.toHaveTextContent(/en Ajustes/i);
  });

  it("tras «Desvío funcionando», «Hecho» refresca el estado y vuelve al botón inicial", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(comprobacion({ estado: "ok" }));
    const queryClient = renderEnAjustes();
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    await lanzarComprobacion(user);

    expect(await screen.findByText("Desvío funcionando")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /continuar/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^hecho$/i }));

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["onboarding-state"] });
    expect(screen.queryByText("Desvío funcionando")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /comprobar desvío/i })
    ).toBeInTheDocument();
  });
});

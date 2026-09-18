import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError, AxiosHeaders } from "axios";
import { AppleCalendarConnect } from "@/components/apple-calendar-connect";
import { connectAppleCalendar, selectCalendar } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  connectAppleCalendar: vi.fn(),
  selectCalendar: vi.fn(),
}));

const mockedConnect = vi.mocked(connectAppleCalendar);
const mockedSelect = vi.mocked(selectCalendar);

function errorHttp(status: number, data: unknown) {
  const error = new AxiosError("fallo", undefined, undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
  return error;
}

function renderizar(
  props: Partial<React.ComponentProps<typeof AppleCalendarConnect>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const onConnected = vi.fn();
  const onCancel = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <AppleCalendarConnect
        onConnected={onConnected}
        onCancel={onCancel}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onConnected, onCancel };
}

function rellenarYEnviar(
  username = "pelu@icloud.com",
  appPassword = "abcd-efgh-ijkl-mnop"
) {
  fireEvent.change(screen.getByLabelText("Apple ID"), {
    target: { value: ` ${username} ` },
  });
  fireEvent.change(screen.getByLabelText("Contraseña de aplicación"), {
    target: { value: appPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
}

describe("AppleCalendarConnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explica que se necesita una contraseña de aplicación y enlaza a la cuenta de Apple", () => {
    renderizar();
    expect(
      screen.getByText("contraseña de aplicación", { selector: "strong" })
    ).toBeInTheDocument();
    const enlace = screen.getByRole("link", { name: /tu cuenta de Apple/i });
    expect(enlace).toHaveAttribute(
      "href",
      expect.stringContaining("apple.com")
    );
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText("Contraseña de aplicación")).toHaveAttribute(
      "type",
      "password"
    );
  });

  it("envía usuario (sin espacios) y contraseña, y muestra los calendarios de la cuenta", async () => {
    mockedConnect.mockResolvedValue({
      email: "pelu@icloud.com",
      calendars: [
        { id: "https://p01/cal/a/", name: "Peluquería", primary: false },
        { id: "https://p01/cal/b/", name: "Personal", primary: false },
      ],
    });
    renderizar();

    rellenarYEnviar();

    await waitFor(() =>
      expect(
        screen.getByText(/Cuenta verificada · pelu@icloud.com/)
      ).toBeInTheDocument()
    );
    // TanStack Query añade un segundo argumento (contexto) a mutationFn.
    expect(mockedConnect.mock.calls[0][0]).toEqual({
      username: "pelu@icloud.com",
      appPassword: "abcd-efgh-ijkl-mnop",
    });
    expect(
      screen.getByRole("button", { name: "Peluquería" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Personal" })
    ).toBeInTheDocument();
  });

  it("al elegir un calendario lo guarda y avisa con el negocio actualizado", async () => {
    mockedConnect.mockResolvedValue({
      email: "pelu@icloud.com",
      calendars: [
        { id: "https://p01/cal/a/", name: "Peluquería", primary: false },
      ],
    });
    const negocio = { id: "biz_1", calendarProvider: "caldav" } as never;
    mockedSelect.mockResolvedValue(negocio);
    const { onConnected } = renderizar();

    rellenarYEnviar();
    await waitFor(() => screen.getByRole("button", { name: "Peluquería" }));
    fireEvent.click(screen.getByRole("button", { name: "Peluquería" }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(negocio));
    expect(mockedSelect.mock.calls[0][0]).toBe("https://p01/cal/a/");
  });

  it("credenciales rechazadas por Apple: mensaje hablable y se puede reintentar", async () => {
    mockedConnect.mockRejectedValue(
      errorHttp(400, { code: "CALDAV_INVALID_CREDENTIALS", error: "x" })
    );
    renderizar();

    rellenarYEnviar("pelu@icloud.com", "mala");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Apple ha rechazado/)
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/lleva la @/);
    // Sigue en el formulario, con el botón habilitado para reintentar.
    expect(screen.getByRole("button", { name: "Conectar" })).toBeEnabled();
  });

  it("iCloud caído (502): mensaje de reintento, no de credenciales", async () => {
    mockedConnect.mockRejectedValue(
      errorHttp(502, { code: "CALENDAR_TIMEOUT", error: "tarda" })
    );
    renderizar();
    rellenarYEnviar();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/iCloud no responde/)
    );
  });

  it("cancelar avisa al padre", () => {
    const { onCancel } = renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

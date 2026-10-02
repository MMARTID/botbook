import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BeforeSendEvent } from "@vercel/analytics/next";
import {
  GoogleAnalytics,
  abrirPreferenciasDeCookies,
} from "@/components/google-analytics";
import { AnaliticaDeLaApp } from "@/components/analitica-de-la-app";
import { webUrl } from "@/lib/web-url";

const estado = vi.hoisted(() => ({
  ruta: "/agenda",
  alCargar: null as null | (() => void),
  filtrar: null as null | ((evento: BeforeSendEvent) => BeforeSendEvent | null),
}));

vi.mock("next/navigation", () => ({ usePathname: () => estado.ruta }));
vi.mock("next/script", () => ({
  default: ({ onReady }: { onReady: () => void }) => {
    estado.alCargar = onReady;
    return null;
  },
}));
vi.mock("@vercel/analytics/next", () => ({
  Analytics: ({ beforeSend }: { beforeSend: typeof estado.filtrar }) => {
    estado.filtrar = beforeSend;
    return null;
  },
}));

const CLASE_SOBRE_BARRA_INFERIOR =
  "bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))]";

function vistas() {
  return (window.dataLayer ?? []).filter(
    (entrada) => Array.isArray(entrada) && entrada[1] === "page_view"
  ) as unknown[][];
}

function evento(ruta: string): BeforeSendEvent {
  return { type: "pageview", url: `${window.location.origin}${ruta}` };
}

beforeEach(() => {
  document.cookie = "alhabla_analitica=; Path=/; Max-Age=0";
  window.history.replaceState(null, "", "/agenda?cliente=secreto");
  window.dataLayer = undefined;
  window.gtag = undefined;
  window.alhablaGtagConfigurado = false;
  estado.ruta = "/agenda";
  estado.alCargar = null;
  estado.filtrar = null;
});

describe("analítica de la app", () => {
  it("en la aplicación respeta el rechazo y nunca envía parámetros de la URL", async () => {
    render(<AnaliticaDeLaApp />);
    expect(
      await screen.findByText("Preferencias de cookies")
    ).toBeInTheDocument();
    expect(estado.alCargar).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Aceptar cookies" }));
    await waitFor(() => expect(estado.alCargar).not.toBeNull());
    act(() => estado.alCargar?.());

    expect(vistas()).toHaveLength(1);
    expect(vistas()[0][2]).toMatchObject({
      page_location: `${window.location.origin}/agenda`,
      content_group: "app",
    });
    expect(estado.filtrar?.(evento("/agenda?cliente=secreto"))).toMatchObject({
      url: `${window.location.origin}/agenda`,
    });

    fireEvent.click(screen.getByRole("button", { name: "Configurar cookies" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar cookies" }));
    expect(estado.filtrar?.(evento("/agenda"))).toBeNull();
  });

  it("en las rutas con tokens sale el aviso, pero no se mide la visita", async () => {
    estado.ruta = "/auth/entrar";
    window.history.replaceState(null, "", "/auth/entrar?pase=secreto");
    const { rerender } = render(<AnaliticaDeLaApp />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar cookies" })
    );
    await waitFor(() => expect(estado.alCargar).not.toBeNull());
    act(() => estado.alCargar?.());
    expect(vistas()).toHaveLength(0);

    for (const ruta of [
      "/auth/entrar?pase=secreto",
      "/auth/google/callback?code=secreto",
      "/dev/entrar",
      "/restablecer-contrasena?token=secreto",
      "/settings?code=secreto",
    ]) {
      expect(estado.filtrar?.(evento(ruta))).toBeNull();
    }
    // Se compara el segmento entero: «/devoluciones» no es «/dev».
    expect(estado.filtrar?.(evento("/devoluciones"))).not.toBeNull();

    // Al salir a una ruta sin tokens, la visita sí se mide.
    estado.ruta = "/agenda";
    rerender(<AnaliticaDeLaApp />);
    await waitFor(() => expect(vistas()).toHaveLength(1));
    expect(vistas()[0][2]).toMatchObject({ page_path: "/agenda" });
  });

  it("el enlace de privacidad lleva a la política de la web", async () => {
    render(<AnaliticaDeLaApp />);
    expect(
      await screen.findByRole("link", { name: "Más información" })
    ).toHaveAttribute("href", webUrl("/legal/privacidad"));
  });

  it("dentro del panel, el aviso queda encima de la barra inferior y el botón solo sale en escritorio, a la derecha", async () => {
    render(<AnaliticaDeLaApp />);
    const aviso = (await screen.findByText("Preferencias de cookies")).closest(
      "aside"
    );
    expect(aviso).toHaveClass(CLASE_SOBRE_BARRA_INFERIOR, "lg:bottom-4");

    fireEvent.click(screen.getByRole("button", { name: "Rechazar cookies" }));
    expect(
      screen.getByRole("button", { name: "Configurar cookies" })
    ).toHaveClass("right-4", "hidden", "lg:inline-flex");
  });

  it("sin armazón del panel (login, alta…), aviso y botón van abajo a la izquierda", async () => {
    estado.ruta = "/login";
    render(<AnaliticaDeLaApp />);
    const aviso = (await screen.findByText("Preferencias de cookies")).closest(
      "aside"
    );
    expect(aviso).toHaveClass("bottom-4");
    expect(aviso).not.toHaveClass(CLASE_SOBRE_BARRA_INFERIOR);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar cookies" }));
    const boton = screen.getByRole("button", { name: "Configurar cookies" });
    expect(boton).toHaveClass("left-4", "inline-flex");
    expect(boton).not.toHaveClass("hidden");
  });

  it("abrirPreferenciasDeCookies() reabre el aviso (la hoja «Más» del móvil)", async () => {
    render(<AnaliticaDeLaApp />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Rechazar cookies" })
    );
    expect(
      screen.queryByRole("button", { name: "Aceptar cookies" })
    ).not.toBeInTheDocument();

    act(() => abrirPreferenciasDeCookies());
    expect(
      screen.getByRole("button", { name: "Aceptar cookies" })
    ).toBeInTheDocument();
  });
});

describe("props del componente compartido", () => {
  it("usa el enlace de privacidad que llega por prop", async () => {
    render(
      <GoogleAnalytics enlaceDePrivacidad="https://alhabla.ai/legal/privacidad" />
    );
    expect(
      await screen.findByRole("link", { name: "Más información" })
    ).toHaveAttribute("href", "https://alhabla.ai/legal/privacidad");
  });

  it("en rutasSinAnalitica no pinta nada ni carga scripts, aunque se haya aceptado", () => {
    document.cookie = "alhabla_analitica=aceptada; Path=/";
    estado.ruta = "/interna/editor";
    const { container } = render(
      <GoogleAnalytics
        enlaceDePrivacidad="/legal/privacidad"
        rutasSinAnalitica={["interna"]}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(estado.alCargar).toBeNull();
    expect(estado.filtrar).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });
});

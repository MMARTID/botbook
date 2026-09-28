import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BeforeSendEvent } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@/components/google-analytics";

const estado = vi.hoisted(() => ({
  ruta: "/planes",
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

// La misma configuración que monta web/src/app/layout.tsx.
const RUTAS_INTERNAS = ["keystatic", "vista-previa", "preview", "api"];

function comoEnLaWeb() {
  return (
    <GoogleAnalytics
      enlaceDePrivacidad="/legal/privacidad"
      rutasSinAnalitica={RUTAS_INTERNAS}
    />
  );
}

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
  document.cookie = "_ga=; Path=/; Max-Age=0";
  window.history.replaceState(null, "", "/planes?token=secreto");
  window.dataLayer = undefined;
  window.gtag = undefined;
  window.alhablaGtagConfigurado = false;
  estado.ruta = "/planes";
  estado.alCargar = null;
  estado.filtrar = null;
});

describe("consentimiento de analítica", () => {
  it("no carga ninguna etiqueta antes de la elección y permite rechazar", async () => {
    render(comoEnLaWeb());
    expect(
      await screen.findByText("Preferencias de cookies")
    ).toBeInTheDocument();
    expect(estado.alCargar).toBeNull();
    expect(estado.filtrar).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));
    expect(document.cookie).toContain("alhabla_analitica=rechazada");
    expect(estado.alCargar).toBeNull();
    expect(
      screen.getByRole("button", { name: "Configurar cookies" })
    ).toBeInTheDocument();
  });

  it("mide una URL sin parámetros y detiene ambos proveedores al revocar", async () => {
    render(comoEnLaWeb());
    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar analítica" })
    );
    await waitFor(() => expect(estado.alCargar).not.toBeNull());

    act(() => estado.alCargar?.());
    await waitFor(() => expect(vistas()).toHaveLength(1));
    const configuracion = (window.dataLayer ?? []).find(
      (entrada) => Array.isArray(entrada) && entrada[0] === "config"
    ) as unknown[];
    expect(configuracion[2]).toMatchObject({
      page_location: `${window.location.origin}/planes`,
      send_page_view: false,
    });
    expect(vistas()[0][2]).toMatchObject({
      page_path: "/planes",
      page_location: `${window.location.origin}/planes`,
    });
    expect(estado.filtrar?.(evento("/planes?token=secreto"))).toMatchObject({
      url: `${window.location.origin}/planes`,
    });

    document.cookie = "_ga=identificador; Path=/";
    fireEvent.click(screen.getByRole("button", { name: "Configurar cookies" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));

    expect(document.cookie).not.toContain("_ga=identificador");
    expect(Reflect.get(window, "ga-disable-G-Z3RT28K0ZJ")).toBe(true);
    expect(estado.filtrar?.(evento("/planes"))).toBeNull();
    expect(vistas()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Configurar cookies" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));
    act(() => estado.alCargar?.());
    await waitFor(() => expect(vistas()).toHaveLength(2));
    expect(Reflect.get(window, "ga-disable-G-Z3RT28K0ZJ")).toBe(false);
  });

  it.each([
    "/keystatic/branch/main",
    "/vista-previa/primer-articulo",
    "/preview",
    "/api/keystatic/github/login",
  ])(
    "no carga nada en la ruta interna %s, aunque se haya aceptado la analítica",
    (ruta) => {
      // La visita aceptó la analítica en otra página; el editor del blog es
      // interno: ni scripts de medición ni aviso de cookies.
      document.cookie = "alhabla_analitica=aceptada; Path=/";
      estado.ruta = ruta;
      const { container } = render(comoEnLaWeb());
      expect(container).toBeEmptyDOMElement();
      expect(estado.alCargar).toBeNull();
      expect(estado.filtrar).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Aceptar analítica" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Configurar cookies" })
      ).not.toBeInTheDocument();
    }
  );

  it("el filtro de Vercel descarta las rutas internas aunque se haya aceptado", async () => {
    render(comoEnLaWeb());
    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar analítica" })
    );
    await waitFor(() => expect(estado.filtrar).not.toBeNull());

    expect(estado.filtrar?.(evento("/keystatic"))).toBeNull();
    expect(
      estado.filtrar?.(evento("/vista-previa/primer-articulo"))
    ).toBeNull();
    // Se compara el segmento entero: «/previews» no es «/preview».
    expect(estado.filtrar?.(evento("/previews"))).not.toBeNull();
  });
});

describe("aviso de cookies", () => {
  it("el enlace «Más información» es el que llega por prop", async () => {
    render(comoEnLaWeb());
    expect(
      await screen.findByRole("link", { name: "Más información" })
    ).toHaveAttribute("href", "/legal/privacidad");
  });

  it("sin armazón del panel, aviso y botón van abajo a la izquierda", async () => {
    render(comoEnLaWeb());
    const aviso = (await screen.findByText("Preferencias de cookies")).closest(
      "aside"
    );
    expect(aviso).toHaveClass("bottom-4");
    expect(aviso).not.toHaveClass("lg:bottom-4");

    fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));
    const boton = screen.getByRole("button", { name: "Configurar cookies" });
    expect(boton).toHaveClass("left-4", "inline-flex");
    expect(boton).not.toHaveClass("hidden");
  });

  it("con dentroDelPanel, el aviso sube sobre la barra inferior y el botón pasa a la derecha", async () => {
    render(
      <GoogleAnalytics enlaceDePrivacidad="/legal/privacidad" dentroDelPanel />
    );
    const aviso = (await screen.findByText("Preferencias de cookies")).closest(
      "aside"
    );
    expect(aviso).toHaveClass(
      "bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))]",
      "lg:bottom-4"
    );

    fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));
    expect(
      screen.getByRole("button", { name: "Configurar cookies" })
    ).toHaveClass("right-4", "hidden", "lg:inline-flex");
  });

  it("en rutasSinMedicion sale el aviso, pero no se envía page_view", async () => {
    estado.ruta = "/con-token/abc";
    const { rerender } = render(
      <GoogleAnalytics
        enlaceDePrivacidad="/legal/privacidad"
        rutasSinMedicion={["con-token"]}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Aceptar analítica" })
    );
    await waitFor(() => expect(estado.alCargar).not.toBeNull());
    act(() => estado.alCargar?.());
    expect(vistas()).toHaveLength(0);
    expect(estado.filtrar?.(evento("/con-token/abc"))).toBeNull();

    estado.ruta = "/planes";
    rerender(
      <GoogleAnalytics
        enlaceDePrivacidad="/legal/privacidad"
        rutasSinMedicion={["con-token"]}
      />
    );
    await waitFor(() => expect(vistas()).toHaveLength(1));
  });
});

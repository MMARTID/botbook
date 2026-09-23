import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    render(<GoogleAnalytics />);
    expect(await screen.findByText("Preferencias de cookies")).toBeInTheDocument();
    expect(estado.alCargar).toBeNull();
    expect(estado.filtrar).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));
    expect(document.cookie).toContain("alhabla_analitica=rechazada");
    expect(estado.alCargar).toBeNull();
    expect(screen.getByRole("button", { name: "Configurar cookies" })).toBeInTheDocument();
  });

  it("mide una URL sin parámetros y detiene ambos proveedores al revocar", async () => {
    render(<GoogleAnalytics />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceptar analítica" }));
    await waitFor(() => expect(estado.alCargar).not.toBeNull());

    act(() => estado.alCargar?.());
    const vistas = () => (window.dataLayer ?? []).filter((entrada) => Array.isArray(entrada) && entrada[1] === "page_view") as unknown[][];
    await waitFor(() => expect(vistas()).toHaveLength(1));
    const configuracion = (window.dataLayer ?? []).find((entrada) => Array.isArray(entrada) && entrada[0] === "config") as unknown[];
    expect(configuracion[2]).toMatchObject({ page_location: `${window.location.origin}/planes`, send_page_view: false });
    expect(vistas()[0][2]).toMatchObject({
      page_path: "/planes",
      page_location: `${window.location.origin}/planes`,
    });
    expect(estado.filtrar?.({ type: "pageview", url: `${window.location.origin}/planes?token=secreto` })).toMatchObject({
      url: `${window.location.origin}/planes`,
    });

    document.cookie = "_ga=identificador; Path=/";
    fireEvent.click(screen.getByRole("button", { name: "Configurar cookies" }));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));

    expect(document.cookie).not.toContain("_ga=identificador");
    expect(Reflect.get(window, "ga-disable-G-Z3RT28K0ZJ")).toBe(true);
    expect(estado.filtrar?.({ type: "pageview", url: `${window.location.origin}/planes` })).toBeNull();
    expect(vistas()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Configurar cookies" }));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));
    act(() => estado.alCargar?.());
    await waitFor(() => expect(vistas()).toHaveLength(2));
    expect(Reflect.get(window, "ga-disable-G-Z3RT28K0ZJ")).toBe(false);
  });

  it("excluye la edición privada aunque se haya aceptado la analítica", async () => {
    estado.ruta = "/keystatic/branch/main";
    render(<GoogleAnalytics />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceptar analítica" }));
    await waitFor(() => expect(estado.alCargar).not.toBeNull());
    act(() => estado.alCargar?.());
    expect((window.dataLayer ?? []).filter((entrada) => Array.isArray(entrada) && entrada[1] === "page_view")).toHaveLength(0);
    expect(estado.filtrar?.({ type: "pageview", url: `${window.location.origin}/keystatic/branch/main` })).toBeNull();
  });
});

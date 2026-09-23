import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { BeforeSendEvent } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@/components/google-analytics";

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

it("en la aplicación respeta el rechazo y nunca envía parámetros de la URL", async () => {
  render(<GoogleAnalytics />);
  expect(await screen.findByText("Preferencias de cookies")).toBeInTheDocument();
  expect(estado.alCargar).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));
  await waitFor(() => expect(estado.alCargar).not.toBeNull());
  act(() => estado.alCargar?.());

  const vistas = (window.dataLayer ?? []).filter((entrada) => Array.isArray(entrada) && entrada[1] === "page_view") as unknown[][];
  expect(vistas).toHaveLength(1);
  expect(vistas[0][2]).toMatchObject({ page_location: `${window.location.origin}/agenda` });
  expect(estado.filtrar?.({ type: "pageview", url: `${window.location.origin}/agenda?cliente=secreto` })).toMatchObject({
    url: `${window.location.origin}/agenda`,
  });

  fireEvent.click(screen.getByRole("button", { name: "Configurar cookies" }));
  fireEvent.click(screen.getByRole("button", { name: "Rechazar analítica" }));
  expect(estado.filtrar?.({ type: "pageview", url: `${window.location.origin}/agenda` })).toBeNull();
});

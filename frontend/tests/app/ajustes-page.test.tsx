import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountSettingsPage from "@/app/ajustes/page";
import { useBusiness } from "@/components/providers";
import { getAccountOverview } from "@/lib/api";
import type { AccountOverview } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/providers", () => ({
  useBusiness: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getAccountOverview: vi.fn(),
  changeAccountPassword: vi.fn(),
  deleteAccount: vi.fn(),
  updateMyBusiness: vi.fn(),
}));

const mockedUseBusiness = vi.mocked(useBusiness);
const mockedGetAccountOverview = vi.mocked(getAccountOverview);

const CLAVE_CUENTA = ["account-overview"];

const NEGOCIO = {
  id: "neg_1",
  name: "Peluquería Lola",
  phone: "+34600111222",
  timezone: "Europe/Madrid",
} as unknown as ReturnType<typeof useBusiness>["business"];

const CUENTA: AccountOverview = {
  email: "lola@peluquerialola.es",
  passwordConfigured: true,
  googleConnected: false,
};

function estadoDeNegocio(overrides: Partial<ReturnType<typeof useBusiness>>) {
  mockedUseBusiness.mockReturnValue({
    business: null,
    hasToken: true,
    isLoadingBusiness: false,
    isError: false,
    errorMessage: null,
    ...overrides,
  } as ReturnType<typeof useBusiness>);
}

// Cliente real de React Query (sin reintentos) en vez de un mock de `useQuery`:
// lo que se quiere comprobar es precisamente cómo se comporta la página con
// la semántica real de la caché cuando un refresco falla.
function renderPage(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={queryClient}>
      <AccountSettingsPage />
    </QueryClientProvider>
  );
  return queryClient;
}

describe("AccountSettingsPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enseña la pantalla de error si la cuenta no llega y no hay nada en caché", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockRejectedValue(new Error("Network Error"));

    renderPage();

    expect(await screen.findByText("No se pudieron cargar los ajustes")).toBeInTheDocument();
    expect(screen.queryByText(CUENTA.email)).not.toBeInTheDocument();
  });

  // React Query conserva los datos en caché cuando un refresco falla (marca
  // error sin soltar `data`). Si la pantalla de error ganara en ese caso, un
  // microcorte de red le borraría los ajustes al usuario que los está mirando.
  it("mantiene los ajustes en pantalla si lo que falla es un refresco con datos ya cargados", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockRejectedValue(new Error("Network Error"));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(CLAVE_CUENTA, CUENTA);

    renderPage(queryClient);

    // Al montar, la query ya está caducada y vuelve a pedir la cuenta; hay que
    // esperar a que ese refresco falle de verdad para que la prueba signifique algo.
    await waitFor(() => expect(mockedGetAccountOverview).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryState(CLAVE_CUENTA)?.status).toBe("error"));

    expect(queryClient.getQueryData(CLAVE_CUENTA)).toEqual(CUENTA);
    expect(screen.getByText(CUENTA.email)).toBeInTheDocument();
    expect(screen.queryByText("No se pudieron cargar los ajustes")).not.toBeInTheDocument();
  });

  it("pinta los ajustes con normalidad cuando la cuenta carga bien", async () => {
    estadoDeNegocio({ business: NEGOCIO });
    mockedGetAccountOverview.mockResolvedValue(CUENTA);

    renderPage();

    expect(await screen.findByText(CUENTA.email)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ajustes" })).toBeInTheDocument();
  });

  it("no pinta nada mientras carga", () => {
    estadoDeNegocio({ isLoadingBusiness: true });

    renderPage();

    expect(screen.getByText("Cargando ajustes…")).toBeInTheDocument();
  });
});

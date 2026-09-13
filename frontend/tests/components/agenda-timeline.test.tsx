import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgendaTimeline } from "@/components/agenda-timeline";
import { getAgenda } from "@/lib/api";

vi.mock("@/lib/api", () => ({ getAgenda: vi.fn() }));

const mockedGetAgenda = vi.mocked(getAgenda);

function renderTimeline(offset = 50, onOffsetChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onOffsetChange,
    ...render(
      <QueryClientProvider client={client}>
        <AgendaTimeline
          days={30}
          offset={offset}
          timeZone="Europe/Madrid"
          calendarProvider="google"
          hasCalendar={false}
          onOffsetChange={onOffsetChange}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("AgendaTimeline", () => {
  it("expone la página posterior a las primeras 50 citas y permite volver", async () => {
    mockedGetAgenda.mockResolvedValue({
      from: "2026-09-13T00:00:00.000Z",
      until: "2026-10-13T00:00:00.000Z",
      total: 51,
      limit: 50,
      offset: 50,
      hasMore: false,
      bookings: [{
        id: "booking_51",
        callId: "call_51",
        programedAt: "2026-09-20T10:00:00.000Z",
        durationMinutes: 30,
        numberPeople: 1,
        clientPhone: null,
        professional: null,
        services: [{ id: "service_1", name: "Corte", durationMinutes: 30, priceCents: 1800 }],
        externalEventId: null,
        externalCalendarProvider: null,
      }],
    });
    const onOffsetChange = vi.fn();
    renderTimeline(50, onOffsetChange);

    expect(await screen.findByText("Corte")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "Mostrando 51–51 de 51 citas.")).toBeInTheDocument();
    expect(screen.getByText("Teléfono no disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onOffsetChange).toHaveBeenCalledWith(0);
  });
});

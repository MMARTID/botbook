import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusinessHoursEditor } from "@/components/business-hours-editor";
import type { BusinessSchedule } from "@/lib/types";

const HORARIO_BASE: BusinessSchedule = {
  version: 1,
  week: {
    monday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    tuesday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    wednesday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    thursday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    friday: { enabled: true, intervals: [{ start: "09:00", end: "18:00" }] },
    saturday: { enabled: false, intervals: [] },
    sunday: { enabled: false, intervals: [] },
  },
};

function fechaFutura(diasDesdeHoy: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  const desfase = fecha.getTimezoneOffset() * 60_000;
  return new Date(fecha.getTime() - desfase).toISOString().slice(0, 10);
}

function renderEditor(
  value: BusinessSchedule,
  onSave = vi.fn()
) {
  render(
    <BusinessHoursEditor
      value={value as unknown as Record<string, unknown>}
      timeZone="Europe/Madrid"
      isSaving={false}
      onSave={onSave}
      open
      onToggle={vi.fn()}
    />
  );
  return onSave;
}

describe("BusinessHoursEditor — festivos y días cerrados", () => {
  it("guarda el día cerrado con su motivo", async () => {
    const usuario = userEvent.setup();
    const onSave = renderEditor(HORARIO_BASE);
    const fecha = fechaFutura(30);

    await usuario.type(screen.getByLabelText("Fecha"), fecha);
    await usuario.type(screen.getByLabelText("Motivo (opcional)"), "Navidad");
    await usuario.click(screen.getByRole("button", { name: /Añadir día cerrado/ }));
    await usuario.click(screen.getAllByRole("button", { name: /Guardar horario/ })[0]);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].exceptions).toEqual([
      { date: fecha, closed: true, intervals: [], label: "Navidad" },
    ]);
  });

  it("no deja añadir una fecha ya pasada", async () => {
    const usuario = userEvent.setup();
    renderEditor(HORARIO_BASE);

    await usuario.type(screen.getByLabelText("Fecha"), fechaFutura(-5));
    await usuario.click(screen.getByRole("button", { name: /Añadir día cerrado/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa fecha ya ha pasado");
  });

  it("no duplica un día que ya está marcado", async () => {
    const usuario = userEvent.setup();
    const fecha = fechaFutura(10);
    renderEditor({
      ...HORARIO_BASE,
      exceptions: [{ date: fecha, closed: true, intervals: [], label: "Puente" }],
    });

    await usuario.type(screen.getByLabelText("Fecha"), fecha);
    await usuario.click(screen.getByRole("button", { name: /Añadir día cerrado/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya está en la lista");
  });

  it("permite quitar un día cerrado guardado", async () => {
    const usuario = userEvent.setup();
    const fecha = fechaFutura(20);
    const onSave = renderEditor({
      ...HORARIO_BASE,
      exceptions: [{ date: fecha, closed: true, intervals: [], label: "Vacaciones" }],
    });

    expect(screen.getByText("Vacaciones")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /^Quitar el día cerrado/ }));
    await usuario.click(screen.getAllByRole("button", { name: /Guardar horario/ })[0]);

    expect(onSave.mock.calls[0][0].exceptions).toEqual([]);
  });

  it("no enseña días especiales que ya han pasado", () => {
    renderEditor({
      ...HORARIO_BASE,
      exceptions: [
        { date: fechaFutura(-30), closed: true, intervals: [], label: "Festivo viejo" },
      ],
    });

    expect(screen.queryByText("Festivo viejo")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No hay ningún día especial guardado/)
    ).toBeInTheDocument();
  });
});

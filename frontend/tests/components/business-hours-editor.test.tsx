import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BusinessHoursEditor,
  DEFAULT_BUSINESS_SCHEDULE,
  getScheduleSummary,
} from "@/components/business-hours-editor";
import type { BusinessSchedule } from "@/lib/types";

function renderEditor(overrides: Partial<React.ComponentProps<typeof BusinessHoursEditor>> = {}) {
  const onSave = vi.fn();
  const onToggle = vi.fn();
  render(
    <BusinessHoursEditor
      value={DEFAULT_BUSINESS_SCHEDULE}
      timeZone="Europe/Madrid"
      isSaving={false}
      onSave={onSave}
      open
      onToggle={onToggle}
      {...overrides}
    />
  );
  return { onSave, onToggle };
}

describe("getScheduleSummary", () => {
  it("dice 'Cerrado toda la semana' si ningún día está abierto", () => {
    const schedule: BusinessSchedule = {
      version: 1,
      week: {
        monday: { enabled: false, intervals: [] },
        tuesday: { enabled: false, intervals: [] },
        wednesday: { enabled: false, intervals: [] },
        thursday: { enabled: false, intervals: [] },
        friday: { enabled: false, intervals: [] },
        saturday: { enabled: false, intervals: [] },
        sunday: { enabled: false, intervals: [] },
      },
    };
    expect(getScheduleSummary(schedule)).toBe("Cerrado toda la semana");
  });

  it("resume el horario por defecto como 'L-V, mismo horario'", () => {
    expect(getScheduleSummary(DEFAULT_BUSINESS_SCHEDULE)).toBe("5 días · 09:00–18:00");
  });

  it("dice 'con horario propio' si los días abiertos no comparten horario", () => {
    const schedule = JSON.parse(JSON.stringify(DEFAULT_BUSINESS_SCHEDULE)) as BusinessSchedule;
    schedule.week.tuesday.intervals = [{ start: "10:00", end: "14:00" }];
    expect(getScheduleSummary(schedule)).toBe("5 días abiertos con horario propio");
  });
});

describe("BusinessHoursEditor", () => {
  it("empieza con el lunes seleccionado y su horario visible", () => {
    renderEditor();

    expect(screen.getByText("Lunes", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("18:00")).toBeInTheDocument();
  });

  it("usa el horario por defecto si 'value' no es un BusinessSchedule válido", () => {
    renderEditor({ value: {} });

    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
  });

  it("cambia de día al hacer click en otro día de la lista", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: /Sábado/ }));

    expect(screen.getByText("Este día figura como cerrado.")).toBeInTheDocument();
  });

  it("activar un día cerrado le pone un tramo por defecto de 09:00 a 18:00", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Sábado/ }));

    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("18:00")).toBeInTheDocument();
  });

  it("desactivar un día abierto muestra el aviso de cerrado", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("checkbox"));

    expect(screen.getByText("Este día figura como cerrado.")).toBeInTheDocument();
  });

  it("añade un tramo nuevo hasta un máximo de 3", async () => {
    const user = userEvent.setup();
    renderEditor();
    const addButton = screen.getByRole("button", { name: /Añadir tramo/ });

    await user.click(addButton);
    expect(screen.getAllByLabelText("Hora de apertura")).toHaveLength(2);

    await user.click(addButton);
    expect(screen.getAllByLabelText("Hora de apertura")).toHaveLength(3);
    expect(addButton).toBeDisabled();
  });

  it("no permite eliminar el último tramo de un día abierto", () => {
    renderEditor();

    expect(screen.getByLabelText("Eliminar tramo")).toBeDisabled();
  });

  it("elimina un tramo cuando hay más de uno", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Añadir tramo/ }));

    await user.click(screen.getAllByLabelText("Eliminar tramo")[0]);

    expect(screen.getAllByLabelText("Hora de apertura")).toHaveLength(1);
  });

  it("editar la hora de un tramo actualiza su valor", async () => {
    const user = userEvent.setup();
    renderEditor();

    const startInput = screen.getByLabelText("Hora de apertura") as HTMLInputElement;
    await user.clear(startInput);
    await user.type(startInput, "10:00");

    expect(startInput.value).toBe("10:00");
  });

  it("'Copiar a L–V' aplica el horario del día seleccionado a lunes-viernes", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Sábado/ }));
    await user.click(screen.getByRole("checkbox")); // abrir sábado con 09:00-18:00
    const startInput = screen.getByLabelText("Hora de apertura") as HTMLInputElement;
    await user.clear(startInput);
    await user.type(startInput, "11:00");

    await user.click(screen.getByRole("button", { name: /Copiar a L–V/ }));
    await user.click(screen.getByRole("button", { name: /Lunes/ }));

    expect(screen.getByDisplayValue("11:00")).toBeInTheDocument();
  });

  it("Guardar horario llama a onSave con el estado actual", async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole("button", { name: /Guardar horario/ }));

    expect(onSave).toHaveBeenCalledWith(DEFAULT_BUSINESS_SCHEDULE);
  });

  it("deshabilita e indica 'Guardando...' mientras isSaving es true", () => {
    renderEditor({ isSaving: true });

    const saveButton = screen.getByRole("button", { name: /Guardando/ });
    expect(saveButton).toBeDisabled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProfessionalServiceLevels,
  describeServiceLevels,
  setServiceLevel,
  type ServiceLevelMap,
} from "@/components/professional-service-levels";

const SERVICES = [
  { id: "corte", name: "Corte" },
  { id: "color", name: "Color" },
  { id: "mechas", name: "Mechas" },
];

function renderLevels(value: ServiceLevelMap = {}, idPrefix = "prueba") {
  const onChange = vi.fn();
  render(
    <ProfessionalServiceLevels
      services={SERVICES}
      value={value}
      onChange={onChange}
      idPrefix={idPrefix}
    />
  );
  return { onChange };
}

describe("ProfessionalServiceLevels", () => {
  it("pinta un grupo de radios por servicio con nombre accesible «Nivel de …»", () => {
    renderLevels();

    for (const service of SERVICES) {
      const group = screen.getByRole("radiogroup", { name: `Nivel de ${service.name}` });
      const radios = within(group).getAllByRole("radio");
      expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
        "especialista",
        "normal",
        "no_sugerir",
      ]);
      expect(within(group).getByRole("radio", { name: "Especialista" })).toBeInTheDocument();
      expect(within(group).getByRole("radio", { name: "Lo hace" })).toBeInTheDocument();
      expect(within(group).getByRole("radio", { name: "No sugerir" })).toBeInTheDocument();
    }
  });

  it("marca «Lo hace» por defecto cuando el servicio no está en el mapa", () => {
    renderLevels({ corte: "especialista", mechas: "no_sugerir" });

    const corte = screen.getByRole("radiogroup", { name: "Nivel de Corte" });
    const color = screen.getByRole("radiogroup", { name: "Nivel de Color" });
    const mechas = screen.getByRole("radiogroup", { name: "Nivel de Mechas" });

    expect(within(corte).getByRole("radio", { name: "Especialista" })).toBeChecked();
    expect(within(color).getByRole("radio", { name: "Lo hace" })).toBeChecked();
    expect(within(mechas).getByRole("radio", { name: "No sugerir" })).toBeChecked();
  });

  it("al elegir un nivel emite el mapa completo con el cambio aplicado", () => {
    const { onChange } = renderLevels({ corte: "especialista" });

    const color = screen.getByRole("radiogroup", { name: "Nivel de Color" });
    fireEvent.click(within(color).getByRole("radio", { name: "No sugerir" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ corte: "especialista", color: "no_sugerir" });
  });

  // Decisión: `normal` no viaja en el mapa. Así lo que emite el componente es
  // idéntico a lo que devuelve la API en `serviceLevels` (solo niveles
  // explícitos) y el PATCH no arrastra entradas redundantes.
  it("volver a «Lo hace» borra la clave en vez de guardar «normal»", () => {
    const { onChange } = renderLevels({ corte: "especialista", mechas: "no_sugerir" });

    const corte = screen.getByRole("radiogroup", { name: "Nivel de Corte" });
    fireEvent.click(within(corte).getByRole("radio", { name: "Lo hace" }));

    expect(onChange).toHaveBeenCalledWith({ mechas: "no_sugerir" });
    expect(onChange.mock.calls[0][0]).not.toHaveProperty("corte");
  });

  it("se puede cambiar el nivel con el teclado (flechas dentro del grupo)", async () => {
    const user = userEvent.setup();
    const { onChange } = renderLevels();

    const corte = screen.getByRole("radiogroup", { name: "Nivel de Corte" });
    within(corte).getByRole("radio", { name: "Lo hace" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith({ corte: "no_sugerir" });
  });

  it("dos instancias con distinto idPrefix no comparten los grupos de radios", () => {
    const onChange = vi.fn();
    render(
      <>
        <ProfessionalServiceLevels services={SERVICES} value={{}} onChange={onChange} idPrefix="alta" />
        <ProfessionalServiceLevels services={SERVICES} value={{}} onChange={onChange} idPrefix="edicion" />
      </>
    );

    const [primero, segundo] = screen.getAllByRole("radiogroup", { name: "Nivel de Corte" });
    const nombrePrimero = within(primero).getAllByRole("radio")[0].getAttribute("name");
    const nombreSegundo = within(segundo).getAllByRole("radio")[0].getAttribute("name");
    expect(nombrePrimero).not.toBe(nombreSegundo);
  });

  it("explica los tres niveles y deja claro que «No sugerir» no llega al cliente", () => {
    renderLevels();

    expect(
      screen.getByText(/se le asigna primero cuando el cliente no pide a nadie/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/si lo piden por su nombre, se reserva sin más/i)).toBeInTheDocument();
    expect(
      screen.getByText(/la recepcionista propone antes al más indicado/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/la recepcionista nunca se lo dice al cliente/i)
    ).toBeInTheDocument();
  });

  it("sin servicios no pinta ningún control y avisa dónde añadirlos", () => {
    render(
      <ProfessionalServiceLevels services={[]} value={{}} onChange={vi.fn()} idPrefix="vacio" />
    );

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText(/todavía no hay servicios/i)).toBeInTheDocument();
  });
});

describe("setServiceLevel", () => {
  it("añade y sustituye niveles explícitos sin tocar el resto", () => {
    expect(setServiceLevel({}, "corte", "especialista")).toEqual({ corte: "especialista" });
    expect(setServiceLevel({ corte: "especialista" }, "corte", "no_sugerir")).toEqual({
      corte: "no_sugerir",
    });
    expect(setServiceLevel({ corte: "especialista" }, "color", "no_sugerir")).toEqual({
      corte: "especialista",
      color: "no_sugerir",
    });
  });

  it("normaliza: nunca deja claves «normal», ni la cambiada ni las heredadas", () => {
    expect(setServiceLevel({ corte: "especialista", color: "normal" }, "corte", "normal")).toEqual(
      {}
    );
  });
});

describe("describeServiceLevels", () => {
  it("devuelve null si el negocio no tiene servicios", () => {
    expect(describeServiceLevels({ corte: "especialista" }, [])).toBeNull();
  });

  it("resume en positivo: especialidades por nombre, resto como «Lo hace todo»", () => {
    expect(describeServiceLevels({}, SERVICES)).toBe("Lo hace todo");
    expect(describeServiceLevels({ corte: "especialista" }, SERVICES)).toBe("Especialista en Corte");
    expect(describeServiceLevels({ corte: "especialista", color: "especialista" }, SERVICES)).toBe(
      "Especialista en Corte y Color"
    );
    expect(
      describeServiceLevels(
        { corte: "especialista", color: "especialista", mechas: "especialista" },
        SERVICES
      )
    ).toBe("Especialista en Corte, Color y Mechas");
  });

  it("acorta la lista de especialidades a partir de cuatro", () => {
    const many = [
      ...SERVICES,
      { id: "peinado", name: "Peinado" },
      { id: "barba", name: "Barba" },
    ];
    const value: ServiceLevelMap = Object.fromEntries(
      many.map((service) => [service.id, "especialista" as const])
    );
    expect(describeServiceLevels(value, many)).toBe("Especialista en Corte, Color y 3 más");
  });

  it("cuenta los «sin sugerir» y los combina con las especialidades", () => {
    expect(describeServiceLevels({ mechas: "no_sugerir" }, SERVICES)).toBe("1 sin sugerir");
    expect(
      describeServiceLevels({ corte: "especialista", color: "no_sugerir", mechas: "no_sugerir" }, SERVICES)
    ).toBe("Especialista en Corte · 2 sin sugerir");
  });

  it("ignora ids de servicios que ya no existen", () => {
    expect(describeServiceLevels({ borrado: "especialista", viejo: "no_sugerir" }, SERVICES)).toBe(
      "Lo hace todo"
    );
  });
});

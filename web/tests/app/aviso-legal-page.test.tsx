import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import AvisoLegalPage from "@/app/legal/aviso-legal/page";

describe("Aviso legal", () => {
  it("muestra la fecha de actualización en español", () => {
    render(<AvisoLegalPage />);

    const fecha = screen.getByText("4 de octubre de 2026");
    expect(fecha.tagName).toBe("TIME");
    expect(fecha).toHaveAttribute("datetime", "2026-10-04");
  });

  it("enlaza en el índice cada apartado, con su título y sin anclas rotas", () => {
    const { container } = render(<AvisoLegalPage />);

    const indice = screen.getByRole("navigation", { name: "Contenido de esta página" });
    const enlaces = within(indice).getAllByRole("link");
    const ids = enlaces.map((enlace) => enlace.getAttribute("href")!.slice(1));

    expect(enlaces.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ids).size).toBe(ids.length);

    enlaces.forEach((enlace, i) => {
      const apartado = container.querySelector(`section#${ids[i]}`);
      expect(apartado, `falta el apartado #${ids[i]}`).not.toBeNull();
      expect(apartado!.querySelector("h2")).toHaveTextContent(enlace.textContent!);
    });

    // Todos los apartados del documento están en el índice.
    expect(container.querySelectorAll("article section")).toHaveLength(enlaces.length);
  });

  it("publica los datos del titular que exige la LSSI-CE", () => {
    render(<AvisoLegalPage />);

    expect(screen.getByText("Miguel Martín Delgado, profesional autónomo")).toBeInTheDocument();
    expect(screen.getByText("49456776Z")).toBeInTheDocument();
    expect(screen.getByText(/08470 Sant Celoni/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "support@alhabla.ai" })[0]).toHaveAttribute(
      "href",
      "mailto:support@alhabla.ai"
    );
  });

  it("avisa de que la prueba pide método de pago y se cobra al terminar", () => {
    render(<AvisoLegalPage />);

    expect(screen.getByText(/se te pide un método de pago/)).toHaveTextContent(
      /se cobra automáticamente el plan que hayas elegido/
    );
  });
});
